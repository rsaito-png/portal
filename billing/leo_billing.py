# -*- coding: utf-8 -*-
"""レオ（児発61・放デイ63）国保連 請求CSV：実績（DBの写し）→ K112/K122（障害児通所給付費 請求書・明細書）＋ K611（サービス提供実績記録票）
根拠：インタフェース仕様書 事業所編（if_mhlw_2024003）2. 障害児支援
  2.1.2 インタフェース一覧（K112/K122/K611）、2.1.3.1 請求書情報、2.1.3.2 明細書情報、2.1.3.6 サービス提供実績記録票情報
  共通編（if_001469710）1.2 ファイル構成（CSV・Shift_JIS・CRLF・ファイル名）、1.4 コード一覧（地域区分 06=六級地）、1.6 データ種別（K11/K61）
確定値：定員10・6級地（10.36円）・加算は 欠席時対応・送迎・子育てサポート のみ。
※ 提出しない。本番前に国保連「取込送信ソフト」でテスト取込が必須。"""
import math, json, unicodedata
from collections import defaultdict
from pathlib import Path

CODES = json.loads((Path(__file__).with_name('leo_codes.json')).read_text())   # gen_codes.py が作る
SVC_KIND = {'児発': '61', '放デイ': '63'}
YOSHIKI = {'61': '0301', '63': '0501'}            # 事業所編 2.1.3.6（４）様式種別番号
DECIDE = {'61': '611000', '63': '631000'}         # 事業所編 2.1.3.2（９）決定サービスコード（基本決定）
GENSAN_ORDER = ['支減', '未計画', '未計画2', '評価減', '開所減1', '開所減2']   # サービスコード表の減算名
UNIT_PRICE = 10.36   # 6級地 児発・放デイ
AREA = '06'          # 共通編 1.4 地域区分コード 06:六級地（16 は十六級地＝EA02）
OFFICE_NO = '9999999999'  # 架空

def q(v): return '' if v is None or v == '' else '"' + str(v).replace('"', '""') + '"'
def to_csv(rows): return ('\r\n'.join(','.join(q(c) for c in r) for r in rows) + '\r\n').encode('cp932')
def rec(n, items):
    r = [''] * n
    for k, v in items.items(): r[k - 1] = '' if v is None else str(v)
    return r
def wrap(data, kind, office, ym_next):
    rows = [['1', '1', '0', str(len(data)), kind, '0', office, '0', '1', ym_next, '']]
    rows += [['2', str(i + 2)] + list(p) for i, p in enumerate(data)]
    return rows + [['3', str(len(data) + 2)]]
def next_ym(ym): y, m = int(ym[:4]), int(ym[4:]) + 1; return f'{y + (m > 12)}{(m - 1) % 12 + 1:02d}'
def hankaku(s):  # 全角カナ→半角（ｶﾅ）。NFKC は半角→全角なので逆変換表を使う
    s = unicodedata.normalize('NFKC', s or '')
    out = []
    for ch in s:
        n = unicodedata.name(ch, '')
        if n.startswith('KATAKANA LETTER') or ch in 'ー・':
            out.append(HAN.get(ch, ch))
        elif ch == '\u3000': out.append(' ')
        else: out.append(ch)
    return ''.join(out)
_Z = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォャュョッー・'
_H = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯｰ･'
HAN = dict(zip(_Z, _H))
for z, h in zip('ガギグゲゴザジズゼゾダヂヅデドバビブベボヴ', 'ｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾊﾋﾌﾍﾎｳ'): HAN[z] = h + 'ﾞ'
for z, h in zip('パピプペポ', 'ﾊﾋﾌﾍﾎ'): HAN[z] = h + 'ﾟ'
def hm(t):
    """時刻は「表示されている文字列」（'15:00' や '15:00:00'）で受ける。Date/数値は受けない（茶夢で getValues の時刻がずれた）"""
    if not t: return None
    p = str(t).strip().split(':')
    if len(p) < 2 or not p[0].isdigit() or not p[1][:2].isdigit(): raise ValueError(f'時刻の形が不正: {t!r}')
    return int(p[0]) * 60 + int(p[1][:2])
