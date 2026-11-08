# dawkinsuke-plugins

自分専用の Claude Code プラグイン dawkinsuke と、その元になる upstream のスキル集を扱う。

## Language

**スキル台帳**:
dawkinsuke が知っているスキル 1 つにつき 1 行で、その種類・置き場・key・呼ばれる名前・除外中かを答える一覧。使っているスキルのほか、除外中のものと、取り込み元の外にある upstream のものも載る。
_Avoid_: レジストリ、スキル一覧、layout

**置き場**:
plugin がスキルを読み込むディレクトリ。`skills/`・`matt/skills`・`pstack/skills` の 3 つ。
_Avoid_: バケット、link dir、配置先

**スキルの種類**:
置き場にあるスキルの成り立ち。upstream をそのまま指す symlink、upstream を自分の意図で変えた fork、upstream と関係のない自作の 3 つ。
_Avoid_: スキルの型、kind

**key**:
upstream のスキルを `<submodule>/<name>` の形で指す名前。置き場や改名に左右されず、同じ名前のスキルが 2 つの upstream にあっても区別できる。
_Avoid_: スキル ID、upstream 名

**adapter**:
pstack のスキルを fork するときに、Cursor の名前を Claude Code の名前に書き換える決まりの表。
_Avoid_: harness doc、対応表

**model 系統**:
同じ作り手の model の群で、model 名の接頭辞で区切る。`claude-*` と `gpt-*` は別の系統で、間に入る仕組みの名前では区切らない。
_Avoid_: family、provider

**モデル表**:
repo ごとに、pstack のスキルの役割（`arena runners`・`swarm workers` など）ごとに使う model と推論の強さを書いた表。
_Avoid_: models.md、pstack-models、override sheet、モデル設定

**部品スキル**:
1 つのことだけをし、他のスキルやプレイブックから組み合わされる前提のスキル。流れ全体を握らない。
_Avoid_: primitive skill、基本スキル

**プレイブック**:
ある意図（設計したい・バグを調べたい など）に対し、部品スキルを呼ぶ順番を書いた手順書。各 repo の中にあり、使うたびに書き足されて育つ。スキルではなく、`/play` だけが読む。
_Avoid_: playbook、ワークフロー、手順スキル
