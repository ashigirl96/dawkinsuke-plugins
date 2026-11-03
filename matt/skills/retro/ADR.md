---
upstream: skills/engineering/retro
own: []
---

# retro の fork

## モデルからも呼べるようにする

matt は frontmatter に `disable-model-invocation: true` を置き、ユーザーが `/retro` と打ったときだけ動くようにしている。この行を消した。「振り返って」と頼んだときや、他のスキル・subagent からも Skill tool で retro を呼べるようにするため。
