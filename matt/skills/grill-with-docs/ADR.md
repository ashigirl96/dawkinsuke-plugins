---
upstream: skills/engineering/grill-with-docs
own: []
---

# grill-with-docs の fork

## 合意の直後に、収まるかを agent が判断して次の段へ進む

matt は grilling と domain-modeling で止め、spec と to-tickets に進むか、spec を書かずに同じ context で実装するかを、作業が複数の session にまたがるかでユーザーが決めて打つ。合意して結論が作るものなら、作業が新しい 1 つの context window に収まるかを根拠と一緒に agent が判断し、聞かずに次の段へ進むように変えた。収まらなければ Skill tool で `to-spec`、続けて `to-tickets` を呼ぶ（どちらも手動専用だが、mod の `skill-chain` が通す）。ユーザーにはこの見積もりがつかず、毎回次の段を打つ手間も省くため。誤った判断は、to-tickets がユーザーに粒度を確かめる段で止まる。

## 実装せず、収まる作業も spec の起票で止める

matt は 1 session に収まる作業を、spec を書かずに同じ context で実装させる。収まる作業も Skill tool で `to-spec` だけを呼んで spec を起票し、収まらない作業と同じく issue を立てたところで止めるように変えた。実装は `/tackle` や `/implement` で別の session から始めるため。matt も spec を context window が終わるから書くものとし、小さい作業は `implement` が spec を直接受け取る。
