// 法人ごとの設定はこのファイルだけ書き換えればOK
window.PORTAL_CONFIG = {
  orgName: '星心会',
  title: '星心会 職員ポータル',
  themeColor: '#2e6b4f',
  supabaseUrl: 'https://zvrardoyxocmqhvyddnf.supabase.co',
  supabaseKey: 'sb_publishable_C3S0K18If_cNj6gpgIct9w_3NFMdnCT', // 公開用キー（ブラウザに出してよい種類）
  helpText: 'わからないことは Google Chat の受付でボットに話しかけてください。',
  // 役割。ログインユーザーの役割は Supabase の app_metadata.role（未設定なら defaultRole）
  roles: ['職員', '事務'],
  defaultRole: '職員',
  // 事務だけに見せる区画（画面で隠すだけ。データ側の保護は Supabase のRLSで別途行う）
  clerk: { name: '事務', role: '事務', tiles: [
    ['💴', '請求CSV', '', '準備中'],
    ['📊', '実績集計', '', '準備中'] ] },
  // 事務だけに見せる区画（画面で隠すだけ。データ側の保護は Supabase のRLSで別途行う）
  clerk: { name: '事務', role: '事務', tiles: [
    ['💴', '茶夢 請求データ管理', 'https://drive.google.com/open?id=1a-Jm3-37o7BCKB-5_7LoACxtxQnpkK38QpFO8bCa0lU', 'GAS＋手動・要確認'],
    ['📊', 'レオ 実績記録（請求元）', 'https://drive.google.com/open?id=1-ehRqwEQ4E5ggrouAHA6XDKMeSHEXzoa8LSk8nlOtB4', '日誌から自動転記'],
    ['🧾', '税務カレンダー', 'https://drive.google.com/open?id=1ewil4khMk6KqTwEYAV4zYE2WQ2GbWChuhjpUPgD8Hj8', 'GAS'] ] },

  // 事業所ごとのタイル（2026-10-14 稼働システム一覧から作成。リンク先は既存のGoogleファイル）
  // tiles は [アイコン, 名前, リンク(空なら準備中), 補足, 'main'なら横幅いっぱい, 見本モードで出す見本行, 見せる役割（例 '事務'）]
  // 補足の書き方: 「自動」＝仕組みで入る／「手入力」＝人が入れる／「要確認」＝動いているか未確認
  // ※個人データは書かない（このリポジトリは公開）。リンクだけ置く
  offices: [
    { id: 'leo', name: 'レオ', kind: '児発・放デイ', color: '#e8833a', tiles: [
      ['📋', '今日やること（児発管）', '#leo/home', '計画の期限・ヒヤリハット確認・実績確認', 'main', null, '児発管'],
      ['⚠️', 'ヒヤリハット', '#leo/hiyari', '全員で読む・報告はここから', 'main'],
      ['💬', '公式LINE', 'https://line.me/R/ti/p/@468rfild', '報告はこちらから', 'main'],
      ['📷', '写真（Googleフォト）', 'https://photos.google.com/', '撮った写真・保護者と共有'],
      // 下の2つは表示専用（入力なし）。データ元はカレンダー→毎朝GASで作られた日誌を box が Supabase に同期したもの
      ['🚐', '今日の送迎（自分の担当）', '#leo/sougei', '日誌（カレンダーから自動）より表示', 'main', ['迎え 9:30 児童A（自宅）', '送り 16:30 児童B（〇〇園）']],
      ['🧒', '今日の利用児童', '#leo/kids', '日誌より表示', 'main', ['児童A', '児童B', '児童C', '児童D']],
      ['📓', '日誌（見る・直す）', '#leo/nikki', '直したらすぐ日誌に反映'],
      ['📄', '日誌の元シート', 'https://drive.google.com/open?id=1DAC9ncJfUa1lvI88su-tJnUvV4thu2xC8gPXpbyYDWs', '業務日誌2026.10（Google）'],
      ['✅', '実績記録（見るだけ）', '#leo/jisseki', '日誌から毎晩自動転記・直すのは日誌で'],
      ['🗓️', '送迎 型表', '#leo/kata', '曜日ごとの迎え・送り（見るだけ）'],
      ['📝', '個別支援計画 管理表', '#leo/keikaku', '期限が近い順（見るだけ）'],
      ['🔍', 'アセスメント（フォーム）', 'https://drive.google.com/open?id=1kspL8oAWVxTwzaqeQZQe684eiUAj9PpcvdpbrqF-gEc', '手入力'],
      ['👥', '職員配置表', '#leo/haichi', '日ごとの配置（見るだけ）'],
      ['🖊️', '保護者の実績確認', '#leo/kakunin', '児童ごとのリンク作成・確認済みの一覧', '', null, '児発管'],
      ['🧩', '個別支援計画（アセスメント・モニタリング・同意）', '#leo/plan', '児童ごとに順番どおり記録'],
      ['🗂️', '配置表・型表・管理表・送迎の配慮の入力', '#leo/master', 'ポータルの表を直す', '', null, '児発管'],
      ['✍️', '請求の印（欠席時対応・子育てサポート）', '#leo/shirushi', 'その日のうちに付ける'],
      ['💴', '請求CSVを作る（事務）', '#leo/seikyu', '児童マスタ・受給者証・CSV（送信はしない）', '', null, '事務'],
      ['🔧', '直した所（事務）', '#leo/edits', '修正の反映状況・衝突の確認', '', null, '事務'],
      ['📨', 'Chat受付', '#uketsuke', 'Chatの受付窓口に来た依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'chamu', name: '茶夢', kind: '生活介護', color: '#8a6a4f', tiles: [
      ['📓', '日誌 Registro Diário', 'https://drive.google.com/open?id=1-v3KYrjbyMuRqIoF8xUG4mEskMUHSMKjDIQkJxBdgw0', 'フォーム回答（手入力）'],
      ['🍱', '献立報告', 'https://drive.google.com/open?id=1v6o0V93U2xi-2ruwqV5VhEBk04rxMQuqs5rAddy1Sb4', '手入力・要確認'],
      ['⚠️', 'ヒヤリハット週報', 'https://drive.google.com/open?id=18dCSBTXlw2_YS-niadV8UCqjCottsVzI6i3uJDbpvpM', 'Bot依頼で作成'],
      ['📝', '個別支援計画', '', '未整備'],
      ['📨', 'Chat受付', '#uketsuke', 'Chatの受付窓口に来た依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'kintoun', name: '金斗雲', kind: '居宅介護', color: '#c9a227', tiles: [
      ['✅', '実績記録一覧', 'https://drive.google.com/open?id=1kDBy-Jubfg8FXpFwvypxVL-SEaFZmqSntzUpjNCFVhY', 'GAS Webアプリから入力'],
      ['⏰', '出退勤記録', 'https://drive.google.com/open?id=19cjW6X2ryxKP91Ea37Eh8RJjRE-I3-zF1YEctr8lrcU', 'GAS＋手動'],
      ['🔍', 'アセスメント・会議録', '', 'Bot下書き（依頼制）・要確認'],
      ['⚠️', 'ヒヤリハット週報', 'https://drive.google.com/open?id=1urelD2ecz7HEu7ZQ1busmKXkH0J-T_WAGpljx5AY3lY', 'Bot依頼で作成'],
      ['📝', '居宅介護計画', '', '未整備'],
      ['📨', 'Chat受付', '#uketsuke', 'Chatの受付窓口に来た依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'rydeen', name: 'RYDEEN', kind: 'B型', color: '#3a7bd5', tiles: [
      ['📣', 'SNS代行（LINE素材受信）', '', 'LINE受信で自動下書き・要確認'],
      ['📓', '日誌', '', '未整備（11月開所準備）'],
      ['✅', '実績', '', '未整備'],
      ['📨', 'Chat受付', '#uketsuke', 'Chatの受付窓口に来た依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'suishodama', name: '水晶玉', kind: '相談支援', color: '#8e5bb5', tiles: [
      ['🗂️', '計画相談', '', '未整備'], ['👀', 'モニタリング', '', '未整備'], ['📁', '書類', '', '準備中'] ] },
  ],
  // 法人共通（ホームの下に表示）
  shared: { name: '法人共通', tiles: [
    ['📨', 'Chat受付', '#uketsuke', 'Google Chatの受付窓口に来た依頼・報告'],
    ['📅', 'カレンダー', 'https://calendar.google.com/', 'Googleカレンダー'],
    ['🎓', '法定研修', 'https://drive.google.com/open?id=1TlSFx02IxdE-bUeoHRJC-n55MLNFIWgxc6s3IJRP8L4', 'GAS Webアプリ・要確認'],
    ['❓', '職員向け 使い方', 'help.html', 'ログイン・レオの画面・日誌の直し方'],
    ['⏰', '出退勤（新・テスト）', 'https://rsaito-png.github.io/kintai/', 'テスト版'] ] },
};
