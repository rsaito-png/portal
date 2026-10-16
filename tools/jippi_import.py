#!/usr/bin/env python3
"""実費（お昼代・おやつ代）取り込み：実績記録の「一覧」「実費精算」タブをCSVで書き出したものを leo_jippi に入れる。
使い方: jippi_import.py YYYY-MM 一覧.csv [実費精算.csv]
- Google側は読むだけ（CSVは box 上に置く。リポジトリには入れない＝個人名を含むため）
- 一覧：児童ごとに お昼代・おやつ代 の列を合計（「300円」→300）。保護者名・支払いリンクは実費精算タブにあれば取り込む
- 再取り込みしても 送信済み・メモ・手で貼ったリンクは消さない（金額と保護者名だけ更新、リンクは空でないときだけ上書き）
service_role キー: /home/box/tools/supabase/service_role_key（表示しない）"""
import csv, json, re, sys, urllib.request
ym = sys.argv[1]; assert re.fullmatch(r'\d{4}-\d{2}', ym)
KEY = open('/home/box/tools/supabase/service_role_key').read().strip()
URL = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1/'
yen = lambda s: int(re.sub(r'\D', '', s)) if s and re.search(r'\d', s) else 0
rows = list(csv.reader(open(sys.argv[2], encoding='utf-8')))
h = rows[0]; ix = {k: h.index(k) for k in ('日付', '児童名', 'お昼代', 'おやつ代')}
mon = int(ym[5:])
tot = {}
for r in rows[1:]:
    r += [''] * (len(h) - len(r))
    if not r[ix['日付']].startswith(f'{mon}/'): continue
    t = tot.setdefault(r[ix['児童名']].strip(), [0, 0])
    t[0] += yen(r[ix['お昼代']]); t[1] += yen(r[ix['おやつ代']])
extra = {}
if len(sys.argv) > 3:
    s = list(csv.reader(open(sys.argv[3], encoding='utf-8')))
    for r in s[1:]:
        if len(r) >= 2 and r[0].replace('/', '-') == ym: extra[r[1].strip()] = (r[2].strip() if len(r) > 2 else '', r[6].strip() if len(r) > 6 else '')
out = []
for c, (l, k) in sorted(tot.items()):
    if l == 0 and k == 0: continue          # 実費のない児童は出さない
    d = {'ym': ym, 'child': c, 'lunch': l, 'snack': k}
    g, link = extra.get(c, ('', ''))
    if g: d['guardian'] = g
    if link.startswith('https://'): d['pay_link'] = link
    out.append(d)
# 列がそろっていないと一括upsertが失敗するので、キーの種類ごとに分けて送る
groups = {}
for d in out: groups.setdefault(tuple(sorted(d)), []).append(d)
for g in groups.values():
    req = urllib.request.Request(URL + 'leo_jippi?on_conflict=ym,child', json.dumps(g).encode(), method='POST',
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req).read()
print(f'{ym}: {len(out)}人 取り込みました')
