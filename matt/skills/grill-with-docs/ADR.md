---
upstream: skills/engineering/grill-with-docs
own: []
---

# grill-with-docs の fork

## 合意のあと聞かずに to-spec に進む

matt は grilling と domain-modeling で止め、次の段はユーザーが `/to-spec` を打って進める。1 session で済む作業なら spec を飛ばして実装へ進め、とも書く。ユーザーが共通の理解に合意し、結論が作るものなら、`to-spec` の SKILL.md を読んでそのまま従うように変えた。毎回 `/to-spec` を打つ手間を省き、小さい作業でも決定を issue に残すため。`to-spec` はユーザーしか呼べないので、Skill tool ではなく本文を読ませる。

## to-tickets に進むかを agent が判断する

matt は spec のあと to-tickets に進むかを、作業が複数の session にまたがるかでユーザーが決める。spec を出したあと、作業が新しい 1 つの context window に収まらないと見たら、根拠を述べてから `to-tickets` の SKILL.md を読んで従い、収まると見たらそこで止まるように変えた。ユーザーにはこの見積もりがつかないため。誤った判断は、to-tickets がユーザーに粒度を確かめる段で止まる。
