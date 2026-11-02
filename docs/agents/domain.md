# Domain Docs

engineering のスキルがコードを調べるときに、この repo のドメイン文書をどう読むかを決める。

## 調べる前に読むもの

- repo のルートの **`GLOSSARY.md`**、または
- ルートに **`GLOSSARY-MAP.md`** があればそれ。context ごとの `GLOSSARY.md` を指しているので、題材に関係するものを読む。
- **`docs/adr/`**: これから触る範囲に関わる ADR を読む。multi-context の repo では、context ごとの決定を `src/<context>/docs/adr/` でも確かめる。

これらの file が無くても **何も言わずに進む**。無いことを指摘せず、先に作るよう勧めもしない。用語や決定が実際に固まったときに、`/domain-modeling` スキル（`/grill-with-docs` と `/improve-codebase-architecture` から呼ばれる）が必要に応じて作る。

## file の構成

single-context の repo（ほとんどの repo）:

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

multi-context の repo（ルートに `GLOSSARY-MAP.md` がある）:

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system 全体の決定
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context ごとの決定
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## glossary の言葉を使う

出力でドメインの概念を名指すとき（issue の title、リファクタの提案、仮説、テスト名）は、`GLOSSARY.md` が定める用語を使う。glossary が避けると明記している類義語に流れない。

必要な概念が glossary にまだ無ければ、それは合図になる。プロジェクトが使わない言葉を作り出している（考え直す）か、本当に抜けている（`/domain-modeling` のためにメモする）かのどちらか。

## ADR との食い違いを示す

出力が既存の ADR と食い違うなら、黙って上書きせずに明示する:

> _ADR-0007（event-sourced orders）と食い違うが、次の理由で見直す価値がある…_
