---
name: setup-dawkinsuke
description: この repo で dawkinsuke を使う準備をする。repo-local の指示ファイル、matt のスキルの設定、pstack のモデル表、`/play` のひな形をそろえる。
disable-model-invocation: true
---

4 つの段を順に進める。どの段も、既にあるものは書き換えない。2 回流しても、モデル表のほかは何も変わらない。

この下で `<root>` は `git rev-parse --show-toplevel`、`<this>` はこのスキルのディレクトリ（「Base directory for this skill」の path）を指す。

## 1. repo-local の指示ファイル

`sh <this>/scripts/repo-local.sh` を `<root>` で流し、`<host>/<owner>/<repo>` を得る。exit 1 なら、origin が無いか読めない形なので、その URL を伝えて止まる。以下、`<local>` は `~/.claude/repo-local/<host>/<owner>/<repo>` を指す。

- `<local>.md` が無ければ、`# <owner>/<repo>` の 1 行で作る。あれば触らない。
- `<root>/CLAUDE.local.md` が無ければ、`@<local>.md` の 1 行で作る（`~` は展開せずに書く）。あれば触らない。ただしその中身が import の 1 行でなければ、中身を `<local>.md` に移して 1 行に置き換えるよう、ユーザーに頼む。

## 2. matt のスキルの設定

`<root>` の `CLAUDE.md` か `AGENTS.md` に `## Agent skills` の節があり、`docs/agents/` があれば、設定済みなので飛ばす。無ければ Skill tool で `setup-matt-pocock-skills` を呼ぶ。

## 3. モデル表

pstack のスキルが subagent に使う model を、役割ごとに `<local>-models.md` に書く。この段だけは、確かめたうえで書き直してよい。

1. **model を検出する。** 次の 2 つだけが書ける model になる。検出していない model は書かない。
   - Agent tool の `model` が受け付ける名前（`opus`・`sonnet`・`haiku`・`fable` など）。
   - Agent tool の subagent の種類のうち、`codex-subagent:` で始まり、説明が「Delegates to `<model>`」のものの `<model>`（`gpt-6.1-sol` など）。
   - `inherit-parent` と `auto` は検出しなくても書ける。どちらも親の session の model で走らせる。
2. **今の値を決める。** `<local>-models.md` があれば、その値を今の値にする。無ければ次の既定から始める。既定は adapter（`../../pstack/docs/harness/claude-code.md`）の Models の節にある役割の一覧と同じ。

   | 役割 | 既定 |
   | --- | --- |
   | `arena runners` | `opus @xhigh, gpt-6.1-sol` |
   | `arena cross-judge pool` | `opus @xhigh, gpt-6.1-sol` |
   | `architect runners` | `opus @xhigh, gpt-6.1-sol` |
   | `interrogate reviewers` | `opus @xhigh, gpt-6.1-sol` |
   | `swarm workers` | `gpt-6.1-sol` |
   | `how explorer` | `gpt-6.1-sol` |
   | `how explainer` | `opus @xhigh` |
   | `why investigators` | `gpt-6.1-sol` |
   | `why synthesizer` | `opus @xhigh` |
   | `reflect tooling` | `gpt-6.1-sol` |
   | `reflect judgment, divergent, synthesizer` | `opus @xhigh` |
   | `default effort` | `session` |

   この一覧に無い役割の行は捨て、捨てた行を 3 で見せる。
3. **確かめる。** 役割ごとに今の値を見せ、検出していない model を含む値には「選び直しが要る」と印を付ける。そのまま使うか、どの役割を変えるかを AskUserQuestion で聞く。選択肢は検出した model と `inherit-parent`・`auto`。
   - 値は `<model>` か `<model> @<level>`。level は `low`・`medium`・`high`・`xhigh`・`max`。suffix の無い値は `default effort` の行に従う。
   - `runners`・`pool`・`reviewers` の役割は並び。1 つの値ごとに subagent が 1 つ走るので、並びの長さが数になる。各値が自分の suffix を持てる。`arena cross-judge pool` は、親と別の系統の値を並びの順に試すので、好みの順に並べる。
   - 続けて `default effort` を聞く。`session`（親の session の effort のまま）か level のどれか。
4. **書く。** `<local>-models.md` 全体を次の形で書き直す。値は 3 で決めたもの。

   ```markdown
   # pstack model configuration

   pstack のスキルが役割ごとに使う model。行を消すと、その役割はスキルの既定に戻る。`inherit-parent` と `auto` は親の session の model で走らせる。値の `@<level>`（low・medium・high・xhigh・max）は、その役割の subagent の effort になり、並びの値は 1 つずつ自分の suffix を持てる。suffix の無い値は `default effort` に従い、`session` なら親の session の effort のまま走る。

   arena runners: <値>
   arena cross-judge pool: <値>
   architect runners: <値>
   interrogate reviewers: <値>
   swarm workers: <値>
   how explorer: <値>
   how explainer: <値>
   why investigators: <値>
   why synthesizer: <値>
   reflect tooling: <値>
   reflect judgment, divergent, synthesizer: <値>

   default effort: <値>
   ```

5. **検査する。** `sh <this>/scripts/check-sheet.sh <local>-models.md` を流す。`sheet ok` でなければ、出た問題を直して書き直し、通るまで繰り返す。
6. **読み込ませる。** `<local>.md` に `@<local>-models.md` の行（`~` は展開しない）が無ければ、末尾に足す。

## 4. `/play` のひな形

`<root>/.claude/skills/play/` があれば、育てたプレイブックなので触らずに飛ばす。無ければ、次を `<root>` で流す。

```sh
mkdir -p .claude/skills
cp -R <this>/../../templates/play .claude/skills/play
cp <this>/../../pstack/docs/harness/principles.md .claude/skills/play/principles.md
```

`play` を commit するかは、その repo の `tackle` と同じ扱いにする。`git check-ignore -q .claude/skills/tackle/SKILL.md` が通れば、`tackle` を無視させている仕組み（`.gitignore` か `.git/info/exclude`）に `.claude/skills/play/` を足す。通らなければ何もしない。commit はユーザーに任せる。

## 終わりに

段ごとに、作ったもの・飛ばしたもの・書き直したものを 1 行ずつ伝える。最後に、`/play 〇〇したい` と `/play 〇〇がバグってそう` で使えること、プレイブックは `.claude/skills/play/playbooks/` に Skill tool で `writing-playbooks` を呼んでから書き足すことを伝える。
