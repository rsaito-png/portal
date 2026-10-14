"""取込送信前のIF形式チェック（インタフェース仕様書 共通編/事業所編 準拠の機械チェック）
使い方: python3 test/spec_check.py <J111ファイル> <J611ファイル> [--sjis]
"""
import csv, io, re, sys
from pathlib import Path

ITEMS = {('J111', '01'): 23, ('J111', '02'): 14, ('J121', '01'): 35, ('J121', '02'): 12,
         ('J121', '03'): 11, ('J121', '04'): 33, ('J121', '05'): 11,
         ('J611', '01'): 172, ('J611', '02'): 113}
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]{0,7}\.CSV$', re.I)


def next_ym(ym):
    y, m = int(ym[:4]), int(ym[4:]) + 1
    return f'{y + (m > 12)}{(1 if m > 12 else m):02d}'


def check(path, data_type, sjis):
    errs = []
    raw = Path(path).read_bytes()
    text = raw.decode('cp932') if sjis else raw.decode('utf-8')
    if sjis and b'\r\n' not in raw:
        errs.append('改行がCRLFでない')
    if not NAME_RE.match(Path(path).name):
        errs.append(f'ファイル名規則違反（英字始まり半角英数8桁以内+.CSV）: {Path(path).name}')
    rows = list(csv.reader(io.StringIO(text.replace('\r\n', '\n'))))
    ctl, data, end = rows[0], rows[1:-1], rows[-1]
    if len(ctl) != 11: errs.append(f'コントロールレコード項目数 {len(ctl)} != 11(+改行)')
    if ctl[0] != '1' or ctl[1] != '1' or ctl[2] != '0': errs.append('コントロール 1/2/3 不正')
    if ctl[3] != str(len(data)): errs.append(f'レコード件数 {ctl[3]} != {len(data)}')
    if ctl[4] != data_type: errs.append(f'データ種別 {ctl[4]} != {data_type}')
    if data and ctl[4] != data[0][2][:3]: errs.append('データ種別が先頭データの交換情報識別番号上3桁と不一致')
    if ctl[5] != '0' or ctl[7] != '0' or ctl[8] != '1': errs.append('市町村番号0/都道府県番号0/媒体区分1 不正')
    if ctl[10] != '': errs.append('予備に値')
    svc_ym = data[0][4] if data else ''
    if ctl[9] != next_ym(svc_ym): errs.append(f'処理対象年月 {ctl[9]} != 提供月翌月 {next_ym(svc_ym)}')
    for i, r in enumerate(data):
        if r[0] != '2' or r[1] != str(i + 2): errs.append(f'行{i+2}: レコード種別/連番不正 {r[:2]}')
        key = (r[2], r[3])
        n = len(r) - 2
        if key not in ITEMS: errs.append(f'行{i+2}: 未知レコード {key}'); continue
        if n != ITEMS[key]: errs.append(f'行{i+2}: {key} 項目数 {n} != {ITEMS[key]}')
        if r[4] != svc_ym: errs.append(f'行{i+2}: サービス提供年月不一致')
        for j, v in enumerate(r[2:], 1):
            if any(ord(c) > 0x7E and not (0xFF61 <= ord(c) <= 0xFF9F) for c in v):
                errs.append(f'行{i+2}: {key} 項番{j} に全角文字 "{v}"')
        if key == ('J611', '02') and not re.fullmatch(r'\d{2}', r[2 + 8]):
            errs.append(f'行{i+2}: J611-02 項番9 日付が2桁でない "{r[2+8]}"')
        if key in (('J111', '01'), ('J111', '02')) and r[5] == '0':
            errs.append(f'行{i+2}: J111 市町村番号が0')
    if end != ['3', str(len(rows))]: errs.append(f'エンドレコード不正 {end}')
    # 請求書（市町村別）と明細書の整合
    if data_type == 'J11':
        cur = None; sums = {}
        for r in data:
            if (r[2], r[3]) == ('J111', '01'): cur = r[5]; sums[cur] = {'j111': (int(r[8]), int(r[9]), int(r[10])), 'n': 0, 'u': 0, 'c': 0}
            if (r[2], r[3]) == ('J121', '01'):
                if r[5] != cur: errs.append(f'J121 市町村 {r[5]} が直前の請求書 {cur} と不一致')
                s = sums[cur]; s['n'] += 1; s['u'] += int(r[2+19]); s['c'] += int(r[2+20])
        for c, s in sums.items():
            if s['j111'] != (s['n'], s['u'], s['c']): errs.append(f'市町村{c}: J111 {s["j111"]} != J121計 {(s["n"], s["u"], s["c"])}')
    return errs, rows


if __name__ == '__main__':
    sjis = '--sjis' in sys.argv
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    total = 0
    for f, t in zip(files, ['J11', 'J61']):
        errs, rows = check(f, t, sjis)
        total += len(errs)
        print(f'== {Path(f).name}: {len(rows)} 行, 指摘 {len(errs)} 件')
        seen = {}
        for e in errs:
            k = re.sub(r'行\d+: ', '', e)
            seen[k] = seen.get(k, 0) + 1
        for k, n in seen.items():
            print(f'  - {k}' + (f'（{n}行）' if n > 1 else ''))
    sys.exit(1 if total else 0)
