# -*- coding: utf-8 -*-
"""レオ（児発61・放デイ63）国保連 請求CSV 試作：実績（DBの写し）→ J111/J121（請求・明細）＋ J611（実績記録票）
茶夢（/workspace/chamu-billing）と同じ形式：Shift_JIS・CR+LF・全項目ダブルクォート。
確定値：定員10・地域区分6級地・加算は 欠席時対応・送迎・子育てサポート のみ（処遇改善などは算定しない）
※ 試作。提出しない。本番前に国保連「取込送信ソフト」でテスト取込が必須（J121/J611 の障害児用の項目位置は要照合）。"""
import math, csv, io
from collections import defaultdict
from datetime import date

# ---- サービスコード（令和6年度改定版 サービスコード表 service_codes_3.xlsx より・定員10人以下・医ケア以外） ----
SVC = {
  # 児発：児童発達支援センター以外・障害児（重心除く）・(1)主に未就学児 ・(四)医ケア以外・定員10以下
  ('61', '区分1'): ('1511', 901), ('61', '区分2'): ('JH16', 928), ('61', '区分3'): ('JH34', 980),
  # 放デイ：障害児（重心除く）・(四)医ケア以外・定員10以下（区分3は学校休業日のみ）
  ('63', '区分1'): ('H574', 574), ('63', '区分2'): ('H592', 609), ('63', '区分3'): ('H610', 666),
}
ADDON = {
  ('61', '欠席'): ('5495', 94), ('63', '欠席'): ('5495', 94),      # 欠席時対応加算（Ⅰ）月4回まで
  ('61', '送迎'): ('6240', 54), ('63', '送迎'): ('6240', 54),      # 送迎加算１（片道）
  ('61', '子育て'): ('5701', 80), ('63', '子育て'): ('5701', 80),  # 子育てサポート加算
}
SVC_KIND = {'児発': '61', '放デイ': '63'}
UNIT_PRICE = 10.42   # 6級地（障害児通所）※要確認：告示の地域単価で確定させる
OFFICE_NO = '9999999999'  # 架空（本番は事業所番号）

def q(v): return '' if v is None or v == '' else '"' + str(v).replace('"', '""') + '"'
def to_csv(rows): return ('\r\n'.join(','.join(q(c) for c in r) for r in rows) + '\r\n').encode('cp932')
def rec(n, items):
    r = [''] * n
    for k, v in items.items(): r[k - 1] = '' if v is None else str(v)
    return r
def wrap(data, kind, ym_next):
    rows = [['1', '1', '0', str(len(data)), kind, '0', OFFICE_NO, '0', '1', ym_next, '']]
    rows += [['2', str(i + 2)] + list(p) for i, p in enumerate(data)]
    return rows + [['3', str(len(data) + 2)]]
def next_ym(ym): y, m = int(ym[:4]), int(ym[4:]) + 1; return f'{y + (m > 12)}{(m - 1) % 12 + 1:02d}'
def mins(t):
    if not t: return None
    h, m = str(t).split(':'); return int(h) * 60 + int(m)
def band(kind, start, end, holiday):
    a, b = mins(start), mins(end)
    if a is None or b is None or b <= a: return None
    d = b - a
    if d < 30: return None              # 30分未満は算定しない（欠席時対応加算Ⅱの対象は別扱い）
    if d <= 90: return '区分1'
    if d <= 180: return '区分2'
    if kind == '63' and not holiday: return '区分2'   # 放デイ区分3は学校休業日のみ
    return '区分3'

