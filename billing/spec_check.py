"""取込送信前のIF形式チェック（障害児：K112/K122/K611）。茶夢の test/spec_check.py を児童用に拡張。
根拠：共通編 1.2/1.3/1.4/1.6、事業所編 2.1.3.1/2.1.3.2/2.1.3.6
使い方: python3 spec_check.py <K11ファイル> <K61ファイル> --sjis"""
import csv, io, re, sys, json
from pathlib import Path

ITEMS = {('K112', '01'): 23, ('K112', '02'): 14, ('K122', '01'): 35, ('K122', '02'): 12, ('K122', '03'): 11,
         ('K122', '04'): 33, ('K122', '05'): 11, ('K611', '01'): 172, ('K611', '02'): 113}
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]{0,7}\.CSV$')
CODES = json.loads(Path(__file__).with_name('leo_codes.json').read_text())
KNOWN = {k[:2] + c for k, (c, u) in list(CODES['base'].items()) + list(CODES['addon'].items())}
UNITS = {k[:2] + c: u for k, (c, u) in list(CODES['base'].items()) + list(CODES['addon'].items())}
YOSHIKI = {'61': '0301', '63': '0501'}

def next_ym(ym):
    y, m = int(ym[:4]), int(ym[4:]) + 1
    return f'{y + (m > 12)}{(1 if m > 12 else m):02d}'

