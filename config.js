// 法人ごとの設定はこのファイルだけ書き換えればOK
window.PORTAL_CONFIG = {
  orgName: '星心会',
  title: '星心会 職員ポータル',
  themeColor: '#2e6b4f',
  supabaseUrl: 'https://zvrardoyxocmqhvyddnf.supabase.co',
  supabaseKey: 'sb_publishable_C3S0K18If_cNj6gpgIct9w_3NFMdnCT', // 公開用キー（ブラウザに出してよい種類）
  helpText: 'わからないことは Google Chat の受付でボットに話しかけてください。',
  // 事業所ごとのタイル。tiles は [アイコン, 名前, リンク(空なら準備中), 補足]
  offices: [
    { id: 'leo', name: 'レオ', kind: '児童', color: '#e8833a', tiles: [
      ['📓', '業務日誌', '', '準備中'], ['🚐', '送迎', '', '準備中'], ['✅', '実績', '', '準備中'],
      ['📝', '個別支援計画', '', '準備中'], ['📁', '書類', '', '準備中'] ] },
    { id: 'chamu', name: '茶夢', kind: '', color: '#8a6a4f', tiles: [
      ['📓', '日誌', '', '準備中'], ['✅', '実績', '', '準備中'],
      ['📝', '個別支援計画', '', '準備中'], ['📁', '書類', '', '準備中'] ] },
    { id: 'kintoun', name: '金斗雲', kind: '居宅介護', color: '#c9a227', tiles: [
      ['✅', '実績記録', '', '準備中'], ['📝', '居宅介護計画', '', '準備中'],
      ['🔍', 'アセスメント', '', '準備中'], ['📁', '書類', '', '準備中'] ] },
    { id: 'rydeen', name: 'RYDEEN', kind: 'B型', color: '#3a7bd5', tiles: [
      ['📓', '日誌', '', '準備中'], ['✅', '実績', '', '準備中'],
      ['📝', '個別支援計画', '', '準備中'], ['📁', '書類', '', '準備中'] ] },
    { id: 'suishodama', name: '水晶玉', kind: '相談支援', color: '#8e5bb5', tiles: [
      ['🗂️', '計画相談', '', '準備中'], ['👀', 'モニタリング', '', '準備中'], ['📁', '書類', '', '準備中'] ] },
  ],
  // 法人共通（ホームの下に表示）
  shared: { name: '法人共通', tiles: [
    ['📅', 'カレンダー', 'https://calendar.google.com/', 'Googleカレンダー'],
    ['⏰', '出退勤', 'https://rsaito-png.github.io/kintai/', 'テスト版'] ] },
};
