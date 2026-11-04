# chainfix

skill-chain を手で試すための仮のスキル。`caller` が `callee` を、`callee` が `deep` を呼ぶよう書いてあり、`callee` と `deep` は `disable-model-invocation: true`。

repo のルートで起動する。`--setting-sources project` で、利用者の設定で入れている plugin を外す。

```sh
claude --setting-sources project --plugin-dir mods/skill-chain --plugin-dir mods/skill-chain/fixture
```

次の 3 つを打つ。

1. `/chainfix:caller`: `callee` → `deep` と呼ばれ、`PINEAPPLE-42` が返る。
2. `Use the Skill tool to run the chainfix:caller skill.`: model から呼んでも同じ。
3. `Use the Skill tool to run the chainfix:deep skill.`: どのスキルにも名指しされていないので断られる。

1 と 2 で `cannot be used with Skill tool due to disable-model-invocation` が出たら mod の失敗。`PINEAPPLE-42` が返らないだけなら、model が手順に従わなかっただけのこともある。
