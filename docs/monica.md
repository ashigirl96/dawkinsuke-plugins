# monica

この repo のスキルが動く端末は monica（個人用の Agentic Workspace）。案の失敗が、作業の場（Bench・Tab）を開く手間や、claude の session を起こす・引き継ぐ手間なら、monica の CLI で消せるかを見る。

## 調べ方

monica の機能の正本は次の 3 つ。ここには写さない。

- `monica --help` と `monica <command> --help`: コマンドと flag。
- `~/.ghq/src/github.com/ashigirl96/monica/GLOSSARY.md`: Task・Run・Bench・Runspace・Tab・Agent Session の意味。
- 同じ repo の `docs/adr/`: なぜそう動くか。たとえば ADR-0024 は、`task run` が最初の prompt を渡す理由。

## 組み合わせの見方

- Task は GitHub Issue と 1 対 1 で、Issue の無い Task は作れない。Bench（Task の worktree と Tab の束）を開くには、issue が 1 本要る。
- `monica task run <ref> [prompt]` は Bench を開いて claude を起こし、最初の prompt を渡す。スキルから次の session を起こす入口はここで、プレイブックからは部品スキル `fork-to-bench` を通して呼ぶ。
- Agent Session の同一性は claude の session_id。resume は同じ Agent Session、fork は別の Agent Session になる。
- スキルが自分のいる Tab を知る手掛かりは、環境変数 `MONICA_TERMINAL_SESSION_ID`。

## 約束事

- スキルは PATH 上の `monica` を呼ぶことでだけ monica に触る（monica の ADR-0006）。
- スキルは monica の Tab の中で動く前提で書く。monica の外の分岐は持たない。
- 今の CLI に入口が無ければ、`ashigirl96/monica` の issue として提案し、スキルはその入口が入ってから使う。提案には、足すコマンドか引数と、関わる monica の ADR を書く。
