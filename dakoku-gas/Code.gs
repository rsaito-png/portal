/**
 * 出退勤打刻の旧ウェブアプリ（廃止スタブ）。
 * ポータルの打刻は Supabase のみ。この GAS は何も記録せず、再読み込みを促す。
 * 親エージェントが Apps Script エディタへ貼り付けて、既存 /exec を新バージョンとして再デプロイする。
 *
 * 旧クライアントは j.ok === false のとき j.error を画面に出す。
 */
var DK_MSG = '新しい画面に切り替わりました。ページを再読み込みしてから打刻してください。';

function doGet(e) {
  return dkOut_(dkHandle_(e && e.parameter ? e.parameter : {}));
}

function doPost(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var body;
  try { body = JSON.parse(raw); } catch (err) { return dkOut_({ ok: false, error: DK_MSG }); }
  return dkOut_(dkHandle_(body || {}));
}

function dkHandle_(b) {
  // トークン検査もしない（もう受け付けない）。どの action も拒否。
  var action = (b && b.action) || 'bootstrap';
  // 旧画面が bootstrap で offices を期待する場合もあるが、ok:false なら throw されてメッセージが出る。
  return {
    ok: false,
    error: DK_MSG,
    action: action,
    forceReload: true,
    preferSupabase: true,
    portalMin: '20261109sbonly'
  };
}

function dkOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
