// 公開前提の設定(anon keyはRLSで守られる)。service keyは絶対にここに入れない。
window.APP_CONFIG={
  SUPABASE_URL:'https://skhfueffupicmtctelpx.supabase.co',
  SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNraGZ1ZWZmdXBpY210Y3RlbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwOTI2MDIsImV4cCI6MjEwNzY2ODYwMn0.GnJYxsl4Swd8Twuf42W6oQtT-_kTgCkpqrk0fiSrNOg',
  TABLE:'sun_diary_entries',
  ALLOW_SIGNUP:false   // 初回登録が終わったら false にすると登録画面を隠す(下記README参照)
};
