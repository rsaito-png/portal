# E2E (Playwright + 実Supabase)。一時ユーザー(E2E-TEST事業所)で admin / worker を通す。使い方: python3 tests/e2e.py
import sys, os, re, json, time, datetime
sys.path.insert(0, os.path.dirname(__file__))
from e2e_common import *
from playwright.sync_api import sync_playwright, expect
BASE = 'http://localhost:3300/index.html'; SH = '/workspace/shots/'
today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y-%m-%d')
ok_n = 0; ng = []
def check(c, m):
    global ok_n
    print(('OK  ' if c else 'NG  ') + m)
    if c: ok_n += 1
    else: ng.append(m)
uids = []
aid, aemail, apw = mk_admin('admin'); uids.append(aid)
wemail = f'e2e-worker-{int(time.time())}@example.com'; wpw = 'E2e-' + os.urandom(6).hex()
def login(page, email, pw):
    page.goto(BASE); page.fill('#em', email); page.fill('#pw', pw); page.click('#login button >> nth=0'); page.wait_for_selector('#home:not([hidden])', timeout=15000)
def go(page, route):
    page.evaluate(f"location.hash='{route}'"); page.wait_for_timeout(300)
def wait_text(page, t, timeout=15000): page.wait_for_selector(f'text={t}', timeout=timeout)
def shot(page, n): page.screenshot(path=SH + f'rydeen-{n}.png', full_page=True)
try:
  with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/opt/google/chrome/chrome', args=['--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1000, 'height': 900}, accept_downloads=True); page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e)); page.on('dialog', lambda d: d.accept())
    # ---- 管理者ログイン ----
    login(page, aemail, apw); go(page, 'rydeen'); shot(page, '01-office-tile')
    page.click('text=B型システム'); wait_text(page, 'きょうの状況'); shot(page, '02-admin-home')
    check('職員画面' in page.inner_text('#view'), 'admin: B型の職員画面に入れる')
    # ---- 利用者追加（bp_create_worker） ----
    go(page, 'rydeen/users'); wait_text(page, '利用者一覧')
    page.fill('#n_name', '検証 太郎'); page.fill('#n_email', wemail); page.fill('#n_pw', wpw)
    page.fill('#u_recipient_number', '0000000001'); page.fill('#u_municipality_code', '242012'); page.click('text=追加 >> nth=-1'); wait_text(page, 'さんを追加しました')
    check('検証 太郎' in page.inner_text('#view'), 'admin: 利用者アカウントを追加できる')
    wid = api('GET', f'/rest/v1/bp_profiles?display_name=eq.{"検証 太郎"}&office=eq.{OFFICE}&select=id')[0]['id']; uids.append(wid)
    page.click('text=詳細・個人情報'); wait_text(page, '国保連請求用の項目'); page.fill('#u_name_kana', 'ｹﾝｼｮｳ ﾀﾛｳ'); page.fill('#u_contract_start', '2026-11-01'); page.click('text=保存 >> nth=-1'); wait_text(page, '保存しました')
    shot(page, '03-user-detail')
    # ---- 業務日誌 → 記録票自動転記 ----
    go(page, 'rydeen/journal'); wait_text(page, '業務日誌'); page.click('text=予定どおり全員を一括入力'); page.fill(f'#j_w_{wid}', '封入作業'); page.fill(f'#j_m_{wid}', '落ち着いて作業できた')
    page.click('text=保存して記録票に転記'); page.wait_for_timeout(2500); wait_text(page, '保存しました（1人）'); shot(page, '04-journal')
    recs = api('GET', f'/rest/v1/bp_service_records?worker_id=eq.{wid}&select=service_date,start_time,end_time,work_summary,signed_at')
    check(len(recs) == 1 and recs[0]['service_date'] == today and recs[0]['start_time'].startswith('09:30') and '封入作業' in recs[0]['work_summary'], '日誌→実績記録票: 自動転記された')
    # 欠席に変えると未署名の記録票は消える
    page.select_option(f'#j_st_{wid}', '欠席'); page.click('text=保存して記録票に転記'); page.wait_for_timeout(2500); wait_text(page, '保存しました（1人）')
    check(len(api('GET', f'/rest/v1/bp_service_records?worker_id=eq.{wid}&select=id')) == 0, '日誌を欠席に変更→未署名の記録票は消える')
    page.select_option(f'#j_st_{wid}', '通所'); page.fill(f'#j_s_{wid}', '09:30'); page.fill(f'#j_e_{wid}', '15:00'); page.fill(f'#j_b_{wid}', '60'); page.fill(f'#j_w_{wid}', '封入作業'); page.click('text=保存して記録票に転記'); page.wait_for_timeout(2500); wait_text(page, '保存しました（1人）')
    # ---- 記録票の署名 ----
    go(page, 'rydeen/records'); wait_text(page, 'サービス提供実績記録票'); (page.locator('text=記録票・署名').count() and page.click('text=記録票・署名')); wait_text(page, '利用者に署名してもらう')
    cv = page.locator('#rc_sig'); bb = cv.bounding_box(); page.mouse.move(bb['x'] + 30, bb['y'] + 80); page.mouse.down(); page.mouse.move(bb['x'] + 150, bb['y'] + 30, steps=8); page.mouse.move(bb['x'] + 260, bb['y'] + 120, steps=8); page.mouse.up()
    page.click('text=署名を保存'); wait_text(page, '署名を保存しました'); shot(page, '05-record-signed')
    r = api('GET', f'/rest/v1/bp_service_records?worker_id=eq.{wid}&select=signed_at,signature_data')[0]
    check(bool(r['signed_at']) and r['signature_data'].startswith('data:image/png;base64,'), '記録票: 署名画像が保存された')
    # 内容が変わる日誌修正→署名の取り直し
    go(page, 'rydeen/journal'); wait_text(page, '業務日誌'); page.fill(f'#j_e_{wid}', '15:30'); page.click('text=保存して記録票に転記'); page.wait_for_timeout(2500); wait_text(page, '署名を取り直してください')
    check(api('GET', f'/rest/v1/bp_service_records?worker_id=eq.{wid}&select=signed_at')[0]['signed_at'] is None, '署名済みの内容が変わる→署名が無効になり取り直し')
    go(page, 'rydeen/records'); wait_text(page, 'サービス提供実績記録票'); (page.locator('text=記録票・署名').count() and page.click('text=記録票・署名')); wait_text(page, '利用者に署名してもらう')
    cv = page.locator('#rc_sig'); bb = cv.bounding_box(); page.mouse.move(bb['x'] + 30, bb['y'] + 80); page.mouse.down(); page.mouse.move(bb['x'] + 200, bb['y'] + 40, steps=8); page.mouse.up(); page.click('text=署名を保存'); wait_text(page, '署名を保存しました')
    # ---- 請求CSV ----
    go(page, 'rydeen/billing'); wait_text(page, '事業所の請求設定', 20000); shot(page, '06-billing-blocked')
    check('事業所番号が未設定' in page.inner_text('#view'), '請求: 設定不足なら出力ブロック（要確認）')
    page.fill('#bt_office_no', '2410000001'); page.fill('#bt_office_name', '検証B型'); page.fill('#bt_region_code', '20'); page.fill('#bt_unit_price', '10.00')
    page.select_option('#bs_fee_class', 'Ⅰ'); page.fill('#bs_capacity', '20'); page.fill('#bs_avg_wage', '15000'); page.select_option('#bs_r8_scope', '対象'); page.check('.bs_addon[value=fukushi3]'); page.select_option('#bs_shogu_class', 'Ⅱロ')
    page.click('text=設定を保存'); wait_text(page, '設定を保存しました'); page.wait_for_selector('#dl_j111', timeout=20000); shot(page, '07-billing-ready')
    check('指摘 0 件' in page.inner_text('#view'), '請求: 形式チェック(IF仕様の機械チェック) 指摘0件')
    with page.expect_download() as d1: page.click('#dl_j111')
    p1 = d1.value.path(); b1 = open(p1, 'rb').read()
    with page.expect_download() as d2: page.click('#dl_j611')
    b2 = open(d2.value.path(), 'rb').read()
    ym = today[:4] + today[5:7]
    check(d1.value.suggested_filename.startswith('J111') and d2.value.suggested_filename.startswith('J611'), 'CSV: ファイル名 ' + d1.value.suggested_filename + ' / ' + d2.value.suggested_filename)
    t1 = b1.decode('cp932'); t2 = b2.decode('cp932')
    check(b'\r\n' in b1 and '"46"' in t1 and '"461000"' in t1 and '2410000001' in t1 and '"1701"' in t2, 'CSV: Shift_JIS/CRLF・サービス種類46・決定コード461000・様式1701')
    open('/tmp/e2e_J111.CSV', 'wb').write(b1); open('/tmp/e2e_J611.CSV', 'wb').write(b2)
    # ---- 契約・重説の電子署名 ----
    go(page, 'rydeen/contracts'); wait_text(page, '利用契約書・重要事項説明書'); page.click('text=標準テンプレートを作成'); wait_text(page, 'テンプレート（事業所情報・文面）'); page.wait_for_selector('text=利用契約書 >> nth=0')
    page.click('#view a:has-text("利用契約書") >> nth=0'); wait_text(page, 'テンプレート編集'); page.fill('#to_7', '2410000001'); page.click('text=保存（新しい版にする）'); wait_text(page, '作成済みの文書')
    page.select_option('#c_t', label='利用契約書'); page.fill('#cf_契約開始日', '令和8年11月1日'); page.fill('#cf_契約終了日', '令和9年10月31日'); page.click('text=作成する'); wait_text(page, '① 説明の実施記録')
    page.click('text=説明した、と記録する'); wait_text(page, '② 利用者の確認と署名'); shot(page, '08-contract-explained')
    for i in range(3): page.check(f'#cc_{i}')
    cv = page.locator('#cs_sig'); bb = cv.bounding_box(); page.mouse.move(bb['x'] + 20, bb['y'] + 60); page.mouse.down(); page.mouse.move(bb['x'] + 180, bb['y'] + 30, steps=8); page.mouse.up()
    page.click('text=同意して署名する'); page.wait_for_timeout(3000); shot(page, '09x'); print(page.inner_text('#msg') if page.locator('#msg').count() else '', page.inner_text('#view')[:600]); wait_text(page, '同意の証跡'); shot(page, '09-contract-signed')
    check('署名時から変更なし' in page.inner_text('#view') and re.search(r'[0-9a-f]{64}', page.inner_text('#view')) is not None, '契約: 署名済み・SHA-256保存・改ざんなし表示')
    cs = api('GET', f'/rest/v1/bp_contract_signatures?office=eq.{OFFICE}&select=id,content_hash')
    check(len(cs) == 1, '契約: 署名行が追記された')
    try: api('PATCH', f'/rest/v1/bp_contract_signatures?id=eq.{cs[0]["id"]}', {'signer_kind': 'x'}); check(False, '契約: 署名の更新は拒否されるべき')
    except Exception as e: check('追記専用' in str(e) or '42501' in str(e) or 'row-level' in str(e), '契約: 署名の更新はDBが拒否（追記専用）')
    # ---- 個別支援計画 ----
    import datetime as _d
    pd = (_d.date.today().replace(day=1) - _d.timedelta(days=10)).isoformat()
    api('POST', '/rest/v1/bp_journal', {'worker_id': wid, 'office': 'E2E-TEST', 'journal_date': pd, 'status': '通所', 'start_time': '10:00', 'end_time': '15:00', 'break_min': 60, 'work': '検証作業'})
    go(page, 'rydeen/plans'); wait_text(page, '新しい計画を作る'); page.click('text=作成して集計を取り込む'); wait_text(page, '支援記録の要約')
    check('利用は1日' in page.inner_text('#view'), '計画: 日誌から集計が自動挿入される')
    # ---- AI下書き（依頼→collect→下書きJSON→apply→画面）。下書きJSONは E2E_BOT_DRAFT があればボットが書いたものを待つ。なければ決め打ちで代用 ----
    import subprocess as _sp, glob as _g
    def tool(*a): r = _sp.run(['node', os.path.join(os.path.dirname(__file__), '..', 'tools', 'draft-plans.js'), *a], capture_output=True, text=True); return r.returncode, r.stdout + r.stderr
    page.click('button:has-text("AIで下書きを依頼")'); wait_text(page, '下書きを依頼しました')
    rq = api('GET', f'/rest/v1/bp_plan_draft_requests?office=eq.{OFFICE}&select=*')
    check(len(rq) == 1 and rq[0]['status'] == 'pending' and rq[0]['requested_by_name'] == 'E2E管理者', 'AI下書き: 依頼が1行(pending)追加された')
    check(page.locator('button:has-text("AIで下書きを依頼")').is_disabled(), 'AI下書き: 依頼中は再依頼ボタンが押せない')
    CF = '/tmp/ai-draft/e2e-collect.json'; DF = os.environ.get('E2E_BOT_DRAFT', '/tmp/ai-draft/e2e-draft.json')
    rc, out = tool('collect', '--office', OFFICE, '--out', CF); check(rc == 0 and '"pending": 1' in out, 'AI下書き: collect が依頼を拾う')
    col = json.load(open(CF)); r0 = col['requests'][0]
    check(oct(os.stat(CF).st_mode & 0o777) == '0o600' and r0['worker_name'] == '検証 太郎' and any('検証作業' in j['work'] for j in r0['journal']), 'AI下書き: 材料に氏名と日誌があり、ファイルは0600')
    leak = json.dumps(col, ensure_ascii=False); check('0000000001' not in leak and '242012' not in leak and 'recipient' not in leak, 'AI下書き: 受給者証番号などの個人情報は材料に含まれない')
    if os.environ.get('E2E_BOT_DRAFT'):
        print('WAITING_FOR_BOT_DRAFT', CF, DF, flush=True)
        for _ in range(900):
            if os.path.exists(DF): break
            time.sleep(1)
    else:
        json.dump({'drafts': [{'request_id': r0['request_id'], 'plan_id': r0['plan_id'], 'sections': {'assessment': {'利用者概要': '（AI）概要の下書き', '本人の意向': '（AI）意向の下書き'}, 'monitoring': {'総括': '（AI）総括の下書き'}, 'plan': {'長期目標': '（AI）長期目標の下書き', '短期目標': '（AI）短期目標の下書き'}, 'meeting': {'検討事項': '書かれてはいけない'}}}]}, open(DF, 'w'), ensure_ascii=False)
    rc, out = tool('apply', '--draft', DF, '--collect', CF); check(rc == 0 and 'done' in out, 'AI下書き: apply が書き込み完了 ' + out.strip().splitlines()[0][:80])
    check(not os.path.exists(CF) and not os.path.exists(DF), 'AI下書き: 材料と下書きのファイルが処理後に削除された')
    q1 = api('GET', f'/rest/v1/bp_plan_draft_requests?office=eq.{OFFICE}&select=status,done_at')[0]; check(q1['status'] == 'done' and q1['done_at'], 'AI下書き: 依頼が done になった')
    page.evaluate("renderRydeen('plans')"); wait_text(page, '下書き済み'); shot(page, '10a-plan-ai-draft')
    ai_n = page.locator('#view .aib').count()
    check(ai_n >= 2 and page.locator('#view .aib:has-text("AI下書き・要確認")').count() >= 2, f'AI下書き: 画面に「下書き済み」と項目ごとの「AI下書き・要確認」({ai_n}箇所)')
    check(page.input_value('#pf_assessment_0') != '' and page.input_value('#pf_assessment_1') != '', 'AI下書き: 計画の項目に下書きが入っている')
    check(page.input_value('#pf_meeting_2') == '', 'AI下書き: 会議録(事実を知り得ない)には書かれない')
    rv = api('GET', f'/rest/v1/bp_support_plan_revisions?office=eq.{OFFICE}&select=note,saved_by_name'); check(any('AI下書き' in (x['note'] or '') for x in rv), 'AI下書き: 版履歴に「AI下書きを反映」が残る')
    # 要確認が残ったまま確定には進めない
    for _ in range(2): page.click('#view >> text=へ進む >> nth=0'); page.wait_for_timeout(1500)
    page.click('#view >> text=本案として確定する'); wait_text(page, '「AI下書き・要確認」の項目が残っています'); check(api('GET', f'/rest/v1/bp_support_plans?office=eq.{OFFICE}&select=stage')[0]['stage'] == 'meeting', 'AI下書き: 要確認が残っていると本案の確定に進めない(会議録の段階で止まる)')
    # 職員が直す: 1項目は文面を直す、残りは「確認した」にチェック
    page.fill('#pf_assessment_0', '（検証）利用者概要'); page.fill('#pf_plan_1', '（検証）長期目標')
    for el in page.locator('input[id^=pf_ok_]').all():
        if el.is_visible(): el.check()
    page.click('text=保存（版履歴に追加）'); wait_text(page, '保存しました')
    pl = api('GET', f'/rest/v1/bp_support_plans?office=eq.{OFFICE}&select=content')[0]['content']
    check(len(pl['ai_draft']['fields']) == 0 and pl['assessment']['利用者概要'] == '（検証）利用者概要', 'AI下書き: 職員が直す/確認すると要確認の印が外れる')
    # 職員が書いた項目は再依頼でも上書きされない
    api('POST', '/rest/v1/bp_plan_draft_requests', {'office': OFFICE, 'plan_id': r0['plan_id'], 'requested_by_name': 'E2E管理者'})
    rc, out = tool('collect', '--office', OFFICE, '--out', CF); r1 = json.load(open(CF))['requests'][0]
    json.dump({'drafts': [{'request_id': r1['request_id'], 'plan_id': r1['plan_id'], 'sections': {'assessment': {'利用者概要': '上書きされてはいけない', '家族の意向': '（AI）家族の意向の下書き'}}}]}, open(DF, 'w'), ensure_ascii=False)
    rc, out = tool('apply', '--draft', DF, '--collect', CF)
    pl = api('GET', f'/rest/v1/bp_support_plans?office=eq.{OFFICE}&select=content')[0]['content']
    check(pl['assessment']['利用者概要'] == '（検証）利用者概要' and pl['assessment']['家族の意向'] == '（AI）家族の意向の下書き' and 'assessment|家族の意向' in pl['ai_draft']['fields'], 'AI下書き: 職員入力済みは上書きせず、空欄だけに新しい下書きが入る')
    page.evaluate("renderRydeen('plans')"); wait_text(page, '下書き済み')
    for el in page.locator('input[id^=pf_ok_]').all(): el.check()
    page.click('text=保存（版履歴に追加）'); wait_text(page, '保存しました')
    page.fill('#pf_assessment_0', '（検証）利用者概要'); page.fill('#pf_plan_1', '（検証）長期目標'); page.click('text=保存（版履歴に追加）'); wait_text(page, '保存しました')
    for _ in range(3): page.click('#view >> text=へ進む >> nth=0') if page.locator('text=へ進む').count() else None; page.wait_for_timeout(1200)
    page.click('text=本案として確定する'); wait_text(page, '利用者本人の確認と署名'); shot(page, '10-plan-final')
    for i in range(3): page.check(f'#pc_{i}')
    cv = page.locator('#ps_sig'); bb = cv.bounding_box(); page.mouse.move(bb['x'] + 20, bb['y'] + 60); page.mouse.down(); page.mouse.move(bb['x'] + 180, bb['y'] + 30, steps=8); page.mouse.up()
    page.click('text=同意して署名する'); wait_text(page, '同意の証跡'); shot(page, '11-plan-signed')
    check('確定時から変更なし' in page.inner_text('#view'), '計画: 署名・確定時ハッシュと一致')
    before = api('GET', f'/rest/v1/bp_support_plans?office=eq.{OFFICE}&select=content')[0]['content']
    api('POST', '/rest/v1/bp_plan_draft_requests', {'office': OFFICE, 'plan_id': r0['plan_id'], 'requested_by_name': 'E2E管理者'})
    rc, out = tool('collect', '--office', OFFICE, '--out', CF); tool('clean')
    q3 = api('GET', f'/rest/v1/bp_plan_draft_requests?office=eq.{OFFICE}&status=eq.error&select=result_note')
    check(len(q3) == 1 and '確定・署名後' in q3[0]['result_note'] and api('GET', f'/rest/v1/bp_support_plans?office=eq.{OFFICE}&select=content')[0]['content'] == before, 'AI下書き: 確定・署名後の計画には下書きしない(errorで記録・内容は不変)')
    # ---- 職員勤務実績 ----
    go(page, 'rydeen/staff'); wait_text(page, '職員の勤務実績'); page.fill('#sm_name', '検証 職員'); page.select_option('#sm_job', '職業指導員'); page.click('text=職員を追加'); wait_text(page, '出退勤の入力')
    page.click('text=月内にまとめて入力'); page.click('text=にまとめて追加'); wait_text(page, '件を追加しました')
    page.click('text=月次の勤務実績表を見る'); wait_text(page, '職員の勤務実績表'); shot(page, '12-staff-report')
    check('常勤換算' in page.inner_text('#view'), '勤務実績: 月次表が出る')
    # ---- タスク・マニュアル・メモ・日報 ----
    go(page, 'rydeen/tasks'); wait_text(page, '作業タスク'); page.click('text=新規作成'); page.fill('#t_title', '封入作業（検証）'); page.fill('#t_desc', 'チラシを封筒に入れます'); page.click('text=保存 >> nth=-1'); wait_text(page, '封入作業（検証）')
    go(page, 'rydeen/manuals'); wait_text(page, 'マニュアル'); page.click('text=新規作成'); page.fill('#m_title', '封入のやり方（検証）'); page.fill('#m_body', '1. 机をふく\n2. 入れる')
    png = '/tmp/e2e.png'; open(png, 'wb').write(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082'))
    page.set_input_files('#m_img', png); page.click('text=保存 >> nth=-1'); wait_text(page, '封入のやり方（検証）')
    check(len(api('GET', f'/rest/v1/bp_manuals?office=eq.{OFFICE}&select=image_paths')[0]['image_paths']) == 1, 'マニュアル: 画像アップロード')
    go(page, 'rydeen/notes'); wait_text(page, '職員専用メモ'); page.fill('#nt_title', '職員メモ（検証）'); page.fill('#nt_body', '利用者に見えない'); page.click('text=保存 >> nth=0'); wait_text(page, '職員メモ（検証）')
    open('/tmp/e2e.txt', 'w').write('検証ファイル'); page.set_input_files('#nf_file', '/tmp/e2e.txt'); page.click('text=アップロード'); wait_text(page, 'e2e.txt')
    shot(page, '13-notes')
    # ---- 利用者(worker) ----
    ctx2 = br.new_context(viewport={'width': 800, 'height': 900}); w = ctx2.new_page(); w.on('pageerror', lambda e: print('PAGEERROR', e)); w.on('dialog', lambda d: d.accept())
    login(w, wemail, wpw); go(w, 'rydeen/home'); wait_text(w, '今日の作業'); wait_text(w, '封入作業（検証）'); shot(w, '14-worker-home')
    check('さん、こんにちは' in w.inner_text('#view') and '検証 太郎' in w.inner_text('#view'), 'worker: 利用者画面に入れる')
    go(w, 'rydeen/journal'); w.wait_for_timeout(800)
    check('業務日誌' not in w.inner_text('#view') and '今日の作業' in w.inner_text('#view'), 'worker: 管理画面(日誌)を開こうとすると利用者画面に戻される')
    go(w, 'rydeen/users'); w.wait_for_timeout(800); check('利用者一覧' not in w.inner_text('#view'), 'worker: 利用者一覧(管理画面)に入れない')
    tok = w.evaluate("JSON.parse(localStorage.getItem('sess')).token")
    def wget(t):
        r = urllib.request.Request(URL + f'/rest/v1/{t}?select=*', headers={'apikey': json.loads(open('/dev/null').read() or '"x"') if False else os.environ.get('PORTAL_ANON', ''), 'Authorization': 'Bearer ' + tok})
        return None
    anon = w.evaluate("PORTAL_CONFIG.supabaseKey")
    def rest_as_worker(t):
        r = urllib.request.Request(URL + f'/rest/v1/{t}?select=*', headers={'apikey': anon, 'Authorization': 'Bearer ' + tok, 'User-Agent': 'curl/8'})
        try: return json.loads(urllib.request.urlopen(r).read().decode())
        except urllib.error.HTTPError as e: return f'HTTP{e.code}'
    for t in ['bp_plan_draft_requests', 'bp_worker_private', 'bp_service_records', 'bp_journal', 'bp_contracts', 'bp_support_plans', 'bp_staff_notes', 'bp_files', 'bp_staff_members', 'bp_billing_settings', 'bp_contract_signatures']:
        v = rest_as_worker(t); check(v == [] or (isinstance(v, str)), f'worker(RLS): {t} は読めない ({v if isinstance(v, str) else "0件"})')
    tasks = rest_as_worker('bp_tasks'); check(isinstance(tasks, list) and len(tasks) == 1, 'worker(RLS): 本日の自分宛/全員宛タスクだけ読める')
    # 日報
    go(w, 'rydeen/report'); wait_text(w, '今日の作業内容'); w.fill('#r_work', '封入作業を2時間やった'); w.click('label:has-text("元気")'); w.fill('#r_ref', 'できた'); w.click('text=送信する'); wait_text(w, '送信しました'); shot(w, '15-worker-report')
    go(w, 'rydeen/manuals'); wait_text(w, '封入のやり方（検証）'); w.click('text=封入のやり方（検証）'); wait_text(w, '1. 机をふく'); shot(w, '16-worker-manual')
    go(page, 'rydeen/reports'); wait_text(page, '提出された日報'); check('封入作業を2時間やった' in page.inner_text('#view'), 'admin: 利用者の日報が見える')
    # 権限なしユーザー
    ctx3 = br.new_context(); nu = ctx3.new_page(); nu.on('dialog', lambda d: d.accept())
    ne = f'e2e-none-{int(time.time())}@example.com'; npw = 'E2e-' + os.urandom(6).hex(); u3 = api('POST', '/auth/v1/admin/users', {'email': ne, 'password': npw, 'email_confirm': True}); uids.append(u3['id'])
    login(nu, ne, npw); go(nu, 'rydeen/home'); wait_text(nu, 'B型の利用権限がありません'); shot(nu, '17-no-permission'); check(True, '権限なしユーザー: 「B型の利用権限がありません」')
    # 管理画面 全ページのエラー確認
    for pg in ['home', 'users', 'journal', 'records', 'billing', 'contracts', 'plans', 'staff', 'tasks', 'manuals', 'reports', 'notes']:
        go(page, 'rydeen/' + pg); page.wait_for_timeout(1500); txt = page.inner_text('#view'); check('失敗しました' not in txt and 'エラー' not in txt and '部品を読み込めません' not in txt, f'admin: {pg} がエラーなく開く')
    br.close()
finally:
    # 検証用データの後片付け（ストレージ→行→ユーザー）
    try:
        for t, col in [('bp_manuals', 'image_paths'), ('bp_files', 'storage_path')]:
            for r in api('GET', f'/rest/v1/{t}?office=eq.{OFFICE}&select={col}'):
                for pth in (r[col] if isinstance(r[col], list) else [r[col]]):
                    bucket = 'bp-manual-images' if t == 'bp_manuals' else 'bp-staff-files'
                    try: api('DELETE', f'/storage/v1/object/{bucket}/{pth}', {})
                    except Exception as e: print('storage del', str(e)[:100])
    except Exception as e: print('pre-cleanup', e)
    cleanup(uids); purge_e2e_users(); purge_e2e_storage()
print(f'\n結果: OK {ok_n} / NG {len(ng)}'); [print('  NG:', m) for m in ng]
sys.exit(1 if ng else 0)
