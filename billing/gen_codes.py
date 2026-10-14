"""サービスコード表（service_codes_3.xlsx：令和6年度版。r8_svc1.xlsx は障害児を含まないため）から、
レオで使う基本報酬コードと減算で切り替わるコード、加算コードを抜き出して leo_codes.json を作る。
令和8年度の報酬算定構造（r8_001658031）で児発 901/928/980・放デイ 574/609/666 単位は変わっていないことを確認済み。"""
import json, re, sys, openpyxl
SRC = '/workspace/chamu-billing/specs/service_codes_3.xlsx'
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
BASE = {'61': {'区分1': '児発２１４１１', '区分2': '児発２１４１２', '区分3': '児発２１４１３'},
        '63': {'区分1': '放デイ４１１', '区分2': '放デイ４１２', '区分3': '放デイ４１３'}}
SHEET = {'61': '25児童発達支援(基本１)', '63': '27放課後等デイ(基本１)'}
ADD = {'61': {'欠席': '児発欠席時対応加算', '送迎': '児発送迎加算１', '子育て': '児発子育てサポート加算'},
       '63': {'欠席': '放デイ欠席時対応加算Ⅰ', '送迎': '放デイ送迎加算１', '子育て': '放デイ子育てサポート加算'}}
norm = lambda s: s.replace('評減', '評価減').replace('開減', '開所減').replace('１', '1').replace('２', '2')
out = {'base': {}, 'addon': {}}
def rows(t):
    for r in wb[t].iter_rows(values_only=True):
        s = [str(c).replace('\n', '') for c in r if c not in (None, '')]
        if len(s) > 2 and s[0] in ('61', '63'): yield s
for k in ('61', '63'):
    for b, name in BASE[k].items():
        for s in rows(SHEET[k]):
            if s[2] == name or s[2].startswith(name + '・'):
                u = [x for x in s if re.fullmatch(r'\d+', x)][-1]
                var = '・'.join(sorted(norm(x) for x in s[2].split('・')[1:]))
                out['base'][f'{k}{b}{"・" + var if var else ""}'] = [s[1], int(u)]
    for a, name in ADD[k].items():
        s = next(s for s in rows(SHEET[k].replace('基本１', '基本２')) if s[2] == name)
        out['addon'][k + a] = [s[1], int([x for x in s if re.fullmatch(r'\d+', x)][-1])]
json.dump(out, open('leo_codes.json', 'w'), ensure_ascii=False, indent=0, sort_keys=True)
print(len(out['base']), out['addon'])