def build(ym, children, records):
    """children: {名前: {受給者証番号, 市町村番号, 種別(児発/放デイ), 上限月額, 無償化(bool), カナ, 決定サービスコード, 契約日数, 契約開始日}}
    records: [{day: date, child, status(出席/欠席), start, end, pick(◯), drop(◯), holiday(bool), absent_support(bool), kosodate(bool)}]"""
    by = defaultdict(list)
    for r in records:
        if r['day'].strftime('%Y%m') == ym and r['child'] in children: by[r['child']].append(r)
    claims, jis, bills = [], [], []
    for name, days in sorted(by.items()):
        c = children[name]; k = SVC_KIND[c['種別']]; det = defaultdict(lambda: [0, 0]); use = go = back = absn = 0; day_rows = []
        for r in sorted(days, key=lambda x: x['day']):
            if r['status'] == '出席':
                b = band(k, r['start'], r['end'], r.get('holiday'))
                if not b: continue
                code, u = SVC[(k, b)]; det[code][0] = u; det[code][1] += 1; use += 1
                go += r.get('pick') == '◯'; back += r.get('drop') == '◯'
                if r.get('kosodate'): cd, uu = ADDON[(k, '子育て')]; det[cd][0] = uu; det[cd][1] += 1
                day_rows.append((r, b))
            elif r['status'] == '欠席' and r.get('absent_support') and absn < 4:
                absn += 1; cd, uu = ADDON[(k, '欠席')]; det[cd][0] = uu; det[cd][1] += 1; day_rows.append((r, '欠席'))
        if go + back: cd, uu = ADDON[(k, '送迎')]; det[cd][0] = uu; det[cd][1] += go + back
        units = sum(u * t for u, t in det.values())
        cost = math.floor(units * UNIT_PRICE)
        burden = 0 if c.get('無償化') else min(math.floor(cost * 0.1), int(c['上限月額']))
        bills.append(dict(name=name, units=units, cost=cost, burden=burden, benefit=cost - burden, use=use, kind=k, det=det, days=day_rows, c=c))
    by_city = defaultdict(list)
    for b in bills: by_city[b['c']['市町村番号']].append(b)
    for city, bs in sorted(by_city.items()):
        n, un, co, be, bu = len(bs), sum(b['units'] for b in bs), sum(b['cost'] for b in bs), sum(b['benefit'] for b in bs), sum(b['burden'] for b in bs)
        claims.append(rec(23, {1: 'J111', 2: '01', 3: ym, 4: city, 5: OFFICE_NO, 6: be, 7: n, 8: un, 9: co, 10: be, 12: bu, 17: n, 18: un, 19: co, 20: be, 22: bu}))
        for k in sorted({b['kind'] for b in bs}):
            kb = [b for b in bs if b['kind'] == k]
            claims.append(rec(14, {1: 'J111', 2: '02', 3: ym, 4: city, 5: OFFICE_NO, 6: '1', 7: k, 8: len(kb), 9: sum(b['units'] for b in kb),
                                   10: sum(b['cost'] for b in kb), 11: sum(b['benefit'] for b in kb), 13: sum(b['burden'] for b in kb)}))
        for b in bs:
            c, h = b['c'], str(b['c']['受給者証番号']).zfill(10)
            claims.append(rec(35, {1: 'J121', 2: '01', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 8: c.get('カナ', ''), 10: '', 11: '1', 12: c['上限月額'], 13: '1',
                                   20: b['units'], 21: b['cost'], 22: b['burden'], 25: b['burden'], 27: b['burden'], 28: b['benefit']}))
            first = min(r['day'].day for r, _ in b['days']) if b['days'] else 1
            claims.append(rec(12, {1: 'J121', 2: '02', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: b['kind'], 8: c.get('契約開始日') or f'{ym}{first:02d}', 10: b['use']}))
            for code, (u, t) in sorted(b['det'].items()):
                claims.append(rec(11, {1: 'J121', 2: '03', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: b['kind'] + code, 8: u, 9: t, 10: u * t}))
            claims.append(rec(33, {1: 'J121', 2: '04', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: b['kind'], 8: '1', 9: b['use'], 10: b['units'], 11: int(round(UNIT_PRICE * 1000)),
                                   12: '0', 13: b['cost'], 14: math.floor(b['cost'] * 0.1), 15: math.floor(b['cost'] * 0.1), 16: b['burden'], 21: b['burden'], 22: b['benefit']}))
            claims.append(rec(11, {1: 'J121', 2: '05', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: c.get('決定サービスコード', b['kind'] + '0000'),
                                   8: f"{int(c.get('契約日数', 23)) * 100:05d}", 9: c.get('契約開始日', ''), 11: '1'}))
            go = sum(r.get('pick') == '◯' for r, x in b['days'] if x != '欠席'); bk = sum(r.get('drop') == '◯' for r, x in b['days'] if x != '欠席')
            jis.append(rec(172, {1: 'J611', 2: '01', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: '0' + b['kind'] + '1', 34: (go + bk) or ''}))
            for r, x in b['days']:
                hm = lambda t: '' if not t else t.replace(':', '').zfill(4)
                jis.append(rec(113, {1: 'J611', 2: '02', 3: ym, 4: city, 5: OFFICE_NO, 6: h, 7: '0' + b['kind'] + '1', 9: f"{r['day'].day:02d}",
                                     10: '2' if x == '欠席' else '', 14: '' if x == '欠席' else hm(r['start']), 15: '' if x == '欠席' else hm(r['end']),
                                     21: '1' if x != '欠席' and r.get('pick') == '◯' else '', 22: '1' if x != '欠席' and r.get('drop') == '◯' else ''}))
    return wrap(claims, 'J11', next_ym(ym)), wrap(jis, 'J61', next_ym(ym)), bills