def band(kind, start, end, holiday):
    a, b = hm(start), hm(end)
    if a is None or b is None or b <= a: return None, 0
    d = b - a
    if d < 30: return None, d
    if d <= 90: return '区分1', d
    if d <= 180: return '区分2', d
    if kind == '63' and not holiday: return '区分2', d   # 放デイ区分3は学校休業日のみ
    return '区分3', d
def base_code(k, b, gensan):
    key = f'{k}{b}' + ''.join('・' + g for g in GENSAN_ORDER if g in gensan)
    if key not in CODES['base']: raise ValueError(f'減算の組み合わせがコード表にない: {key}')
    return CODES['base'][key]

def build(ym, children, records, office=OFFICE_NO, office_gensan=()):
    """children: {名前: {受給者証番号, 市町村番号, 種別(児発/放デイ), 上限月額, 無償化(bool), カナ(児童), 保護者カナ, 決定サービスコード,
                       契約日数, 契約開始日, 初回提供日(一連の契約で最初に提供した日 YYYYMMDD), 記入欄番号, 減算(['未計画'] など)}}
    records: [{day: date, child, status(出席/欠席), start, end(表示文字列 'HH:MM'), pick(◯), drop(◯), holiday(bool), absent_support(bool), kosodate(bool)}]
    office_gensan: 事業所全体にかかる減算（'支減' '評価減' '開所減1' '開所減2'）"""
    by = defaultdict(list); warn = []
    for r in records:
        if r['day'].strftime('%Y%m') == ym and r['child'] in children: by[r['child']].append(r)
    bills = []
    for name, days in sorted(by.items()):
        c = children[name]; k = SVC_KIND[c['種別']]; gs = set(office_gensan) | set(c.get('減算') or ())
        det = {}; use = absn = kos = 0; day_rows = []
        def add(code, u):
            det.setdefault(code, [u, 0])[1] += 1
        for r in sorted(days, key=lambda x: x['day']):
            if r['status'] == '出席':
                b, mins = band(k, r['start'], r['end'], r.get('holiday'))
                if not b: warn.append(f"{name} {r['day']}：時間が無いか30分未満なので算定していません"); continue
                add(*base_code(k, b, gs)); use += 1
                ko = False
                if r.get('kosodate'):
                    if kos < 4: kos += 1; ko = True; add(*CODES['addon'][k + '子育て'])
                    else: warn.append(f"{name} {r['day']}：子育てサポート加算は月4回までなので算定外")
                day_rows.append((r, b, mins, ko))
            elif r['status'] == '欠席' and r.get('absent_support'):
                if absn < 4: absn += 1; add(*CODES['addon'][k + '欠席']); day_rows.append((r, '欠席', 0, False))
                else: warn.append(f"{name} {r['day']}：欠席時対応は月4回までなので算定外")
        go = sum(r.get('pick') == '◯' for r, x, *_ in day_rows if x != '欠席'); back = sum(r.get('drop') == '◯' for r, x, *_ in day_rows if x != '欠席')
        if go + back:
            cd, uu = CODES['addon'][k + '送迎']; det[cd] = [uu, go + back]
        units = sum(u * t for u, t in det.values())
        cost = math.floor(units * UNIT_PRICE)
        ichiwari = math.floor(cost * 0.1)
        futan2 = 0 if c.get('無償化') else ichiwari          # 明細書 集計 項番15（※５：無償化対象は0）
        burden = min(futan2, int(c['上限月額']))
        bills.append(dict(name=name, units=units, cost=cost, ichiwari=ichiwari, futan2=futan2, burden=burden, benefit=cost - burden,
                          use=use, absn=absn, kos=kos, trips=go + back, kind=k, det=det, days=day_rows, c=c))
    by_city = defaultdict(list)
    for b in bills: by_city[b['c']['市町村番号']].append(b)
    claims, jis = [], []
    S = lambda bs, f: sum(b[f] for b in bs)
    for city, bs in sorted(by_city.items()):
        # 2.1.3.1（２）請求書 基本情報（23項目）
        claims.append(rec(23, {1: 'K112', 2: '01', 3: ym, 4: city, 5: office, 6: S(bs, 'benefit'), 7: len(bs), 8: S(bs, 'units'), 9: S(bs, 'cost'),
                               10: S(bs, 'benefit'), 12: S(bs, 'burden'), 17: len(bs), 18: S(bs, 'units'), 19: S(bs, 'cost'), 20: S(bs, 'benefit'), 22: S(bs, 'burden')}))
        # （３）請求書 明細情報（14項目）サービス種類ごと
        for k in sorted({b['kind'] for b in bs}):
            kb = [b for b in bs if b['kind'] == k]
            claims.append(rec(14, {1: 'K112', 2: '02', 3: ym, 4: city, 5: office, 6: '1', 7: k, 8: len(kb), 9: S(kb, 'units'),
                                   10: S(kb, 'cost'), 11: S(kb, 'benefit'), 13: S(kb, 'burden')}))
        for b in bs:   # 2.1.3.2 明細書（この市町村の請求書の後ろに並べる）
            c, h, k = b['c'], str(b['c']['受給者証番号']).zfill(10), b['kind']
            claims.append(rec(35, {1: 'K122', 2: '01', 3: ym, 4: city, 5: office, 6: h, 8: hankaku(c.get('保護者カナ', '')), 9: hankaku(c.get('カナ', '')),
                                   10: AREA, 12: c['上限月額'], 20: b['units'], 21: b['cost'], 22: b['burden'], 27: b['burden'], 28: b['benefit']}))
            first = c.get('初回提供日')
            if not first:
                first = f"{ym}{min(r['day'].day for r, *_ in b['days']):02d}" if b['days'] else f'{ym}01'
                warn.append(f"{b['name']}：初回提供日（一連の契約で最初に来た日）が未登録なので、今月最初の日 {first} を入れています")
            claims.append(rec(12, {1: 'K122', 2: '02', 3: ym, 4: city, 5: office, 6: h, 7: k, 8: first, 10: b['use']}))
            for code, (u, t) in sorted(b['det'].items()):
                claims.append(rec(11, {1: 'K122', 2: '03', 3: ym, 4: city, 5: office, 6: h, 7: k + code, 8: u, 9: t, 10: u * t}))
            claims.append(rec(33, {1: 'K122', 2: '04', 3: ym, 4: city, 5: office, 6: h, 7: k, 8: '1', 9: b['use'] + b['absn'], 10: b['units'],
                                   11: f'{round(UNIT_PRICE * 1000):05d}', 12: '0', 13: b['cost'], 14: b['ichiwari'], 15: b['futan2'], 16: b['burden'],
                                   21: b['burden'], 22: b['benefit']}))
            claims.append(rec(11, {1: 'K122', 2: '05', 3: ym, 4: city, 5: office, 6: h, 7: c.get('決定サービスコード') or DECIDE[k],
                                   8: f"{round(float(c.get('契約日数', 23)) * 100):05d}", 9: c.get('契約開始日', ''), 11: c.get('記入欄番号', 1)}))
            # 2.1.3.6 実績記録票 基本（172項目）・明細（113項目）
            ys = YOSHIKI[k]; tot = sum(m for _, x, m, _ in b['days'] if x != '欠席')
            jis.append(rec(172, {1: 'K611', 2: '01', 3: ym, 4: city, 5: office, 6: h, 7: ys, 19: f'{round(tot / 60 * 100):05d}',
                                 34: b['trips'] or '', 163: b['kos'] or ''}))
            for r, x, m, ko in b['days']:
                ab = x == '欠席'; t = lambda v: f'{hm(v) // 60:02d}{hm(v) % 60:02d}'
                jis.append(rec(113, {1: 'K611', 2: '02', 3: ym, 4: city, 5: office, 6: h, 7: ys, 9: f"{r['day'].day:02d}",
                                     14: '' if ab else t(r['start']), 15: '' if ab else t(r['end']), 16: '' if ab else f'{round(m / 60 * 100):04d}',
                                     21: '1' if not ab and r.get('pick') == '◯' else '', 22: '1' if not ab and r.get('drop') == '◯' else '',
                                     34: ('2' if r.get('holiday') else '1') if k == '63' and not ab else '', 36: '8' if ab else '',
                                     103: '1' if ko else ''}))
    return wrap(claims, 'K11', office, next_ym(ym)), wrap(jis, 'K61', office, next_ym(ym)), bills, warn

