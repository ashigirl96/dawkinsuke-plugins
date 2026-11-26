---
upstream: plugins/pstack/skills/no-comments
own: []
---

# no-comments の fork

## subagent を dawkinsuke の名前空間で呼ぶ

upstream は comment-sicko を `pstack:comment-sicko` で指定する。`dawkinsuke:comment-sicko` に変えた。plugin の agent は plugin 名の名前空間で登録され、dawkinsuke に取り込むと `pstack:` の名前は存在しないため。
