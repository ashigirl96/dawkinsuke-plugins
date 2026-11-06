---
upstream: skills/engineering/implement-spec
own: []
---

# implement-spec の fork

## spec との食い違いは、取り込む前に issue を直す

matt は、実装やレビューで spec や ticket と違うことが分かったときの扱いを書いていない。食い違いが分かったら、その仕事を integration branch に取り込む前に、spec と ticket の issue を直すように変えた。issue を書き換えるのは指揮する agent だけで、implementer subagent は食い違いを報告するだけにする。issue は後に続く ticket と PR の `Closes` が読む正本で、食い違ったまま進むと、後の subagent が古い issue のとおりに作るため。

## 試作の ticket は、ユーザーが確かめるまで先へ進まない

matt は frontier の ticket を止まらずに最後まで流す。試作で設計を確かめる ticket は、試作が終わったら結果と試し方をユーザーに渡して止め、ユーザーが確かめてから、それに頼る ticket を始めるように変えた。見た目や操作の感触の食い違いは、ユーザーが自分の画面で試して初めて見つかることが多く、確かめる前に本実装を進めると作り直しになるため。
