# dawkinsuke-plugins

自分専用の Claude Code プラグイン dawkinsuke と、その元になる upstream のスキル集を扱う。

## Language

**adapter**:
pstack のスキルが最初に読む、Cursor の名前を Claude Code の名前に読み替える表。
_Avoid_: harness doc、対応表

**model 系統**:
同じ作り手の model の群で、model 名の接頭辞で区切る。`claude-*` と `gpt-*` は別の系統で、間に入る proxy（opencodex など）の名前では区切らない。
_Avoid_: family、provider
