---
upstream: skills/engineering/domain-modeling
own: []
---

# domain-modeling の fork

## ADR はユーザーに頼まれたときだけ書き、提案しない

matt は、戻しにくく、文脈なしには意外で、本当のトレードオフから生まれた決定のとき、agent から ADR を残すよう提案させる。ユーザーが ADR を残したいと言ったときだけ書き、agent からは提案しないように変え、提案の判定基準（`ADR-FORMAT.md` の `When to offer an ADR`）も消した。agent の判定では残す価値の薄い ADR が溜まり、`docs/adr/` が読まれなくなるため。
