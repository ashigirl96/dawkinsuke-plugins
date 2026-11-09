---
name: browser-profile
description: agent-browser でサイトを、普段のブラウザのプロファイル（`Work`・`Personal` のような表示名）のログイン状態で開く。agent-browser の作業でプロファイルを指定されたときに使う。
---

プロファイルの写しを、ウィンドウを出さないブラウザで起動し、agent-browser をそこへつなぐ。写しには cookie と保存済みのログインが入り、普段のタブとウィンドウは入らない。起動と片付けは [`scripts/browser-profile.sh`](scripts/browser-profile.sh) がする。

1. **起動する。** この作業に固有の session 名を決め、次を流す。プロファイルは表示名でもディレクトリ名（`Profile 3`）でもよい。

   ```sh
   sh <この skill のディレクトリ>/scripts/browser-profile.sh launch <プロファイル> <session> <url>
   ```

   最後に出た URL が開きたいページなら完了。ログイン画面の URL が出たら、写しの元のプロファイルにその site の cookie が無い。片付けの手順を流してから、ユーザーに普段のブラウザのそのプロファイルでログインしてもらい、起動し直す。写しは起動した時点のもので、後からのログインは入らない。

2. **操作する。** Skill tool で `agent-browser` を呼び、その手順で操作する。どの命令にも `--session <session>` だけを付ける。ブラウザは起動済みでつながっているので、起動の flag は script に任せる。作業の成果を記録したら完了。

3. **片付ける。** 次を流す。agent-browser の `close` はつないだ session を切り離すだけで、起動したブラウザと写しは残るため、こちらで止める。

   ```sh
   sh <この skill のディレクトリ>/scripts/browser-profile.sh cleanup <session>
   ```

   報告に、止めた session 名と、戻すときは手順 1 を流し直すことを 1 行で書く。
