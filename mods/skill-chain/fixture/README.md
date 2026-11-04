# chainfix

skill-chain を手で試すための仮のスキル。`caller` が `callee` を、`callee` が `deep` を呼ぶよう書いてあり、`callee` と `deep` は `disable-model-invocation: true`。

まとめて流すときは `live.sh` を使う。手順と合否は [../CLAUDE.md](../CLAUDE.md) の「確かめ方」にある。

手で打つときは、repo のルートで起動する。`--setting-sources project` で、利用者の設定で入れている plugin を外す。opus で試す。haiku は一覧に無い名前でも Skill tool を呼ぶので、mod が model に呼ばせているかを見分けられない。

```sh
claude --model opus --setting-sources project --plugin-dir mods/skill-chain --plugin-dir mods/skill-chain/fixture
```

次の 3 つを打つ。

1. `/chainfix:caller`: Skill tool で `callee` → `deep` と呼ばれ、`PINEAPPLE-42` が返る。
2. `Use the Skill tool to run the chainfix:caller skill.`: model から呼んでも同じ。
3. `Use the Skill tool to run the chainfix:deep skill. Do not read any file.`: どのスキルにも名指しされていないので、Skill tool で呼ばれて断られる。

1 と 2 は、Skill tool で `callee` と `deep` が呼ばれ、`cannot be used with Skill tool due to disable-model-invocation` が出ないことで合格。呼ばれずに model が自分で済ませたら、文言が出なくても mod の失敗。`PINEAPPLE-42` が返らないだけなら、model が手順に従わなかっただけのこともある。
