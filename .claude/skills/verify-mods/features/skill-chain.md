# 手動専用のスキルを連鎖で呼ぶ

手動専用のスキル（前書きが `disable-model-invocation: true`）は、ふつう Skill tool から呼ぶと断られる。skill-chain を入れると、会話で使ったスキルの本文が名指しした手動専用のスキルだけは、Skill tool から呼べる。名指しのないものは今までどおり断られる。判定の中身は `mods/skill-chain/README.md` にある。

## Sub-features

- `typed`: 人が `/chainfix:caller` と打つ → `callee` → `deep` と連鎖する。
- `model`: model が Skill tool で `caller` を呼んでも、同じく連鎖する。
- `unnamed`: どのスキルにも名指しされていない `deep` を直に呼ぶと断られる。

## How to get to it (user POV)

- fork したスキルが「Skill tool で `<name>` を呼ぶ」と書いていて、その先が手動専用のとき。たとえば `grill-with-docs` から `to-spec` を呼ぶ。

## Driving it with tui.sh

Preconditions:

- `mods/skill-chain/fixture/` がある（`caller` → `callee` → `deep`、後ろの 2 つが手動専用）。

画面を見ずに記録だけで足りるときは、`mods/skill-chain/fixture/live.sh` が同じ経路を `-p` で流して合否を出す（`mods/skill-chain/CLAUDE.md` の「確かめ方」）。画面で確かめるときは、経路ごとに新しい session を起こし、会話の記録を証拠にする。

```sh
sid=$(uuidgen | tr A-Z a-z); echo $sid
$T start chain1-$id --setting-sources project --plugin-dir mods/skill-chain --plugin-dir mods/skill-chain/fixture --model opus --session-id <sid>
```

| 経路 | session | 打つ文 |
| --- | --- | --- |
| typed | `chain1-$id` | `/chainfix:caller` |
| model | `chain2-$id` | `Use the Skill tool to run the chainfix:caller skill.` |
| unnamed | `chain3-$id` | `Use the Skill tool to run the chainfix:deep skill. Do not read any file.` |

打ったら `$T wait <session> 'PINEAPPLE|disable-model-invocation' 120`、続けて `$T turn <session> 1` を待ち、`$T shot` と会話の記録の写しを残す。

```sh
cp ~/.claude/projects/$(pwd | tr '/.' '--')/<sid>.jsonl "$run/chain-<経路>.jsonl"
grep -c 'cannot be used with Skill tool due to disable-model-invocation' "$run/chain-<経路>.jsonl"
grep -o '"name":"Skill","input":{[^}]*}' "$run/chain-<経路>.jsonl"
```

- typed と model: Skill の呼び出しに `callee` と `deep` が並び、禁止の文言が 0 件。
- unnamed: Skill の呼び出しに `deep` があり、禁止の文言が 1 件以上。

## Gotchas

- 合否は、Skill の呼び出しと禁止の文言 `cannot be used with Skill tool due to disable-model-invocation` の有無で決める。opus が Skill を呼ばずに自分で済ませると文言も出ないので、文言が無いだけでは合格にしない。haiku は一覧に無い名前でも呼ぶので、`--model opus` で流す。`PINEAPPLE-42` が返らないだけなら、model が mod の返した本文に従わなかっただけのことがある。そのときは Skill の呼び出しと結果を記録から写して報告する。
- unnamed の経路で model が SKILL.md を Read して従うと、断られた後でも `PINEAPPLE-42` が出る。合否は禁止の文言で見る。
- `--setting-sources project` を外すと、利用者が入れた skill-chain と checkout の skill-chain が両方 `tool.call` に掛かる。
- 組織の管理 plugin（`cc-plugin-sec-default`）は `--setting-sources project` でも残る。それが前提の作りなので、外す手段を探さない（`mods/skill-chain/CLAUDE.md`）。
