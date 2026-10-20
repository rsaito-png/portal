// 法人ごとの設定はこのファイルだけ書き換えればOK
window.PORTAL_CONFIG = {
  orgName: '星心会',
  title: '星心会 職員ポータル',
  themeColor: '#2e6b4f',
  supabaseUrl: 'https://zvrardoyxocmqhvyddnf.supabase.co',
  supabaseKey: 'sb_publishable_C3S0K18If_cNj6gpgIct9w_3NFMdnCT', // 公開用キー（ブラウザに出してよい種類）
  helpText: '分からないことは、ポータルの「受付」から送ってください。',
  // 役割。ログインユーザーの役割は Supabase の app_metadata.role（未設定なら defaultRole）
  roles: ['職員', '事務'],
  defaultRole: '職員',
  // 事務だけに見せる区画（画面で隠すだけ。データ側の保護は Supabase のRLSで別途行う）
  clerk: { name: '総務', role: '事務', groups: [
    { name: '国保連請求', tiles: [
      ['💴', 'レオ 請求CSVを作る', '#leo/seikyu', '請求CSV（送信はしない）'],
      ['💴', '茶夢 請求データ管理', 'https://drive.google.com/open?id=1a-Jm3-37o7BCKB-5_7LoACxtxQnpkK38QpFO8bCa0lU', 'GAS＋手動・要確認'],
      ['🔧', 'レオ 直した所', '#leo/edits', '修正の反映状況・衝突の確認'],
      ['✍️', 'レオ 請求の印（欠席時対応・子育てサポート）', '#leo/shirushi', 'その日のうちに付ける'],
      ['📊', 'レオ 実績記録（請求元）', 'https://drive.google.com/open?id=1-ehRqwEQ4E5ggrouAHA6XDKMeSHEXzoa8LSk8nlOtB4', '日誌から自動転記'] ] },
    { name: '人事労務', tiles: [
      ['🌅', '奉行報告（朝の確認）', '#report/admin', '報告がない人・動いていないToDo・困りごと（管理者のみ）'],
      ['🗂️', '書類管理（契約書・誓約書）', '#clerk/docs', '職員別の署名状況・紙の締結済み登録・印刷'] ] },
    { name: '補助金・助成金', tiles: [
      ['💰', '補助金・助成金', '', '準備中'] ] },
    { name: '税務', tiles: [
      ['🧾', '税務カレンダー', 'https://drive.google.com/open?id=1ewil4khMk6KqTwEYAV4zYE2WQ2GbWChuhjpUPgD8Hj8', 'GAS'] ] },
    { name: 'その他', tiles: [
      ['📁', 'その他', '', '準備中'] ] } ] },

  // 事業所ごとのタイル（2026-10-14 稼働システム一覧から作成。リンク先は既存のGoogleファイル）
  // tiles は [アイコン, 名前, リンク(空なら準備中), 補足, 'main'なら横幅いっぱい, 見本モードで出す見本行, 見せる役割（例 '事務'）]
  // 補足の書き方: 「自動」＝仕組みで入る／「手入力」＝人が入れる／「要確認」＝動いているか未確認
  // ※個人データは書かない（このリポジトリは公開）。リンクだけ置く
  offices: [
    { id: 'leo', logo: 'img/logo/leo.webp', name: 'レオ', kind: '児発・放デイ', color: '#e8833a',
      // 画面の並べ方だけ（リンク・権限は tiles のまま）。home＝上段は全員共通（送迎・利用児童・ヒヤリハット）、mine＝職責別「自分の仕事」（最大3）、groups＝「その他」の先（1階層）
      home: true,
      mine: { '現場支援員': ['日誌（児童ごと）', 'LINE報告を書く', '利用者情報（児童ごと）'],
        '児発管': ['個別支援計画（いまどこ？）', '今日やること（児発管）', '保護者の実績確認'],
        '管理者': ['今日やること（児発管）', '個別支援計画（いまどこ？）', '保護者の実績確認'],
        '事務': ['児童の利用・送迎予定', '利用者情報（児童ごと）'] },
      short: { '日誌（児童ごと）': '日誌', '日誌（見る・直す）': '今日の日誌', '今日やること（児発管）': '今日やること', '個別支援計画（いまどこ？）': '個別支援計画', '児童の利用・送迎予定': '児童の利用・送迎予定', '利用者情報（児童ごと）': '利用者情報', '事務画面へ': '事務画面へ', '保護者の実績確認': '実績確認', 'LINE報告を書く': 'LINE報告' },
      routine: ['個別支援計画（管理）', '保護者への来月の利用予定確認フォーム', 'サービス提供実績記録表', '利用料実費請求', '上限額管理', '国保連請求'],
      groups: [['📂', 'その他', ['今日の送迎（自分の担当）', 'みんなの送迎', '児童の利用・送迎予定', '送迎 型表', '来月の利用予定（保護者に聞く）', '職員配置表', '日誌（児童ごと）', '日誌（見る・直す）', '日誌の元シート', '実績記録（見るだけ）', '利用者情報（児童ごと）', 'アセスメント（フォーム）', '個別支援計画（いまどこ？）', '個別支援計画 管理表', '今日やること（児発管）', '配置表・型表・管理表・送迎の配慮の入力', 'LINE報告を書く', '保護者の実績確認', '公式LINE', '公式LINE（管理画面）', '写真（Googleフォト）', '受付', '書類']]],
      tiles: [
      ['📋', '今日やること（児発管）', '#leo/home', '計画の期限・ヒヤリハット確認・実績確認', 'main', null, '児発管'],
      ['⚠️', 'ヒヤリハット', '#leo/hiyari', '全員で読む・報告はここから', 'main'],
      ['💬', '公式LINE', 'https://chat.line.biz/U09e93081492c29e963d2bba78499043f', '報告はこちらから', 'main'],
      ['🛠️', '公式LINE（管理画面）', 'https://manager.line.biz/account/@468rfild', '管理者・児発管・事務のみ', 'main', null, '児発管'],
      ['📷', '写真（Googleフォト）', 'https://photos.google.com/', '撮った写真・保護者と共有'],
      // 下の2つは表示専用（入力なし）。データ元はカレンダー→毎朝GASで作られた日誌を box が Supabase に同期したもの
      ['📅', '児童の利用・送迎予定', '#leo/cal', '日・週・月／児発管・事務が入力', 'main'],
      ['🚐', '今日の送迎（自分の担当）', '#leo/sougei', '迎え順・場所・時刻（予定表から）', 'main', ['迎え 9:30 児童A（自宅）', '送り 16:30 児童B（〇〇園）']],
      ['🚐', 'みんなの送迎', '#leo/sougeiall', '誰がどの車で誰を迎え・送りか（全員分）', 'main'],
      ['🧒', '今日の利用児童', '#leo/kids', '日誌より表示', 'main', ['児童A', '児童B', '児童C', '児童D']],
      ['📔', '日誌（児童ごと）', '#leo/diary', '児童ごと・日ごと＋職員の下書き（11/1まで並行運転）'],
      ['📓', '日誌（見る・直す）', '#leo/nikki', '直したらすぐ日誌に反映'],
      ['📄', '日誌の元シート', 'https://drive.google.com/open?id=1DAC9ncJfUa1lvI88su-tJnUvV4thu2xC8gPXpbyYDWs', '業務日誌2026.10（Google）'],
      ['✅', '実績記録（見るだけ）', '#leo/jisseki', '日誌から毎晩自動転記・直すのは日誌で'],
      ['🗓️', '送迎 型表', '#leo/kata', '曜日ごとの迎え・送り（見るだけ）'],
      ['📅', '来月の利用予定（保護者に聞く）', '#leo/yotei', 'リンクをまとめてコピー・回答状況・予定を作る'],
      ['📝', '個別支援計画 管理表', '#leo/keikaku', '期限が近い順（見るだけ）'],
      ['🔍', 'アセスメント（フォーム）', 'https://drive.google.com/open?id=1kspL8oAWVxTwzaqeQZQe684eiUAj9PpcvdpbrqF-gEc', '手入力'],
      ['👥', '職員配置表', '#leo/haichi', '日ごとの配置（見るだけ）'],
      ['🖊️', '保護者の実績確認', '#leo/kakunin', '児童ごとのリンク作成・確認済みの一覧', '', null, '児発管'],
      ['💬', 'LINE報告を書く', '#leo/line', '保護者への報告文→LINE・日誌の活動記録に', 'main'],
      ['👤', '利用者情報（児童ごと）', '#leo/userinfo', '受給者証・送迎・連絡先・フォトを1画面で', 'main'],
      ['🧩', '個別支援計画（いまどこ？）', '#leo/plan', '管理表から・次にやること'],
      ['🗂️', '配置表・型表・管理表・送迎の配慮の入力', '#leo/master', 'ポータルの表を直す', '', null, '児発管'],
      ['🧩', '個別支援計画（管理）', '#leo/plan', '計画の進み具合・次にやること', '', null, '児発管'],
      ['📅', '保護者への来月の利用予定確認フォーム', '#leo/yotei', '保護者への聞き取り・回答状況', '', null, '児発管'],
      ['📋', 'サービス提供実績記録表', '#leo/jissekihyo', '保護者の確認状況（月・児童ごと）とGoogleフォームへのリンク', '', null, '児発管'],
      ['🧾', '利用料実費請求', '#leo/jippi', 'お昼代・おやつ代・LINE文面（送信は手動）', '', null, '児発管'],
      ['🔒', '上限額管理', '', '準備中（画面はまだありません）', '', null, '児発管'],
      ['💴', '国保連請求', '#leo/seikyu', '請求CSVを作る（送信はしない）', '', null, '児発管'],
      ['📨', '受付', '#uketsuke', 'ポータルから送られた依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'chamu', name: '茶夢', kind: '生活介護', color: '#8a6a4f', tiles: [
      ['📋', '日報システム', 'https://docs.google.com/forms/d/e/1FAIpQLScQvvpN0PxPNc6hUVuSth5OWDPY0wl_dkKgMOF1gpb5a5036g/viewform', 'Googleフォーム'],
      ['📓', '日誌 Registro Diário', 'https://drive.google.com/open?id=1-v3KYrjbyMuRqIoF8xUG4mEskMUHSMKjDIQkJxBdgw0', 'フォーム回答（手入力）'],
      ['🍱', '献立報告', 'https://drive.google.com/open?id=1v6o0V93U2xi-2ruwqV5VhEBk04rxMQuqs5rAddy1Sb4', '手入力・要確認'],
      ['⚠️', 'ヒヤリハット週報', 'https://drive.google.com/open?id=18dCSBTXlw2_YS-niadV8UCqjCottsVzI6i3uJDbpvpM', 'Bot依頼で作成'],
      ['📝', '個別支援計画', '', '未整備'],
      ['📨', '受付', '#uketsuke', 'ポータルから送られた依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'kintoun', logo: 'img/logo/kintoun.webp', name: '金斗雲', kind: '居宅介護', color: '#c9a227', tiles: [
      ['🏯', '金斗雲システム', 'https://script.google.com/a/macros/psr-seishinkai.org/s/AKfycby5I92_qF1j0YqAYhsUvIAS8WHpRczQDY8pxUD4aaYEV1ftIAAQqKre0vb1Fvia0XrYvg/exec', '@psr-seishinkai.org のアカウントで開く'],
      ['✅', '実績記録一覧', 'https://drive.google.com/open?id=1kDBy-Jubfg8FXpFwvypxVL-SEaFZmqSntzUpjNCFVhY', 'GAS Webアプリから入力'],
      ['⏰', '出退勤記録', 'https://drive.google.com/open?id=19cjW6X2ryxKP91Ea37Eh8RJjRE-I3-zF1YEctr8lrcU', 'GAS＋手動'],
      ['🔍', 'アセスメント・会議録', '', 'Bot下書き（依頼制）・要確認'],
      ['⚠️', 'ヒヤリハット週報', 'https://drive.google.com/open?id=1urelD2ecz7HEu7ZQ1busmKXkH0J-T_WAGpljx5AY3lY', 'Bot依頼で作成'],
      ['📒', '台帳', '#kintoun/ledger', '利用者・支給と利用・事業所設定・書類履歴'],
      ['📝', '訪問記録', '#kintoun/visit', '訪問ごとの記録（一覧・追加・編集）'],
      ['📄', '利用契約書・重要事項説明書', '#kintoun/contract', '契約書・重要事項説明書・計画書の署名状況／署名リンク発行'],
      ['🖨️', '訪問記録の印刷', '#kintoun/print', '利用者・月を選んで印刷／PDF（署名つき）'],
      ['🧾', 'サービス提供実績記録表', '#kintoun/jisseki', '月次集計（算定コード・単位）／印刷'],
      ['✅', '記録・署名チェック', '#kintoun/check', '署名待ち・職員名空・二重記録・記録漏れ／署名リンク発行'],
      ['📝', '居宅介護計画の同意', '#kintoun/consent', '計画を見て、iPadで同意（Googleフォームの代わり）'],
      ['📨', '受付', '#uketsuke', 'ポータルから送られた依頼・報告'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'rydeen', logo: 'img/logo/rydeen.webp', name: 'RYDEEN', kind: 'B型', color: '#3a7bd5', tiles: [
      ['📓', '業務日誌', '#rydeen/journal', '毎日ここだけ入力（実績記録票に自動で転記）', 'main'],
      ['📝', '日報', '#rydeen/reports', '利用者の日報を見る'],
      ['🧰', '作業タスク', '#rydeen/tasks', '今日の作業'],
      ['📨', '受付', '#uketsuke', 'ポータルから送られた依頼・報告'],
      ['📘', 'マニュアル', '#rydeen/manuals', '作業マニュアル'],
      ['🗂️', 'メモ・ファイル', '#rydeen/notes', '職員用のメモとファイル'],
      ['✅', '実績記録票', '#rydeen/records', '月末：利用者の署名待ち・確認'],
      ['👤', '利用者', '#rydeen/users', '登録・個人情報・請求用の項目'],
      ['⏱️', '勤務実績表', '#rydeen/staff', '月末：職員の勤務'],
      ['💴', '国保連CSV', '#rydeen/billing', '月末：請求CSVを作る（送信はしない）'],
      ['📄', '契約・重説', '#rydeen/contracts', '利用契約・重要事項説明の署名'],
      ['🧩', '個別支援計画', '#rydeen/plans', 'AI下書きの依頼・署名'],
      ['🏠', 'B型システム ホーム', '#rydeen/home', '今日の状況（B型の権限が必要。利用者はここから今日の作業へ）'],
      ['📣', 'SNS代行（LINE素材受信）', '', 'LINE受信で自動下書き・要確認'],
      ['📁', '書類', '', '準備中'] ] },
    { id: 'suishodama', logo: 'img/logo/suishodama.webp', logoFit: 'contain', name: '水晶玉', kind: '相談支援', color: '#8e5bb5', tiles: [
      ['👤', '利用者台帳', '#suishodama/ledger', '利用者の追加・編集（受給者証・障害支援区分など）'], ['🗂️', '計画', '#suishodama/plan', 'サービス等利用計画・週間計画表・モニタリング（作成・版管理・印刷）／録音して依頼'], ['📁', '書類', '', '準備中'] ] },
  ],
  // 法人共通（ホームの下に表示）
  shared: { name: '法人共通', tiles: [
    ['📨', '受付', '#uketsuke', 'ポータルから送られた依頼・報告'],
    ['✍️', '書類の確認と署名', '#sign', '労働条件通知書・誓約書を読んで署名'],
    ['📅', 'カレンダー', 'https://calendar.google.com/', 'Googleカレンダー'],
    ['📝', '法定研修 受講確認フォーム', 'https://docs.google.com/forms/d/e/1FAIpQLSehMPxXuuCXdyA9MTmR8WR6YEaullRPG10MIkx7q9pNrUclbA/viewform', '研修を受けたら職員が回答'],
    ['❓', '職員向け 使い方', 'help.html', 'ログイン・レオの画面・日誌の直し方'],
    ['⏰', '出退勤（新・テスト）', 'https://rsaito-png.github.io/kintai/', 'テスト版'] ] },
  // 電子サイン（労働契約書・誓約書）。他法人は employer と defaults を書き換える。文面（テンプレート）はDBに登録
  esign: {
    enabled: true,
    employer: { name: '一般社団法人 心理社会的リハビリテーション・星心会', address: '三重県四日市市山城町59-4', rep: '代表理事 齊藤連' },
    docTypes: { labor_contract: '労働条件通知書兼雇用契約書', confidentiality: '秘密情報の保持に関する誓約書' },
    renewalNoticeDays: [90, 30],
    // 契約書の既定値（個人ごとに画面で直せる）
    defaults: { probation: 'なし', overtime: '所定時間外労働 無／休日労働 無', holidays: '不定', leave: '年次有給休暇（法定）',
      retire: '定年なし。その他の退職・解雇については就業規則による', premium: '就業規則による',
      pay: '毎月末日締切、翌月15日支払、銀行振込', bonus: '無', raise: '無', retirement_pay: '無',
      insurance: '社会保険の加入 （　）／雇用保険の適用 （　）', remarks: '' },
    // 事業所ごとの既定（就業場所・仕事内容）。例を書いておく
    officeDefaults: { 'レオ': { place: 'レオ', job: '' }, '茶夢': { place: '茶夢', job: '' }, '金斗雲': { place: '金斗雲', job: '' } },
  },
};
