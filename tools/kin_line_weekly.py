#!/usr/bin/env python3
"""金斗雲：署名待ちの訪問がある利用者へ、署名リンクをLINEで送る（毎週日曜9:00 JST 想定）。
  既定は【ドライラン】（送信もリンク発行もしない。対象と文面だけ出力）。
  本番送信は --send を付け、かつ /home/box/tools/line/kin_weekly_enabled に「1」があるときだけ。
  import-ids FILE  : [{"user_name","line_user_id"}] を kin_user.line_user_id に取り込む（値は表示しない）
秘密：LINE_CHANNEL_ACCESS_TOKEN(環境変数) / /home/box/tools/supabase/service_role_key。夜間(0-6時)は送らない。
リンクは kin_sign_issue と同じ仕様（192bit・1週間・1回限り・古い未使用は失効）で kin_sign_links に直接作成。"""
import json, sys, os, urllib.request, urllib.error, datetime, secrets
BASE = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1/'
KEY = open('/home/box/tools/supabase/service_role_key').read().strip()
SIGN = 'https://rsaito-png.github.io/portal/sign.html?t='
FLAG = '/home/box/tools/line/kin_weekly_enabled'
JST = datetime.timezone(datetime.timedelta(hours=9))
def api(path, method='GET', body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    with urllib.request.urlopen(req) as r:
        b = r.read(); return json.loads(b) if b else None
def line_push(uid, text):
    tok = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', '')
    if not tok: return False, 'LINE_CHANNEL_ACCESS_TOKEN未設定'
    req = urllib.request.Request('https://api.line.me/v2/bot/message/push', method='POST',
        data=json.dumps({'to': uid, 'messages': [{'type': 'text', 'text': text}]}).encode(),
        headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'X-Line-Retry-Key': secrets.token_hex(16)[:8] + '-0000-4000-8000-' + secrets.token_hex(6)})
    try:
        urllib.request.urlopen(req, timeout=20); return True, None
    except urllib.error.HTTPError as e: return False, ('HTTP %d ' % e.code + e.read().decode()[:300])
    except Exception as e: return False, str(e)[:300]
def message(name, url):
    return (f'{name}様\n居宅介護事業所 金斗雲です。\n今週分の提供実績記録の署名をお願いいたします。\n'
            f'下のリンクからスマートフォンで署名できます。\n{url}\n'
            'リンクの有効期限は1週間で、1回のみ使えます。ご不明な点はお電話ください。')
def main():
    a = sys.argv[1:]
    if a[:1] == ['import-ids']:
        n = 0
        for x in json.load(open(a[1])):
            if not x.get('line_user_id'): continue
            r = api('kin_user?name=eq.' + urllib.request.quote(x['user_name']), 'PATCH', {'line_user_id': x['line_user_id']})
            n += len(r); print(x['user_name'], '取り込み' if r else '該当なし')
        return
    send = '--send' in a
    now = datetime.datetime.now(JST)
    if send:
        if not (os.path.exists(FLAG) and open(FLAG).read().strip() == '1'): sys.exit('本番フラグ無効のため送信しません（ドライランにするには --send を外す）')
        if now.hour < 6 and '--force' not in a: sys.exit('夜間(0-6時)は送りません')
    users = api('kin_user?select=id,name,line_user_id&order=id')
    pend = {}
    for v in api('kin_visit?select=user_id&sign_status=neq.' + urllib.request.quote('署名済み')): pend[v['user_id']] = pend.get(v['user_id'], 0) + 1
    print(('【本番送信】' if send else '【ドライラン：送信・リンク発行なし】'), now.strftime('%Y-%m-%d %H:%M JST'))
    ok = ng = skip = 0
    for u in users:
        n = pend.get(u['id'], 0)
        if not n: continue
        if not u.get('line_user_id'):
            print(f"  未連携: {u['name']}（署名待ち{n}件）"); skip += 1
            if send: api('kin_line_send_log', 'POST', {'user_id': u['id'], 'status': '未連携', 'pending_visits': n})
            continue
        if not send:
            print(f"  送信予定: {u['name']}（署名待ち{n}件）"); print('    ' + message(u['name'], SIGN + '<発行されるトークン>').replace('\n', '\n    ')); ok += 1; continue
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        api('kin_sign_links?user_id=eq.%d&used_at=is.null&expires_at=gt.%s' % (u['id'], urllib.request.quote(now_iso)), 'PATCH', {'expires_at': now_iso})
        t = secrets.token_hex(24)
        link = api('kin_sign_links', 'POST', {'token': t, 'user_id': u['id']})[0]
        good, err = line_push(u['line_user_id'], message(u['name'], SIGN + t))
        api('kin_line_send_log', 'POST', {'user_id': u['id'], 'status': '成功' if good else '失敗', 'error': err, 'pending_visits': n, 'expires_at': link['expires_at']})
        print(f"  {'成功' if good else '失敗'}: {u['name']}", err or ''); ok += good; ng += (not good)
    print(f'送信{"" if send else "予定"} {ok}件 / 失敗 {ng}件 / 未連携 {skip}件')
main()