def check(path, data_type, sjis=True):
    errs = []
    raw = Path(path).read_bytes()
    text = raw.decode('cp932') if sjis else raw.decode('utf-8')
    if b'\n' in raw.replace(b'\r\n', b''): errs.append('改行がCRLFでない')
    if not NAME_RE.match(Path(path).name): errs.append(f'ファイル名規則違反（英字始まり半角英数8桁以内+.CSV）: {Path(path).name}')
    rows = list(csv.reader(io.StringIO(text.replace('\r\n', '\n'))))
    ctl, data, end = rows[0], rows[1:-1], rows[-1]
    if len(ctl) != 11: errs.append(f'コントロールレコード項目数 {len(ctl)} != 11')
    if ctl[:3] != ['1', '1', '0']: errs.append('コントロール 1/2/3 不正')
    if ctl[3] != str(len(data)): errs.append(f'レコード件数 {ctl[3]} != {len(data)}')
    if ctl[4] != data_type: errs.append(f'データ種別 {ctl[4]} != {data_type}')
    if data and ctl[4] != data[0][2][:3]: errs.append('データ種別が交換情報識別番号上3桁と不一致')
    if ctl[5] != '0' or ctl[7] != '0' or ctl[8] != '1': errs.append('市町村番号0/都道府県番号0/媒体区分1 不正')
    if ctl[10] != '': errs.append('予備に値')
    svc_ym = data[0][4] if data else ''
    if ctl[9] != next_ym(svc_ym): errs.append(f'処理対象年月 {ctl[9]} != 請求月 {next_ym(svc_ym)}')
    for i, r in enumerate(data):
        L = f'行{i+2}'
        if r[0] != '2' or r[1] != str(i + 2): errs.append(f'{L}: レコード種別/連番不正 {r[:2]}')
        key = (r[2], r[3]); v = r[2:]
        if key not in ITEMS: errs.append(f'{L}: 未知レコード {key}'); continue
        if len(v) != ITEMS[key]: errs.append(f'{L}: {key} 項目数 {len(v)} != {ITEMS[key]}')
        it = lambda n: v[n - 1] if n <= len(v) else ''
        if it(3) != svc_ym: errs.append(f'{L}: サービス提供年月不一致')
        if not re.fullmatch(r'\d{6}', it(4)) or it(4) == '000000': errs.append(f'{L}: 市町村番号不正')
        if not re.fullmatch(r'\d{10}', it(5)): errs.append(f'{L}: 事業所番号不正')
        for j, x in enumerate(v, 1):
            if any(ord(ch) > 0x7E and not (0xFF61 <= ord(ch) <= 0xFF9F) for ch in x):
                errs.append(f'{L}: {key} 項番{j} に全角文字 "{x}"')
        if key[0] in ('K122', 'K611') and not re.fullmatch(r'\d{10}', it(6)): errs.append(f'{L}: 受給者証番号不正')
        if key == ('K122', '01'):
            if it(10) != '06': errs.append(f'{L}: 地域区分コード {it(10)} != 06（六級地）')
            for n in (11, 13, 14, 18, 19, 23, 24): 
                if it(n): errs.append(f'{L}: K122-01 項番{n} は「設定しない」')
            if int(it(22) or 0) > int(it(12) or 0): errs.append(f'{L}: 上限月額調整 > 上限月額')
        if key == ('K122', '02') and (it(7) not in YOSHIKI or not re.fullmatch(r'\d{8}', it(8))): errs.append(f'{L}: 日数情報 種類/開始年月日不正')
        if key == ('K122', '03'):
            if it(7) not in KNOWN: errs.append(f'{L}: サービスコード {it(7)} がコード表にない')
            elif int(it(8)) != UNITS[it(7)]: errs.append(f'{L}: {it(7)} 単位数 {it(8)} != コード表 {UNITS[it(7)]}')
            if int(it(8)) * int(it(9)) != int(it(10)): errs.append(f'{L}: 単位数×回数 != サービス単位数')
        if key == ('K122', '04'):
            if it(8) != '1': errs.append(f'{L}: 集計欄分類番号 {it(8)} != 1')
            if not re.fullmatch(r'\d{5}', it(11)): errs.append(f'{L}: 単位数単価が5桁でない')
            if it(12) != '0': errs.append(f'{L}: 給付率は0')
            for n in (17, 18, 30, 31, 32, 33):
                if it(n): errs.append(f'{L}: K122-04 項番{n} は「設定しない」')
        if key == ('K122', '05'):
            if not re.fullmatch(r'6[13]\w000', it(7)): errs.append(f'{L}: 決定サービスコード {it(7)} 不正')
            if not re.fullmatch(r'\d{5}', it(8)): errs.append(f'{L}: 契約支給量は整数3桁+小数2桁の5桁（22日→02200）')
            if not re.fullmatch(r'\d{8}', it(9)): errs.append(f'{L}: 契約開始年月日不正')
        if key[0] == 'K611' and it(7) not in YOSHIKI.values(): errs.append(f'{L}: 様式種別番号 {it(7)} 不正（児発0301/放デイ0501）')
        if key == ('K611', '02'):
            if not re.fullmatch(r'\d{2}', it(9)): errs.append(f'{L}: 日付が2桁でない "{it(9)}"')
            for n in (14, 15):
                if it(n) and not re.fullmatch(r'([01]\d|2[0-3])[0-5]\d', it(n)): errs.append(f'{L}: 時刻 {it(n)} 不正')
            if it(36) not in ('', '8'): errs.append(f'{L}: サービス提供の状況 {it(36)}')
            if it(36) == '8' and (it(14) or it(15)): errs.append(f'{L}: 欠席日に時刻あり')
            if it(36) != '8' and not (it(14) and it(15) and it(16)): errs.append(f'{L}: 開始/終了/算定時間数が空')
            if it(7) == '0501' and it(36) != '8' and it(34) not in ('1', '2'): errs.append(f'{L}: 放デイの提供形態が空')
            if it(7) == '0301' and it(34): errs.append(f'{L}: 児発に提供形態')
    if end != ['3', str(len(rows))]: errs.append(f'エンドレコード不正 {end}')
    if data_type == 'K11':   # 請求書（市町村別）の後ろにその市町村の明細書、合計の整合
        cur = None; sums = {}; d03 = {}
        for r in data:
            v = r[2:]; key = (v[0], v[1])
            if key == ('K112', '01'): cur = v[3]; sums[cur] = {'h': (int(v[6]), int(v[7]), int(v[8]), int(v[9]), int(v[11])), 'n': 0, 'u': 0, 'c': 0, 'b': 0, 'f': 0}
            if key[0] == 'K122' and v[3] != cur: errs.append(f'K122 市町村 {v[3]} が直前の請求書 {cur} と不一致')
            if key == ('K122', '01'):
                s = sums[cur]; s['n'] += 1; s['u'] += int(v[19]); s['c'] += int(v[20]); s['b'] += int(v[27]); s['f'] += int(v[26])
            if key == ('K122', '03'): d03[v[5]] = d03.get(v[5], 0) + int(v[9])
            if key == ('K122', '04') and d03.get(v[5]) != int(v[9]): errs.append(f'{v[5]}: 明細の単位合計 {d03.get(v[5])} != 集計 {v[9]}')
            if key == ('K122', '04') and int(v[12]) != int(v[21]) + int(v[20]): errs.append(f'{v[5]}: 総費用額 != 給付費+利用者負担')
        for c, s in sums.items():
            if s['h'] != (s['n'], s['u'], s['c'], s['b'], s['f']): errs.append(f'市町村{c}: K112 {s["h"]} != K122計 {(s["n"], s["u"], s["c"], s["b"], s["f"])}')
    return errs, rows

if __name__ == '__main__':
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    total = 0
    for f, t in zip(files, ['K11', 'K61']):
        errs, rows = check(f, t, True)
        total += len(errs)
        print(f'== {Path(f).name}: {len(rows)} 行, 指摘 {len(errs)} 件')
        for e in errs: print('  -', e)
    sys.exit(1 if total else 0)
