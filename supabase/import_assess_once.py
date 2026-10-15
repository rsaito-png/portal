#!/usr/bin/env python3
"""アセスメント回答シート（Googleフォーム）→ ポータル 一括登録（今回限り・cron化しない）。
使い方: python3 import_assess_once.py rows.json   （rows.json = フォームの回答 1 のCSVを行配列にしたもの。個人情報なので repo に置かない）
service_role は /home/box/tools/supabase/service_role_key（出力しない）。既存の入力済みの値は上書きしない（空欄だけ補完）。"""
import json, re, sys, urllib.request
K = open('/home/box/tools/supabase/service_role_key').read().strip()
U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1/'
H = {'apikey': K, 'Authorization': 'Bearer ' + K, 'Content-Type': 'application/json'}
def req(path, method='GET', body=None, prefer=None):
    h = dict(H); 
    if prefer: h['Prefer'] = prefer
    r = urllib.request.Request(U + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as f: t = f.read().decode(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e: raise SystemExit(f'{path}: {e.code} {e.read().decode()[:200]}')
# 列番号（0始まり）→ data のキー
COLS = {3:'rel',4:'allergy',5:'allergy_detail',6:'utensil',7:'likes',8:'dislikes',9:'amount',10:'urine',11:'wipe',12:'stool',13:'handwash',14:'gargle',15:'dress',16:'undress',17:'button',
 18:'play_home',19:'play_out',20:'interest',21:'personality',22:'panic',23:'other_msg',24:'temp',25:'convulsion',26:'convulsion_detail',27:'h_bleed',28:'h_fall',29:'h_skin',30:'h_earnose',31:'h_hernia',32:'h_joint',
 33:'h_cold',34:'h_tonsil',35:'h_asthma',36:'h_allergic',37:'h_vaccine',38:'h_rash',39:'h_drugrash',40:'h_vomit',41:'h_diarrhea',42:'h_constipation',43:'under_doctor',44:'health_other',
 45:'wish_life',46:'wish_habit',47:'wish_motor',48:'wish_cog',49:'wish_lang',50:'wish_human',51:'birth',52:'school',53:'diagnosis',54:'techo',55:'agencies',56:'visit_status',57:'meds_status',58:'family',59:'other_service',
 62:'hp_pediatric',63:'hp_ortho',64:'hp_ent',65:'hp_derm',66:'hp_other',67:'meds_regular',69:'doc_insurance',70:'photo_consent',71:'photo_detail',72:'doc_jukyusha'}
# シートの行（1始まり、ヘッダ除く）→ (ポータルの児童名, カナ)。名前は姓＋全角スペース＋名。カナはヘッダの読み仮名から。
NAMES = {1:('藤井\u3000泰','フジイ\u3000ヤスシ'),2:('裏川\u3000遥大','ウラカワ\u3000ハル'),3:('湯上\u3000奏輔','ユガミ\u3000ソウスケ'),4:('日置\u3000大智','ヒオキ\u3000ダイチ'),
 5:('谷口\u3000惺太朗','タニグチ\u3000セイタロウ'),6:('高畑\u3000遥平','タカハタ\u3000ヨウヘイ'),7:('小林\u3000皆翔','コバヤシ\u3000カイト'),8:('ちねん\u3000のあ','チネン\u3000ノア'),
 9:('市川\u3000碧音','イチカワ\u3000アオト'),10:('井上\u3000凪','イノウエ\u3000ナギ'),11:('足立\u3000煌大','アダチ\u3000コウダイ'),12:('山下\u3000透和','ヤマシタ\u3000トワ'),13:('加藤\u3000湊','カトウ\u3000ミナト')}
rows = json.load(open(sys.argv[1]))
g = lambda r, i: (r[i].strip() if i < len(r) else '')
exist = {x['name']: x for x in req('leo_children?select=name,kana')}
info = {x['name']: x for x in req('leo_child_info?select=*')}
n_kid = n_info = n_as = 0
for i, r in enumerate(rows[1:], 1):
    name, kana = NAMES[i]
    if name not in exist:   # 新規は名前・カナだけ（受給者証は未入力。既存児童は一切触らない）
        req('leo_children', 'POST', [{'name': name, 'kana': kana}], 'return=minimal'); n_kid += 1
    elif not exist[name].get('kana'):
        req('leo_children?name=eq.' + urllib.request.quote(name), 'PATCH', {'kana': kana}, 'return=minimal')
    ph = g(r, 74) or g(r, 61)
    cand = {'guardian_name': re.sub(r'[（(].*$', '', g(r, 2)).strip() or None, 'guardian_phone': ph[:60] or None, 'home_address': g(r, 60)[:200] or None, 'emergency_contact': g(r, 68)[:200] or None}
    cur = info.get(name, {})
    fill = {k: v for k, v in cand.items() if v and not cur.get(k)}
    if name not in info: fill['name'] = name; req('leo_child_info', 'POST', [fill], 'return=minimal'); n_info += 1
    elif fill: req('leo_child_info?name=eq.' + urllib.request.quote(name), 'PATCH', fill, 'return=minimal'); n_info += 1
    data = {k: g(r, c) for c, k in COLS.items() if g(r, c)}
    if "--dry" in sys.argv: continue
    ts = g(r, 0)[:10].replace('/', '-'); m = re.match(r'(\d{4})-(\d+)-(\d+)', ts)
    req('leo_child_assess?on_conflict=name', 'POST', [{'name': name, 'data': data, 'source': 'Googleフォーム ' + ts, 'answered_at': '%s-%02d-%02d' % (m[1], int(m[2]), int(m[3])) if m else None}], 'resolution=ignore-duplicates,return=minimal'); n_as += 1
print(f'児童追加 {n_kid} / 利用者情報 {n_info} / アセスメント {n_as}')
