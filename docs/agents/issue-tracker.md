# Issue tracker: GitHub

この repo の issue と spec は GitHub の issue に置く。操作はすべて `gh` CLI で行う。

## 操作の決まり

- **issue を作る**: `gh issue create --title "..." --body "..."`。本文が複数行になるときは heredoc を使う。
- **issue を読む**: `gh issue view <number> --json number,title,body,labels,comments`。
- **issue を一覧する**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` に、必要な `--label` と `--state` を付ける。
- **親 issue の sub-issue にする**: `gh issue create --parent <parent> ...`、または後から `gh issue edit <parent> --add-sub-issue <child>`（`gh` 2.94 以降）。古い `gh` では `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（database id。下の **依存関係** と同じ）。sub-issue が使えなければ、子の本文の先頭に `Part of #<parent>` と書く。
- **依存関係**: GitHub の **native issue dependencies** を正とする。UI にも出る。`gh issue create --blocked-by <n>,<n> ...` か `gh issue edit <child> --add-blocked-by <blocker>`（`gh` 2.94 以降）で足す。古い `gh` では `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`。`<blocker-db-id>` は blocker の数値の **database id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`）で、`#number` や `node_id` では _ない_。依存関係が使えなければ、子の本文の先頭に `Blocked by: #<n>, #<n>` と書く。blocker がすべて close されたら着手できる。
- **開いている blocker を数える**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`（開いている blocker だけを数え、0 なら着手できる）。`gh issue view <n> --json blockedBy` は close 済みの blocker も返すので、`--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'` で絞る。
- **comment する**: `gh issue comment <number> --body "..."`
- **ラベルを付ける・外す**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **close する**: 理由を `gh issue comment <number> --body "..."` で書いてから `gh issue close <number>`。close 済みの issue に `gh issue close --comment` を使うと、comment は捨てられるのに exit 0 で終わる。

repo は `git remote -v` から決まる。clone の中で `gh` を走らせれば自動で決まる。

issue はユーザー自身の repo にだけ作る。ユーザーが持ち主でない限り、これらのスキルの出どころである `mattpocock/skills` には作らない。fork の中では `gh` が upstream の親を既定にすることがあるので、session で最初に `gh issue create` する前に `gh repo view --json nameWithOwner` で対象を確かめ、ユーザーの repo でなければユーザーに確認する。

## PR を triage の対象にするか

**PRs as a request surface: no.** _（外部からの PR を機能の要望として扱うなら `yes` にする。`/triage` がこの値を読む。）_

`yes` のときは、PR も issue と同じラベルと状態で扱い、`gh pr` の同等のコマンドを使う。

- **PR を読む**: `gh pr view <number>`、続けて `gh pr view <number> --comments`（TTY でないと `--comments` は本文を出さず comment だけを出す）、差分は `gh pr diff <number>`。
- **triage する外部 PR を一覧する**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **comment・ラベル・close**: `gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub では issue と PR が同じ番号の並びを使うので、`#42` だけではどちらか分からない。`gh pr view 42` で調べ、だめなら `gh issue view 42` を使う。

## スキルが「publish to the issue tracker」と言ったとき

GitHub の issue を作る。

## スキルが「fetch the relevant ticket」と言ったとき

上の **issue を読む** のとおりに読む。

## Wayfinding の操作

`/wayfinder` が使う。**map** は 1 つの issue で、その **child** の issue が ticket になる。

- **Map**: `wayfinder:map` ラベルを付けた issue 1 つ。本文に Notes / Decisions-so-far / Fog を持つ。`gh issue create --label wayfinder:map`。
- **Child ticket**: map の sub-issue としてつないだ issue（**親 issue の sub-issue にする** を参照）。sub-issue が使えなければ、map の本文の task list に子を足し、子の本文の先頭に `Part of #<map>` と書く。ラベルは `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。着手したら、作業する開発者を assign する。
- **依存関係**: 操作の決まりの **依存関係** を参照。
- **Frontier query**: map の開いている子を一覧し（`gh issue list --state open` を map の sub-issue か task list に絞る）、開いている blocker があるもの（**開いている blocker を数える**、または `Blocked by` 行の開いている issue）と assignee がいるものを外す。map の並びで最初のものを取る。
- **Claim**: `gh issue edit <n> --add-assignee @me`。session で最初の書き込みにする。
- **Resolve**: `gh issue comment <n> --body "<answer>"`、続けて `gh issue close <n>`、そのあと map の Decisions-so-far に要点とリンクを足す。
