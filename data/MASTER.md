# KidEase Canada master CSV

The 23,927-row licensed-childcare master is **not** stored in this public app repo (phones/emails).

## Frozen snapshot — 2026-09-02

- Rows: 23,927
- Phones: 19,005
- Emails: 13,976
- Websites: 9,333

## Where it lives

- Private GitHub repo: https://github.com/klernout-hash/kidease-master-data
- Google Drive: https://drive.google.com/file/d/1kOX8R-odlw1stQ-LIylhid8PQwkEF5xf/view
- File name: `KidEase_Canada_Master_23927_20260902.csv`

To push the full 10 MB CSV from a laptop after downloading Drive:

```bash
git clone https://github.com/klernout-hash/kidease-master-data.git
cd kidease-master-data
cp ~/Downloads/KidEase_Canada_Master_23927_20260902.csv .
git add KidEase_Canada_Master_23927_20260902.csv
git commit -m "Add frozen master 2026-09-02 (23927 rows, 19005 phones)"
git push
```
