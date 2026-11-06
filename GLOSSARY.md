# dawkinsuke-plugins

自分専用の Claude Code プラグイン dawkinsuke と、その元になる upstream のスキル集を扱う。

## Language

**adapter**:
pstack のスキルを fork するときに、Cursor の名前を Claude Code の名前に書き換える決まりの表。
_Avoid_: harness doc、対応表

**model 系統**:
同じ作り手の model の群で、model 名の接頭辞で区切る。`claude-*` と `gpt-*` は別の系統で、間に入る仕組み（codex subagent など）の名前では区切らない。
_Avoid_: family、provider

**codex subagent**:
`gpt-*` の model 系統を頭脳に持ち、親から Claude の subagent と同じ形で任されて、codex が自分の tool で最後まで走らせる agent。
_Avoid_: GPT subagent、GPT の subagent

**モデル表**:
repo ごとに、pstack のスキルの役割（`arena runners`・`swarm workers` など）ごとに使う model と推論の強さを書いた表。
_Avoid_: models.md、pstack-models、override sheet、モデル設定

**部品スキル**:
1 つのことだけをし、他のスキルやプレイブックから組み合わされる前提のスキル。流れ全体を握らない。
_Avoid_: primitive skill、基本スキル

**プレイブック**:
ある意図（設計したい・バグを調べたい など）に対し、部品スキルを呼ぶ順番を書いた手順書。各 repo の中にあり、使うたびに書き足されて育つ。スキルではなく、`/play` だけが読む。
_Avoid_: playbook、ワークフロー、手順スキル
