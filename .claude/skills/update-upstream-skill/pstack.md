# pstack の版の扱い

cursor/plugins にはタグがないので、pstack の `plugin.json` の `version` を上げた commit で版を切る。`<旧版>` と `<新版>` はその commit。

## 版を上げる

1. `CLAUDE.md` の「使っている版」から、旧 version と旧版の commit を読む。
2. `git -C upstream/cursor-plugins fetch origin` を流す。
3. `git -C upstream/cursor-plugins log -1 --format=%h -G'"version"' origin/main -- harness/pstack/claude-code/.claude-plugin/plugin.json` で新版を決め、`git -C upstream/cursor-plugins show <新版>:harness/pstack/claude-code/.claude-plugin/plugin.json | grep '"version"'` で新 version を読む。新 version が旧 version と同じなら、そう報告して終える。
4. `git -C upstream/cursor-plugins ls-tree -d <新版> harness/pstack/claude-code/skills` が何も返さなければ、bucket が移っている。このまま進むと `sync-skills.sh` が symlink をすべて消すので、止めてユーザーに報告する。
5. `git -C upstream/cursor-plugins checkout <新版>` を流す。
6. `CLAUDE.md` の「使っている版」を新 version と新版の commit に書き換える。

完了条件: `git -C upstream/cursor-plugins rev-parse --short HEAD` が新版を返し、`CLAUDE.md` の version と commit も新しいものになっている。

## 増えたスキル

pstack のスキルは大半を除外しているので、`added <name>` ごとに `upstream/cursor-plugins/harness/pstack/claude-code/skills/<name>/SKILL.md` の description を示し、使うか除外するかを `AskUserQuestion` でユーザーに聞く。除外するなら `upstream/exclude.txt` に `cursor-plugins/<name>` を足す。

## 思想の範囲

`harness/pstack`。skill・agent・playbook・`docs/`・`README.md` のすべてで、除外中のスキルも含める。思想の文書は、使っているスキルだけでなく集全体から作者の考えを読んでいるため。

## 報告に足すもの

旧 version と新 version。
