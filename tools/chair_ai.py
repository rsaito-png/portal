#!/usr/bin/env python3
"""会長ページのAI整理（1日1回・朝6時以降）。AIの判断は「1回のまとめ処理」だけ。
  export            : 整理対象を JSON で出力（AIがこれを読む）
  apply FILE.json   : AIの判断を書き込む。形式:
      {"ideas":[{"id":1,"bucket":"安藤","ai_note":"..","priority":1-5,"due":"YYYY-MM-DD"|null,"stale":false}],
       "today":[id,id,id]}   today は「あとで」「会長が判断」の未完了から最大3つ
  fallback          : AIが使えない日の代替（日数・重要度で機械的に3つ選ぶ）
service_role キーは /home/box/tools/supabase/service_role_key（表示しない）。夜間(6時前)は何もしない。"""
import json, sys, urllib.request, datetime
URL = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1/'
KEY = open('/home/box/tools/supabase/service_role_key').read().strip()
JST = datetime.timezone(datetime.timedelta(hours=9))
def api(path, method='GET', body=None):
    req = urllib.request.Request(URL + path, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    with urllib.request.urlopen(req) as r:
        b = r.read(); return json.loads(b) if b else None
now = datetime.datetime.now(JST); today = now.date().isoformat()
if now.hour < 6 and '--force' not in sys.argv: sys.exit('6時前は動きません')
cfg = {r['k']: r['v'] for r in api('chair_config')}
J, L = '会長が判断', 'あとで'
buckets = cfg.get('buckets', []) + [J, L]
def opens(): return api('chair_idea?status=eq.open&order=created_at')
def age(i): return (now - datetime.datetime.fromisoformat(i['created_at'])).days
def write_today(ids):
    api('chair_today?day=eq.' + today, 'DELETE')
    if ids: api('chair_today', 'POST', [{'day': today, 'rank': k + 1, 'idea_id': i} for k, i in enumerate(ids[:3])])
cmd = sys.argv[1] if len(sys.argv) > 1 else ''
if cmd == 'export':
    o = opens()
    print(json.dumps({'today': today, 'buckets': buckets, 'ideas': [{'id': i['id'], 'text': i['text'], 'bucket': i['bucket'], 'age_days': age(i),
        'new': i['ai_at'] is None, 'priority': i['priority'], 'due': i['due']} for i in o]}, ensure_ascii=False, indent=1))
elif cmd == 'apply':
    d = json.load(open(sys.argv[2])); cur = {i['id']: i for i in opens()}
    for x in d.get('ideas', []):
        i = cur.get(x['id'])
        if not i: continue
        p = {'ai_note': (x.get('ai_note') or '')[:200] or None, 'priority': x.get('priority'), 'due': x.get('due') or None, 'stale': bool(x.get('stale')), 'ai_at': now.isoformat()}
        if i['ai_at'] is None and x.get('bucket') in buckets: p['bucket'] = x['bucket']   # 会長が手で動かした分は上書きしない
        api('chair_idea?id=eq.%d' % i['id'], 'PATCH', p)
    cur = {i['id']: i for i in opens()}
    ids = [i for i in d.get('today', []) if i in cur and cur[i]['bucket'] in (J, L)][:3]
    write_today(ids); print('整理', len(d.get('ideas', [])), '件／今日の', len(ids), '件')
elif cmd == 'fallback':
    o = opens()
    for i in o:
        if i['ai_at'] is None: api('chair_idea?id=eq.%d' % i['id'], 'PATCH', {'ai_at': now.isoformat()})
        if age(i) >= 7 and not i['stale']: api('chair_idea?id=eq.%d' % i['id'], 'PATCH', {'stale': True})
    sc = lambda i: (i['priority'] or 3) * 2 + age(i) / 2 + (5 if i['due'] and i['due'] <= today else 0)
    c = sorted([i for i in o if i['bucket'] in (J, L)], key=sc, reverse=True)[:3]
    write_today([i['id'] for i in c]); print('代替で', len(c), '件')
else: print(__doc__)
