# 金斗雲「支給量と土曜の予定」(#kintoun/quota) を架空の通信で描いて確かめる。Supabase にはつながない。
#   python3 tools/kin_quota_ui_test.py  （OUT=保存先）
import json, os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = os.environ.get('OUT', '/tmp/kin-quota-shot'); os.makedirs(OUT, exist_ok=True)
def row(month, pc, fill_free, can, days):
    return {'quota_id': 1, 'user_id': 8, 'name': '見本大雅', 'service': '身体介護', 'monthly_minutes': 750, 'count_minutes': 30, 'fill_weekday': 6,
            'ledger_hours': 12.5, 'regular_count': pc, 'off_count': 0, 'add_count': len(days), 'planned_count': pc + len(days),
            'planned_minutes': (pc + len(days)) * 30, 'remain_minutes': 750 - (pc + len(days)) * 30, 'fill_added': len(days), 'fill_free': fill_free,
            'fill_can_add': can, 'actual_count': 7, 'actual_minutes': 210, 'over_plan': False, 'over_actual': False, 'days': days}
DATA = {'2026-11': [row('2026-11', 21, 3, 3, [{'id': 5, 'date': '2026-11-07', 'kind': '追加', 'start': None, 'end': None, 'memo': None}])],
        '2026-12': [row('2026-12', 23, 4, 2, [])]}
html = f"""<!doctype html><html lang=ja><head><meta charset=utf-8><link rel=stylesheet href="file://{ROOT}/theme-retro.css"></head>
<body class=portal><main style="max-width:760px;margin:auto;padding:12px"><div id=view></div></main><script>
const DEMO=false; const C={{supabaseUrl:'https://x',supabaseKey:'k'}}; const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
const DATA={json.dumps(DATA, ensure_ascii=False)}; window.__calls=[];
window.fetch=async(u,o)=>{{ window.__calls.push([u,o&&o.method,o&&o.body]); let b='[]';
  if(u.includes('rpc/kin_quota_month')) b=JSON.stringify(DATA[JSON.parse(o.body).p_month]||[]);
  else if(u.includes('kin_user')) b=JSON.stringify([{{id:8,name:'見本大雅',supply_body_hours:12.5}}]);
  return new Response(b,{{status:200}}); }};
</script><script src="file://{ROOT}/kin_quota.js"></script></body></html>"""
pathlib.Path('/tmp/kq.html').write_text(html)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 760, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file:///tmp/kq.html')
    pg.evaluate("KQ.month='2026-11';renderKinQuota()"); pg.wait_for_selector('text=土曜に入れられる回数')
    t = pg.inner_text('#view'); assert 'あと 3回' in t and '22回 ＝ 11時間' in t and '✅ 予定あり' in t, t
    pg.screenshot(path=f'{OUT}/kin-quota-nov.png', full_page=True)
    pg.click('text=＋ 土曜に入れる >> nth=0'); pg.wait_for_timeout(300)
    post = [c for c in pg.evaluate('window.__calls') if c[1] == 'POST' and 'kin_plan_day' in c[0]]
    assert post and json.loads(post[0][2])['plan_date'] == '2026-11-14' and json.loads(post[0][2])['kind'] == '追加', post
    pg.evaluate("KQ.month='2026-12';renderKinQuota()"); pg.wait_for_selector('text=あと 2回')
    pg.screenshot(path=f'{OUT}/kin-quota-dec.png', full_page=True)
    assert not errs, errs
    b.close()
print('kin_quota ui ok', OUT)
