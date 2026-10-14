# 架空データだけで検証（本物の児童・受給者証は使わない）
import subprocess, sys
from datetime import date
import leo_billing as L
kids = {
  'テスト児童Ａ': {'受給者証番号': '9900000001', '市町村番号': '999999', '種別': '放デイ', '上限月額': 4600, 'カナ': 'テストジドウエー', '保護者カナ': 'テスト　ホゴシャ',
                  '契約日数': 23, '契約開始日': '20260401', '初回提供日': '20260403'},
  'テスト児童Ｂ': {'受給者証番号': '9900000002', '市町村番号': '999999', '種別': '児発', '上限月額': 4600, '無償化': True, 'カナ': 'ﾃｽﾄｼﾞﾄﾞｳB',
                  '契約日数': 23, '契約開始日': '20260401', '初回提供日': '20260410'},
  'テスト児童Ｃ': {'受給者証番号': '9900000003', '市町村番号': '999998', '種別': '放デイ', '上限月額': 0, 'カナ': 'テストジドウシー',
                  '契約日数': 10, '契約開始日': '20260501', '減算': ['未計画']},
}
R = []
for d in (2, 4, 6): R.append(dict(day=date(2099, 1, d), child='テスト児童Ａ', status='出席', start='15:00', end='17:00:00', pick='◯', drop='◯'))   # 2h→区分2
R.append(dict(day=date(2099, 1, 7), child='テスト児童Ａ', status='出席', start='10:00', end='15:30', pick='◯', drop='', holiday=True))         # 休業日5.5h→区分3
R.append(dict(day=date(2099, 1, 8), child='テスト児童Ａ', status='出席', start='16:00', end='17:00', kosodate=True))                            # 1h→区分1＋子育て
for d in (9, 10, 11, 12, 13): R.append(dict(day=date(2099, 1, d), child='テスト児童Ａ', status='欠席', absent_support=True))                   # 5回→4回まで
R.append(dict(day=date(2099, 1, 5), child='テスト児童Ｂ', status='出席', start='10:00', end='14:00', pick='◯', drop='◯'))                     # 4h→区分3
R.append(dict(day=date(2099, 1, 5), child='テスト児童Ｃ', status='出席', start='14:30', end='16:00'))                                        # 1.5h→区分1・未計画
claim, jis, bills, warn = L.build('209901', kids, R)
a, b, c = bills
ua = 609 * 3 + 666 + 574 + 80 + 94 * 4 + 54 * (4 + 3)
assert a['units'] == ua, (a['units'], ua)
assert a['cost'] == int(ua * 10.36) and a['burden'] == min(int(a['cost'] * 0.1), 4600)
assert b['units'] == 980 + 54 * 2 and b['burden'] == 0 and b['futan2'] == 0
assert c['units'] == 402 and 'H580' in c['det']          # 放デイ４１１・未計画（基本コードが変わる）
# 事業所全体の減算（評価減）も切り替わる
_, _, bb, _ = L.build('209901', kids, R, office_gensan=['評価減']); assert '2311' not in bb[0]['det'] and 'H593' in bb[0]['det'], bb[0]['det']
cb, jb = L.to_csv(claim), L.to_csv(jis)
assert cb.endswith(b'\r\n') and b'\n' not in cb.replace(b'\r\n', b'')
open('K1129901.CSV', 'wb').write(cb); open('K6119901.CSV', 'wb').write(jb)
print('OK', [(x['name'], x['units'], x['cost'], x['burden']) for x in bills], '行数', len(claim), len(jis)); print('warn', warn)
sys.exit(subprocess.call([sys.executable, 'spec_check.py', 'K1129901.CSV', 'K6119901.CSV', '--sjis']))
