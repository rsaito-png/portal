#!/usr/bin/env python3
# /workspace/kintoun_visits_202610.json ({"records":[...]}) を kin_visit へ冪等に取り込む。(source_file, source_row) で upsert。
# 利用者は kin_user.name で照合（無ければ停止）。職員名が空の行は空のまま。
import json,os,subprocess,sys
f=sys.argv[1] if len(sys.argv)>1 else '/workspace/kintoun_visits_202610.json'
vs=json.load(open(f))['records']
def q(s): return json.loads(subprocess.run(['curl','-s','-X','POST','https://api.supabase.com/v1/projects/zvrardoyxocmqhvyddnf/database/query','-H','Authorization: Bearer '+os.environ['SUPABASE_ACCESS_TOKEN_SQL'],'-H','User-Agent: curl/8','-H','Content-Type: application/json','-d','@-'],input=json.dumps({'query':s}),capture_output=True,text=True).stdout)
L=lambda x:'null' if x in (None,'') else "'"+str(x).replace("'","''")+"'"
users={r['name'] for r in q('select name from kin_user')}
miss={v['user_name'] for v in vs if v['user_name'] not in users}
if miss: sys.exit('kin_user に無い利用者: '+', '.join(sorted(miss)))
src=os.path.basename(f)
cols="visit_date,user_id,staff_name,service,start_time,end_time,content,note,report1,report2,report3,report4,report5,instruction_id,sign_status,signed_at,signer_kind,sign_reason,late_signed,signature_url,pdf_url,recorded_at,staff_confirmed_at,staff_confirmed,sv_confirm_1,sv_confirm_2,sv_confirm_3,sab_confirmed,source_file,source_row".split(',')
out=[]
for v in vs:
    vals=[L(v['service_date']),'id',L(v.get('staff_name')),L(v.get('service_type') or '身体介護'),L(v['start']),L(v['end']),L(v.get('content')),L(v.get('notes'))]+[L(v.get(f'report_{i}')) for i in range(1,6)]+[L(v.get('instruction_id')),
      "'署名済み'" if v['sign_status']=='署名済' else "'未署名'",L(v.get('signed_at') and v['signed_at']+'+09'),L(v.get('signer_type')),L(v.get('sign_reason')),L(v.get('late_signed')),L(v.get('sign_image_url')),L(v.get('pdf_url')),
      L(v.get('recorded_at') and v['recorded_at']+'+09'),L(v.get('staff_confirmed_at') and v['staff_confirmed_at']+'+09'),'true' if v.get('staff_confirmed_at') else 'false',
      L(v.get('sv_confirm_1')),L(v.get('sv_confirm_2') and v['sv_confirm_2']+'+09'),L(v.get('sv_confirm_3')),'true' if v.get('sv_confirm_1') else 'false',L(src),str(int(v['source_row']))]
    upd=','.join(f"{c}=excluded.{c}" for c in cols[:-2])
    out.append(f"insert into kin_visit({','.join(cols)}) select {','.join(vals)} from kin_user where name={L(v['user_name'])} on conflict (source_file,source_row) do update set {upd},updated_at=now();")
r=q('\n'.join(out)); print(r if r else '', len(out),'件 upsert')
