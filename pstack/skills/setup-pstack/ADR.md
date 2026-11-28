---
upstream: plugins/pstack/skills/setup-pstack
own: []
---

# setup-pstack の fork

## repo ごとの表を repo-local の隣に置き、CLAUDE.local.md からたどって読み込む

upstream は Claude Code の repo ごとの表を `.claude/pstack-models.md` に置いて commit させ、repo のルートの `CLAUDE.md` に `@.claude/pstack-models.md` を足す。表を `~/.claude/repo-local/<host>/<owner>/<repo>.pstack-models.md` に置き、`CLAUDE.local.md` から repo-local の `<repo>.md`、そこから表へと `@` でたどって読み込む形にした。`CLAUDE.local.md` が無ければ import の 1 行だけで作り、`.worktreeinclude` も作る。どの model を使うかは手元の契約や好みで決まるので repo に commit せず、private な指示の置き場の決まりにそろえ、worktree からも同じ表を読めるようにするため。
