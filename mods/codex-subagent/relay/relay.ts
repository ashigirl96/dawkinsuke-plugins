// Relays between the mod and `codex app-server`: the mod's $.process.spawn writes stdin only once and its $.http.fetch is one request, one response.
// POST /rpc {method, params} answers codex's response, POST /send writes a message as is, GET /events hands over what codex sent unasked.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

type Message = { id?: number | string; method?: string; result?: unknown; error?: unknown }

// $.http.fetch gives up after 30 seconds.
const EVENTS_WAIT_MS = 20_000

const socket = `${mkdtempSync(`${tmpdir()}/codex-subagent-`)}/relay.sock`
const codex = Bun.spawn(['codex', 'app-server'], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' })

const write = (message: Message) => {
  codex.stdin.write(`${JSON.stringify(message)}\n`)
  codex.stdin.flush()
}

let nextId = 1
const pending = new Map<number, (message: Message) => void>()
const events: Message[] = []
let wake = () => {}

void (async () => {
  let buffer = ''
  for await (const chunk of codex.stdout.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (!line.trim()) continue
      const message: Message = JSON.parse(line)
      const answer = message.method === undefined && typeof message.id === 'number' ? pending.get(message.id) : undefined
      if (answer) {
        pending.delete(message.id as number)
        answer(message)
      } else {
        events.push(message)
        wake()
      }
    }
  }
})()

const stop = () => {
  codex.stdin.end()
  void codex.exited.then(() => process.exit(0))
}

Bun.serve({
  unix: socket,
  idleTimeout: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname
    if (path === '/rpc') {
      const { method, params } = await req.json()
      const id = nextId++
      const answered = new Promise<Message>(resolve => pending.set(id, resolve))
      write({ id, method, params })
      return Response.json(await answered)
    }
    if (path === '/send') {
      write(await req.json())
      return Response.json({})
    }
    if (path === '/events') {
      if (!events.length) await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, EVENTS_WAIT_MS)
        wake = () => (clearTimeout(timer), resolve())
      })
      wake = () => {}
      return Response.json({ events: events.splice(0) })
    }
    if (path === '/shutdown') {
      stop()
      return Response.json({})
    }
    return new Response('not found', { status: 404 })
  },
})

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
void codex.exited.then(code => process.exit(code))
// Claude Code killed without a goodbye leaves this relay to init; codex goes with it.
setInterval(() => process.ppid === 1 && stop(), 5_000)

console.log(JSON.stringify({ socket }))
