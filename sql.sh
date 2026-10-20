#!/bin/bash
# usage: sql.sh file.sql  (Management API。トークンは環境変数)
python3 - "$1" <<'PY'
import sys,os,json,urllib.request
q=open(sys.argv[1]).read()
r=urllib.request.Request('https://api.supabase.com/v1/projects/zvrardoyxocmqhvyddnf/database/query',data=json.dumps({'query':q}).encode(),headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN_SQL'],'Content-Type':'application/json','User-Agent':'curl/8'})
try: print(urllib.request.urlopen(r).read().decode()[:3000])
except urllib.error.HTTPError as e: print(e.code,e.read().decode()[:2000])
PY
