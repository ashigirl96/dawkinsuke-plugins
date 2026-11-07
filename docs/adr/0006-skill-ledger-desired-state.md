# スキル台帳はあるべき姿を計算し、名前の衝突は固定の優先順で決める

スキル 1 つの種類・置き場・key・呼ばれる名前・除外中かは、スキル台帳（`scripts/ledger.sh`）だけが答え、他の script と手順書はそれを引く。台帳は upstream の中身・`exclude.txt`・`rename.txt`・置き場の実ディレクトリ（fork は `ADR.md` の `upstream:` で key を取る）から表を作り、置き場の symlink は読まない。`sync-skills.sh` は台帳に合わせて symlink を張るだけにする。同じ名前がぶつかったら、置き場の実ディレクトリ、matt の symlink、pstack の symlink の順で勝ち、負けた行は衝突として残す。同じ upstream と除外リストからは、checkout の状態によらず同じ表が出る。

## Considered Options

- 台帳が置き場の今の姿（symlink）を読む: あるべき姿の計算が `sync-skills.sh` に残り、知識が台帳と 2 か所に分かれる。
- 衝突は先に張られた symlink を残す（台帳を入れる前の `sync-skills.sh` の決め方）: 表が checkout の状態で変わり、symlink を消して張り直すと勝つ側が入れ替わりうる。
