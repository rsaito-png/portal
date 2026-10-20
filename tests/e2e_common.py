# E2E 共通: 一時ユーザー（検証用の別事業所 E2E-TEST）を作る／消す。rsaito@ は使わない。秘密情報は出力しない
import re, os, json, time, urllib.request, urllib.parse, subprocess
URL = 'https://zvrardoyxocmqhvyddnf.supabase.co'
SK = os.environ['SUPABASE_SERVICE_KEY']
OFFICE = 'E2E-TEST'
def api(method, path, body=None, key=SK):
    path = urllib.parse.quote(path, safe="/?&=.,()*:%")
    r = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=representation', 'User-Agent': 'curl/8'})
    try:
        t = urllib.request.urlopen(r).read().decode(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise Exception(f'{e.code} {e.read().decode()[:300]}')
def mk_admin(tag):
    email = f'e2e-{tag}-{int(time.time())}@example.com'; pw = 'E2e-' + os.urandom(6).hex()
    u = api('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True})
    api('POST', '/rest/v1/bp_profiles', {'id': u['id'], 'office': OFFICE, 'role': 'admin', 'display_name': 'E2E管理者'})
    return u['id'], email, pw
def sql(q):
    p = subprocess.run(['python3', '-c', '''
import sys,os,json,urllib.request
r=urllib.request.Request("https://api.supabase.com/v1/projects/zvrardoyxocmqhvyddnf/database/query",data=json.dumps({"query":sys.argv[1]}).encode(),headers={"Authorization":"Bearer "+os.environ["SUPABASE_ACCESS_TOKEN_SQL"],"Content-Type":"application/json","User-Agent":"curl/8"})
try: print(urllib.request.urlopen(r).read().decode()[:2000])
except urllib.error.HTTPError as e: print(e.code,e.read().decode()[:1500])
''', q], capture_output=True, text=True); return p.stdout.strip()
TABLES = ['bp_plan_draft_requests','bp_support_plan_signatures','bp_support_plan_revisions','bp_support_plans','bp_contract_signatures','bp_contracts','bp_contract_templates','bp_journal','bp_service_records','bp_daily_reports','bp_tasks','bp_manuals','bp_staff_notes','bp_files','bp_staff_shifts','bp_staff_members','bp_billing_settings','bp_worker_private','bp_profiles']
def cleanup(user_ids):
    # 追記専用(署名)テーブルのトリガーは通常の操作では消せない。検証用の別事業所 E2E-TEST の行だけを、1トランザクション内でトリガー停止して削除する
    dels = ''.join(f"delete from public.{t} where office='{OFFICE}';" for t in TABLES)
    print('cleanup rows:', sql("begin; set local session_replication_role = replica; " + dels + " commit;"))
    for uid in user_ids:
        try: api('DELETE', f'/auth/v1/admin/users/{uid}')
        except Exception as e: print('del user', e)
    print('left in E2E-TEST:', sql("select (select count(*) from bp_profiles where office='E2E-TEST') p, (select count(*) from bp_contract_signatures where office='E2E-TEST') s"))

def purge_e2e_users():
    # 検証用の e2e-*@example.com だけを消す(他のユーザーには触れない)
    n = 0
    for u in api('GET', '/auth/v1/admin/users?per_page=200')['users']:
        if re.match(r'^e2e-[a-z]+-\d+@example\.com$', u.get('email') or ''):
            api('DELETE', f"/auth/v1/admin/users/{u['id']}"); n += 1
    print('purged e2e users:', n)

def purge_e2e_storage():
    # E2E-TEST/ 配下の検証ファイルだけを消す
    for b in ['bp-manual-images', 'bp-staff-files']:
        def walk(p):
            out = []
            for o in api('POST', f'/storage/v1/object/list/{b}', {'prefix': p, 'limit': 100}):
                n = p + '/' + o['name']; out += walk(n) if o['id'] is None else [n]
            return out
        fs = walk('E2E-TEST')
        if fs: api('DELETE', f'/storage/v1/object/{b}', {'prefixes': fs})
