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
- 呼ばれるスキル自身の本文と、成功の結果がない Skill の呼び出し（失敗したもの、同じ返答で並べてまだ結果がないもの）は根拠から外す。入れると、断られる途中のスキルが根拠になる。

## 確かめ方

`fixture/` は `caller` → `callee` → `deep` と呼ぶ 3 つのスキルの plugin で、後ろの 2 つが禁止付き。`--setting-sources project --plugin-dir mods/skill-chain --plugin-dir mods/skill-chain/fixture` で読ませ、次の 3 つの経路を流す。`--setting-sources project` は利用者の設定で入れた plugin を外し、組織の管理 plugin は残すので、他の mod に邪魔されずに本番と同じ条件で見られる。`--bare` はログインを読まず、`--safe-mode` は `--plugin-dir` も外すので、どちらも使えない。

| 経路 | prompt | 期待 |
| --- | --- | --- |
| 人が打つ | `/chainfix:caller` | Skill の結果に禁止の文言が出ない |
| model が呼ぶ | `Use the Skill tool to run the chainfix:caller skill.` | 同上 |
| 名指しなし | `Use the Skill tool to run the chainfix:deep skill. Do not read any file.` | 禁止の文言で断られる |

禁止の文言は `cannot be used with Skill tool due to disable-model-invocation`。合否はこの文言の有無で決める。haiku は mod が返した本文に従うのをためらうことがあるので、`PINEAPPLE-42` が返らないだけなら model の判断の揺れで、mod の失敗ではない。
