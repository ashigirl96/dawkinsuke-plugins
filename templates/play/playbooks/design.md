# 設計→実装

何かを作りたい・変えたい（「〇〇したい」）という依頼で選ぶ。聞き取りで設計を固め、用語と決定を記録してから、収まる作業は issue にして Bench に渡し、収まらない作業は spec とチケットに切る。

1. Skill tool で `grilling` を呼び、続けて `domain-modeling` を呼ぶ。ユーザーが共有した理解を認めるまで聞き取り、その間に決まった用語と決定を記録する。
2. 結論が作るものでなければ、残りの手順をすべて `skip:` にして止まる。作るものなら、その作業が新しい context window 1 つに収まるかを判断する。先に根拠を述べる: 触るモジュールと、見込む tracer-bullet の切り口。判断はユーザーに聞かずに下す。
3. 収まるなら、テストを掛ける継ぎ目（seam）をユーザーと確かめる。聞き取りで決まっていれば `skip:` にする。
4. 収まるなら、`ready-for-agent` ラベルを付けた issue を出す。本文には、合意した決定を数行にまとめたもの、継ぎ目、この session で足した ADR と用語集の用語だけを書く。
5. 収まるなら、Skill tool で `fork-to-bench` を、4 の issue の URL と次の prompt で呼び、止まる。`<この checkout>` は今の作業ディレクトリの path にする。

   ```text
   /tackle issue は取りに行かず、この会話の決定から始める。issue は決定を記録しただけ。この会話の前半の path は <この checkout> を指す。まず、この session が <この checkout> で足した ADR と用語集の変更を今のディレクトリへ移し、<この checkout> では元に戻す。そのあとは今のディレクトリの下だけを編集する。
   ```

6. 収まらないなら、Skill tool で `to-spec` を呼ぶ。
7. 収まらないなら、Skill tool で `to-tickets` を呼ぶ。

## 理由

- **2 で収まるかを agent が判断し、聞かずに次へ進む。** ユーザーには、作業が 1 つの context window に収まるかの見積もりがつかず、毎回次の段を選んで打つ手間もかかるため。誤った判断は、`to-tickets` がユーザーに粒度を確かめる段で止まる。
- **収まる作業は spec を経ずに Bench へ fork する。** 会話という一次情報のまま worktree で実装を始め、Bench に要る issue と決定の記録を spec より安く残し、会話を写しただけの issue を読み直して context を使わないため。prompt で ADR と用語集の変更を移させるのは、commit していない変更は fork しても worktree に届かないため。
