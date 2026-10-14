# 架空データだけで検証（本物の児童・受給者証は使わない）
from datetime import date
import leo_billing as L
kids = {
  'テスト児童Ａ': {'受給者証番号': '9900000001', '市町村番号': '999999', '種別': '放デイ', '上限月額': 4600, 'カナ': 'ﾃｽﾄｼﾞﾄﾞｳA', '契約日数': 23, '契約開始日': '20260401'},
  'テスト児童Ｂ': {'受給者証番号': '9900000002', '市町村番号': '999999', '種別': '児発', '上限月額': 4600, '無償化': True, 'カナ': 'ﾃｽﾄｼﾞﾄﾞｳB', '契約日数': 23, '契約開始日': '20260401'},
}
R = []
for d in (2, 4, 6): R.append(dict(day=date(2099, 1, d), child='テスト児童Ａ', status='出席', start='15:00', end='17:00', pick='◯', drop='◯'))   # 2h→区分2
R.append(dict(day=date(2099, 1, 7), child='テスト児童Ａ', status='出席', start='10:00', end='15:30', pick='◯', drop='', holiday=True))         # 休業日5.5h→区分3
R.append(dict(day=date(2099, 1, 8), child='テスト児童Ａ', status='出席', start='16:00', end='17:00', kosodate=True))                            # 1h→区分1＋子育て
for d in (9, 10, 11, 12, 13): R.append(dict(day=date(2099, 1, d), child='テスト児童Ａ', status='欠席', absent_support=True))                   # 5回→4回まで
R.append(dict(day=date(2099, 1, 5), child='テスト児童Ｂ', status='出席', start='10:00', end='14:00', pick='◯', drop='◯'))                     # 4h→区分3
claim, jis, bills = L.build('209901', kids, R)
a, b = bills[0], bills[1]
# 期待値（手計算）
ua = 609 * 3 + 666 + 574 + 80 + 94 * 4 + 54 * (4 + 3)
assert a['units'] == ua, (a['units'], ua)
assert a['cost'] == int(ua * 10.42) and a['burden'] == min(int(a['cost'] * 0.1), 4600)
assert b['units'] == 980 + 54 * 2 and b['burden'] == 0
cb, jb = L.to_csv(claim), L.to_csv(jis)
assert cb.endswith(b'\r\n') and b'\n' not in cb.replace(b'\r\n', b'')
cb.decode('cp932'); jb.decode('cp932')
open('/workspace/portal/billing/TJ111.CSV', 'wb').write(cb); open('/workspace/portal/billing/TJ611.CSV', 'wb').write(jb)
print('OK', 'A', a['units'], '単位', a['cost'], '円 負担', a['burden'], '／ B', b['units'], '単位 負担', b['burden'], '／ 行数', len(claim), len(jis))
