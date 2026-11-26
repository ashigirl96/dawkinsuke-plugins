---
upstream: plugins/pstack/skills/thermos
own: []
---

# thermos の fork

## subagent を dawkinsuke の名前空間で呼ぶ

upstream は 2 つの review の subagent を `pstack:thermo-nuclear-review-subagent` と `pstack:thermo-nuclear-code-quality-review-subagent` で指定する。`dawkinsuke:` 付きに変えた。plugin の agent は plugin 名の名前空間で登録され、dawkinsuke に取り込むと `pstack:` の名前は存在しないため。
