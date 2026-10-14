// 法人ごとの設定はこのファイルだけ書き換えればOK
window.PORTAL_CONFIG = {
  orgName: '星心会',
  title: '星心会 職員ポータル',
  themeColor: '#2e6b4f',
  offices: ['レオ', '茶夢', '金斗雲', 'RYDEEN', '水晶玉'],
  supabaseUrl: 'https://zvrardoyxocmqhvyddnf.supabase.co',
  supabaseKey: 'sb_publishable_C3S0K18If_cNj6gpgIct9w_3NFMdnCT', // 公開用キー（ブラウザに出してよい種類）
  helpText: 'わからないことは Google Chat の受付でボットに話しかけてください。',
  // [アイコン, 名前, リンク(空なら準備中), 補足]
  tiles: [
    ['📓', '日誌', '', '準備中'],
    ['🚐', '送迎', '', '準備中'],
    ['✅', '実績', '', '準備中'],
    ['📁', '書類', '', '準備中'],
    ['📅', 'カレンダー', 'https://calendar.google.com/', 'Googleカレンダー'],
    ['⏰', '出退勤', 'https://rsaito-png.github.io/kintai/', 'テスト版'],
  ],
};
