# skill-chain

何をどう判定するか、なぜその形かは [README.md](README.md) にある。判定を変えたら README も合わせる。

fork が手動専用のスキルを呼ぶ書き方（ルートの CLAUDE.md の「スキルの 3 種類」の節）は、この mod に頼っている。判定を変えたら、その書き方が通るままかも確かめる。

## 実機で確かめた前提

`claude plugin test` の engine には組織の管理 plugin がいないので、次のことは単体テストが通っても崩れる。直すときは、ここに沿っているかを実機で確かめる。

- スキルの本文は、`tool.call` の中で `$.session.messages` を読んで得る。組織の管理 plugin `cc-plugin-sec-default` が、利用者側の `skill.prompt` と `session.append` の hook を飛ばすので、そこではスキルの本文を受け取れない。
- mod が返した本文（`tool.call` の答えの `context`）は model に届くが、`$.session.messages` には入らない。連鎖の 2 段目以降は、会話に残った Skill の `tool_use` のうち成功の `tool_result` がそろったものからスキル名を拾い、その SKILL.md をディスクから読み直す。
- `$.skill.prompt` はテストの `$` にはあるが、mod の `$` には無い。
- 置き場所は、role が user の text block で最初に出てくる「Base directory for this skill:」の行からだけ取る。`tool_result` はファイルやコマンドの出力で、後ろの行は呼び出しの引数で、どちらもスキル本文を装える。
- 名指しは、会話の文ではなくディスクの SKILL.md の本文で判定する。展開された文には引数が付く。
- opus は、一覧に無い名前を推測で呼ばないという system prompt の決まりに従い、名指しされた手動専用のスキルを Skill tool で呼ばずに済ませる。haiku はこの決まりがあっても呼ぶので、haiku で通っても `tool.describe` が効いた証拠にならない。
- 名指しを model に伝える場所は、Skill tool の説明文（`tool.describe`）のほかに実機で使えるものがない。スキル一覧の `prompt.attachment`（`skill_listing`）の hook は `-p` でも対話の画面でも呼ばれない。`command.run` の結果は `ref` だけで、置き場所も本文も持たない。`-p` では `prompt.submit` と `command.run` の時点で `$.session.messages` が空なので、そこで会話を読む作りは `-p` では動かない。
- 呼ばれるスキル自身の本文と、成功の結果がない Skill の呼び出し（失敗したもの、同じ返答で並べてまだ結果がないもの）は根拠から外す。入れると、断られる途中のスキルが根拠になる。

## 確かめ方

実機の確認は `fixture/live.sh` で流す。`--setting-sources project` で利用者の入れた plugin を外し（組織の管理 plugin は残る）、checkout の skill-chain を `--plugin-dir` で読ませ、opus で `-p` を流して、会話の記録の Skill の呼び出しで合否を出す。`--bare` はログインを読まず、`--safe-mode` は `--plugin-dir` も外すので、どちらも使えない。

```sh
L=mods/skill-chain/fixture/live.sh
sh $L -p mods/skill-chain/fixture callee,deep '/chainfix:caller'
sh $L -p mods/skill-chain/fixture callee,deep 'Use the Skill tool to run the chainfix:caller skill.'
sh $L -p mods/skill-chain/fixture '!deep' 'Use the Skill tool to run the chainfix:deep skill. Do not read any file.'
sh $L -p . in-your-own-words '/dawkinsuke:grilling 社内 wiki に全文検索を足したい'
```

- 合否は、期待したスキルの Skill tool の呼び出しに、エラーでない結果が返ったか（`!name` なら断られたか）で決める。opus が Skill を呼ばずに自分で済ませると断りの文言も出ないので、文言が無いだけでは通ったことにしない。`PINEAPPLE-42` が返らないだけなら model の判断の揺れで、mod の失敗ではない。
- 最後の行は、`fixture/` の 1 つの置き場所では通らない経路（`matt/skills` の `grilling` から `pstack/skills` の `in-your-own-words`）を見る。
- 終わりの手順が後ろのターンにあるスキルは、プロンプトを続けて渡すと同じ session で次のターンを流す。`ends=` に `error_max_turns` が出たら、期待の場面まで届いていないので `-t` を上げる。
- 判定そのものは `sh mods/skill-chain/fixture/live.test.sh` で、model を呼ばずに確かめられる。
