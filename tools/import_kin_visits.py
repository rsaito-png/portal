#!/usr/bin/env python3
# 下書き: /workspace/kintoun_visits_202610.json を kin_visit へ冪等に取り込む（(source_file, source_row) で upsert）。
# 想定: {"visits":[{row, visit_date, user_name, staff_name, second_staff, service, start, end, content, note, report1..5, instruction_id, addition, signed, signed_at, signer_kind}]}
# 実ファイルの形が違えば KEYS の対応を直す。利用者は kin_user.name で照合（無ければ停止）。
import json,os,subprocess,sys
f=sys.argv[1] if len(sys.argv)>1 else '/workspace/kintoun_visits_202610.json'
d=json.load(open(f)); vs=d['visits'] if isinstance(d,dict) else d
def q(s): return json.loads(subprocess.run(['curl','-s','-X','POST','https://api.supabase.com/v1/projects/zvrardoyxocmqhvyddnf/database/query','-H','Authorization: Bearer '+os.environ['SUPABASE_ACCESS_TOKEN_SQL'],'-H','User-Agent: curl/8','-H','Content-Type: application/json','-d',json.dumps({'query':s})],capture_output=True,text=True).stdout)
L=lambda x:'null' if x in (None,'') else "'"+str(x).replace("'","''")+"'"
users={r['name'] for r in q('select name from kin_user')}
miss={v['user_name'] for v in vs if v['user_name'] not in users}
if miss: sys.exit('kin_user に無い利用者: '+', '.join(sorted(miss)))
src=os.path.basename(f); out=[]
for v in vs:
    sig=v.get('signed'); 
    out.append(f"""insert into kin_visit(visit_date,user_id,staff_name,second_staff,service,start_time,end_time,content,note,report1,report2,report3,report4,report5,instruction_id,addition,sign_status,signed_at,signer_kind,source_file,source_row)
select {L(v['visit_date'])},id,{L(v['staff_name'])},{L(v.get('second_staff'))},{L(v.get('service') or '身体介護')},{L(v['start'])},{L(v['end'])},{L(v.get('content'))},{L(v.get('note'))},{L(v.get('report1'))},{L(v.get('report2'))},{L(v.get('report3'))},{L(v.get('report4'))},{L(v.get('report5'))},{L(v.get('instruction_id'))},{L(v.get('addition'))},{"'署名済み'" if sig else "'未署名'"},{L(v.get('signed_at'))},{L(v.get('signer_kind'))},{L(src)},{int(v['row'])} from kin_user where name={L(v['user_name'])}
on conflict (source_file,source_row) do update set visit_date=excluded.visit_date,user_id=excluded.user_id,staff_name=excluded.staff_name,second_staff=excluded.second_staff,service=excluded.service,start_time=excluded.start_time,end_time=excluded.end_time,content=excluded.content,note=excluded.note,report1=excluded.report1,report2=excluded.report2,report3=excluded.report3,report4=excluded.report4,report5=excluded.report5,instruction_id=excluded.instruction_id,addition=excluded.addition,updated_at=now();""")
q('\n'.join(out)); print(len(out),'件 upsert')
