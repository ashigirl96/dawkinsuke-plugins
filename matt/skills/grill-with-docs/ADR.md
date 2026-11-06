---
upstream: skills/engineering/grill-with-docs
own: []
---

# grill-with-docs の fork

## 合意の直後に、収まるかを agent が判断して次の段へ進む

matt は grilling と domain-modeling で止め、spec と to-tickets に進むか、spec を書かずに同じ context で実装するかを、作業が複数の session にまたがるかでユーザーが決めて打つ。合意して結論が作るものなら、作業が新しい 1 つの context window に収まるかを根拠と一緒に agent が判断し、聞かずに次の段へ進むように変えた。収まらなければ Skill tool で `to-spec`、続けて `to-tickets` を呼ぶ（どちらも手動専用だが、mod の `skill-chain` が通す）。ユーザーにはこの見積もりがつかず、毎回次の段を打つ手間も省くため。誤った判断は、to-tickets がユーザーに粒度を確かめる段で止まる。

## 収まる作業は spec を経ずに Bench へ fork する

matt は 1 session に収まる作業を、spec を書かずに同じ context で実装させる。収まる作業は、結論とテストする境目を数行書いた issue を立て、`monica task run <url> --fork "$CLAUDE_CODE_SESSION_ID"` で今の会話を Bench の Tab へ fork して止まるように変えた。最初の prompt の `/tackle` には、issue を取りに行かず会話の決定から始めることと、会話の path が元の checkout を指すこと、grill で書いた ADR と用語集の変更をまず元の checkout から worktree へ移すことを添える。commit されていないそれらの変更は、fork しても worktree に届かないため。この plugin は monica の Tab の中（issue tracker は GitHub）でしか使わないので、monica の外の分岐は持たない。会話という一次情報のまま worktree で実装を始め、Bench に要る issue と決定の記録を spec より安く残し、会話を写しただけの issue を読み直して context を使わないため。
