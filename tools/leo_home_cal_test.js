// レオホームの月間カレンダーと日の時刻軸。node tools/leo_home_cal_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sandbox = { DEMO: false, console, setInterval() { return 0; } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'leo_name.js'), 'utf8'), sandbox, { filename: 'leo_name.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'leo_home_cal.js'), 'utf8'), sandbox, { filename: 'leo_home_cal.js' });

const { sgGrid, sgLayout, sgStaffPaint, sgStaffShow, sgMonthHtml, sgDayHtml, sgSplit, sgName, sgGiven, sgFace, SG_STAFF_COLOR } = sandbox;

assert.strictEqual(sgName('山根\u3000一輝'), '山根 一輝');
assert.strictEqual(sgName('  山根  一輝 \n'), '山根 一輝');
assert.strictEqual(sgGiven('加藤 湊'), '湊');
assert.strictEqual(sgGiven('加藤\u3000湊'), '湊');
assert.strictEqual(sgGiven('山根 一輝'), '一輝');
assert.strictEqual(sgGiven('西山琴'), '西山琴');
assert.strictEqual(sgGiven('  児童A  '), '児童A');
assert.strictEqual(sgFace({ kind: '迎え', kids: ['加藤 湊'] }), '☆湊');
assert.strictEqual(sgFace({ kind: '送り', kids: ['山根\u3000一輝'] }), '★一輝');
assert.strictEqual(sgFace({ kind: '利用', child: '加藤 湊' }), '湊');
assert.strictEqual(sgFace({ kind: '迎え', kids: ['加藤 湊', '山根 一輝'] }), '☆湊　☆一輝');
assert.strictEqual(sgFace({ kind: '勤務', staff: '加藤' }), null);

const g = sgGrid('2026-10');
assert.strictEqual(g.start, '2026-09-28');
assert.strictEqual(g.end, '2026-11-01');

const laid = sgLayout([
  { id: 'a', start: 600, end: 840 },
  { id: 'b', start: 630, end: 680 },
  { id: 'c', start: 900, end: 960 },
]);
const byId = Object.fromEntries(laid.map(e => [e.id, e]));
assert.strictEqual(byId.a.col, 0);
assert.strictEqual(byId.b.col, 1);
assert.strictEqual(byId.a.cols, 2);
assert.strictEqual(byId.c.col, 0);
assert.strictEqual(byId.c.cols, 1, '重ならない予定は幅いっぱい');

const paint = sgStaffPaint('山田\u3000太郎');
assert.strictEqual(paint.mapped, false);
assert.strictEqual(paint.hex, '#d50000', '一覧に無い担当は赤');
SG_STAFF_COLOR['山田 太郎'] = 7;
const hit = sgStaffPaint('山田\u3000太郎');
assert.strictEqual(hit.mapped, true);
assert.strictEqual(hit.hex, '#039be5');
assert.strictEqual(hit.ink, '#fff');
delete SG_STAFF_COLOR['山田 太郎'];
assert.strictEqual(sgStaffPaint('職員X', { demo: true }).hex, '#039be5');
assert.strictEqual(sgStaffPaint('職員Y', { demo: true }).hex, '#f4511e');

const staffHex = {
  'れん': '#1a237e', '連': '#1a237e', 'れん先生': '#1a237e', '齊藤　連': '#1a237e', '斎藤連': '#1a237e', '斉藤 連': '#1a237e', '齋藤連': '#1a237e', '山田連': '#1a237e',
  'ゆか': '#33b679', 'ゆか先生': '#33b679', '友香': '#33b679', '鈴木　友香': '#33b679',
  'あや': '#8e24aa', 'あやさん': '#8e24aa', '文': '#8e24aa', '文先生': '#8e24aa', '中村文': '#8e24aa', '中村 文': '#8e24aa', '中村\u3000文': '#8e24aa',
  'さち': '#e67c73', 'さち先生': '#e67c73', '祥': '#e67c73', '鈴木祥': '#e67c73',
  'なお': '#7986cb', 'なお先生': '#7986cb', '尚': '#7986cb', '尚先生': '#7986cb', '安藤尚子': '#7986cb', '安藤 尚子': '#7986cb', '安藤\u3000尚子': '#7986cb', '安藤': '#7986cb',
  '宮本': '#d81b60', '宮本さん': '#d81b60', '宮本　花': '#d81b60',
  '加藤': '#4fc3f7', '加藤先生': '#4fc3f7', '加藤　花': '#4fc3f7',
};
for (const [name, hex] of Object.entries(staffHex)) {
  const p = sgStaffPaint(name);
  assert.strictEqual(p.hex, hex, name);
  assert.strictEqual(p.mapped, true, name);
}
assert.strictEqual(sgStaffPaint('連先生').ink, '#fff', '紺は白い文字');
assert.notStrictEqual(sgStaffPaint('尚先生').hex, sgStaffPaint('連先生').hex);
assert.notStrictEqual(sgStaffPaint('加藤先生').hex, sgStaffPaint('連先生').hex);
assert.strictEqual(sgStaffShow('斉藤　連'), '連先生');
assert.strictEqual(sgStaffShow('れん'), '連先生');
assert.strictEqual(sgStaffShow('ゆか'), '友香先生');
assert.strictEqual(sgStaffShow('友香'), '友香先生');
assert.strictEqual(sgStaffShow('さち'), '祥先生');
assert.strictEqual(sgStaffShow('祥'), '祥先生');
assert.strictEqual(sgStaffShow('なお先生'), '尚先生');
assert.strictEqual(sgStaffShow('尚'), '尚先生');
assert.strictEqual(sgStaffShow('あや'), '文先生');
assert.strictEqual(sgStaffShow('あや先生'), '文先生');
assert.strictEqual(sgStaffShow('文'), '文先生');
assert.strictEqual(sgStaffShow('中村文'), '文先生');
assert.strictEqual(sgStaffShow('中村 文'), '文先生');
assert.strictEqual(sgStaffShow('中村\u3000文'), '文先生');
assert.strictEqual(sgStaffPaint('中村').mapped, false, '中村だけでは文先生にしない');
assert.strictEqual(sgStaffPaint('中村').hex, '#d50000');
assert.strictEqual(sgStaffShow('中村'), '中村');
assert.strictEqual(sgStaffPaint('中村 亮仁').mapped, false, '児童の中村 亮仁は担当欄でも文先生にしない');
assert.strictEqual(sgStaffPaint('中村\u3000亮仁').hex, '#d50000');
assert.strictEqual(sgStaffShow('中村 亮仁'), '中村 亮仁');
assert.strictEqual(sgStaffPaint('加藤先生').ink, '#222', '水色は暗い文字');
assert.strictEqual(sgStaffPaint('宮本さん').ink, '#fff', 'ピンクは白い文字');
assert.strictEqual(sgStaffPaint('加藤 湊').mapped, false, '児童の加藤湊は担当でも加藤先生にしない');
assert.strictEqual(sgStaffPaint('加藤湊').hex, '#d50000');
assert.strictEqual(sgStaffPaint('加藤みなと').mapped, false);

const evs = [
  { day: '2026-10-26', kind: '利用', child: '山根\u3000一輝', start_time: '10:30', end_time: '14:30' },
  { day: '2026-10-26', kind: '利用', child: '児童B', start_time: '15:50', end_time: '17:00' },
  { day: '2026-10-26', kind: '利用', child: '児童C', start_time: '16:15', end_time: '17:00' },
  { day: '2026-10-26', kind: '迎え', staff: '職員X', kids: ['山根\u3000一輝'], start_time: '10:10', end_time: '10:40', kid_places: { '山根\u3000一輝': '下野小学校' }, kid_times: { '山根\u3000一輝': '10:20' } },
  { day: '2026-10-26', kind: '送り', staff: '職員Y', kids: ['児童B'], start_time: '17:00', end_time: '17:30', kid_places: { '児童B': '自宅' } },
  { day: '2026-10-26', kind: '休み', child: '児童D' },
  { day: '2026-10-24', kind: '休所', title: '土曜日' },
  { day: '2026-10-27', kind: '迎え', staff: '', kids: ['児童C'], start_time: '', end_time: '' },
];
const month = sgMonthHtml('2026-10', evs, '2026-10-26');
assert.ok(month.includes('2026年10月'), '月の見出し');
assert.ok(month.includes("sgOpenDay('2026-10-26')"), '日を開ける');
assert.ok(month.includes('>26</b>'), '今日の日付');
assert.ok(month.includes('3人'), '利用人数');
assert.ok(month.includes('sub use'), '利用人数は山吹色');
assert.ok(month.includes('background:#f8b500') && month.includes('.sub.use{color:#222'), '人数は黄地に黒文字');
assert.ok(month.includes('class="sub off">休'), '休所');
assert.ok(month.includes('class="today"'), '今日の印');
assert.strictEqual((month.match(/class="sg-tday">今日/g) || []).length, 1, '今日のラベルは1日だけ');
assert.ok(month.includes('html.th-yamen body.portal .sgm td button.today'), '官吏テーマの赤いボタンより今日を優先する');
assert.ok(month.includes('border:3px solid #c9a227') && month.includes('background:#fff6d0') && month.includes('color:#1c140c'), '今日は金枠のクリーム色に黒い文字');
assert.ok(!month.includes('毎日やる'), 'ホームのボタンはカレンダーに含めない');

const { allDay, timed } = sgSplit(evs.filter(e => e.day === '2026-10-26'));
assert.ok(allDay.some(e => e.kind === '休み'));
assert.ok(timed.every(e => e.kind !== '休み' && e.e));
assert.ok(timed.some(e => e.e.kind === '迎え' && e.col !== timed.find(x => x.e.kind === '利用' && x.e.child.startsWith('山根')).col), '重なる迎えと利用は別の列');

const day = sgDayHtml('2026-10-26', evs, { '山根一輝': '助手席' }, { demo: true, today: '2026-10-26', nowMin: 13 * 60 + 40 });
assert.ok(day.includes('山根 一輝'), '半角スペースの氏名');
assert.ok(day.includes('下野小学校'));
assert.ok(day.includes('#039be5'), '職員Xは Peacock');
assert.ok(/background:#f8b500;color:#222/.test(day), '利用児童は山吹色に黒文字');
assert.ok(day.includes('#f4511e'), '見本の職員Yは Tangerine のまま');
assert.ok(day.includes('利用児童'));
assert.ok(!day.includes('sg-ev neutral'), '時刻のある利用は山吹色');
assert.ok(day.includes('☆ 迎え'));
assert.ok(day.includes('★ 送り'));
assert.ok(day.includes("sgOpenMonth('2026-10-26')"), '表示中の日の月を開く');
assert.ok(/今日<\/button><button type="button" onclick="sgOpenMonth\(/.test(day), '今日のとなりは月');
assert.ok(/月<\/button><button type="button" class="sg-mine" aria-pressed="false" onclick="sgToggleMine\(\)">自分の担当<\/button>/.test(day), '月のとなりは自分の担当');
assert.ok(day.includes('flex-wrap:nowrap'), '見出しのボタンは折り返さない');
assert.ok(!/sg-canvas" style="[^"]*min-width:\d+px/.test(day), '時刻軸は列数×固定幅にしない');
assert.ok(day.includes('.sg-scroll{flex:1 1 auto;min-width:0;overflow-x:clip'), '時刻軸は親の幅に収める');
assert.ok(day.includes('overflow-wrap:anywhere'), '狭い列では文字を折り返す');
assert.ok(day.includes('height:auto !important'), '狭い画面では文字の分だけブロックを高くする');
assert.ok(day.includes('data-sg-now'), '今日は現在時刻の線');
assert.ok(day.includes('終日'));
assert.ok(day.includes('児童D'));
assert.ok(day.includes('class="sg-ev drop"') || day.includes('sg-ev drop'), '送りは下線で区別');
function evFace(html, titleBits) {
  const re = /<div class="sg-ev[^"]*"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const title = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    if (titleBits.every(b => title.includes(b))) {
      return { title, inner: m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() };
    }
  }
  return null;
}
const useFace = evFace(day, ['利用', '山根 一輝']);
assert.ok(useFace && useFace.inner === '一輝', '利用のブロックは名だけ');
assert.ok(useFace.title.includes('山根 一輝') && useFace.title.includes('10:30') && useFace.title.includes('助手席'), '利用の詳細は title に残す');
const pickFace = evFace(day, ['☆ 迎え', '山根 一輝']);
assert.ok(pickFace && pickFace.inner === '☆一輝', '迎えのブロックは☆＋名');
assert.ok(!pickFace.inner.includes('迎え') && !pickFace.inner.includes('10:10') && !pickFace.inner.includes('職員') && !pickFace.inner.includes('山根') && !pickFace.inner.includes('下野'), '迎えの表面に時刻・担当・場所・姓は出さない');
assert.ok(pickFace.title.includes('10:10') && pickFace.title.includes('下野小学校') && pickFace.title.includes('職員X'), '迎えの詳細は title に残す');
const dropFace = evFace(day, ['★ 送り', '児童B']);
assert.ok(dropFace && dropFace.inner === '★児童B', '送りのブロックは★＋名');
assert.ok(day.includes('.sg-ev.drop .k,.sg-ev.drop .nm{text-decoration:underline'), '送りの名にも下線');

const named = [
  { day: '2026-10-26', kind: '利用', child: '加藤 湊', start_time: '10:00', end_time: '12:00' },
  { day: '2026-10-26', kind: '迎え', staff: '加藤先生', kids: ['加藤 湊'], start_time: '09:40', end_time: '10:10', kid_places: { '加藤 湊': '小学校' } },
  { day: '2026-10-26', kind: '迎え', staff: '斉藤　連', kids: ['児童A'], start_time: '10:10', end_time: '10:40' },
  { day: '2026-10-26', kind: '送り', staff: 'れん', kids: ['児童A'], start_time: '10:45', end_time: '11:10' },
  { day: '2026-10-26', kind: '送り', staff: 'ゆか', kids: ['児童B'], start_time: '12:10', end_time: '12:40' },
  { day: '2026-10-26', kind: '利用', child: '中村 亮仁', start_time: '11:00', end_time: '12:00' },
  { day: '2026-10-26', kind: '送り', staff: '中村\u3000文', kids: ['中村 亮仁'], start_time: '12:10', end_time: '12:40' },
  { day: '2026-10-26', kind: '送り', staff: 'あや先生', kids: ['児童C'], start_time: '13:00', end_time: '13:30' },
  { day: '2026-10-26', kind: '迎え', staff: '中村', kids: ['児童C'], start_time: '13:40', end_time: '14:00' },
  { day: '2026-10-26', kind: '迎え', staff: 'さち', kids: ['児童D'], start_time: '14:00', end_time: '14:30' },
  { day: '2026-10-26', kind: '送り', staff: 'なお先生', kids: ['児童E'], start_time: '15:00', end_time: '15:30' },
  { day: '2026-10-26', kind: '迎え', staff: '宮本さん', kids: ['児童F'], start_time: '16:00', end_time: '16:30' },
  { day: '2026-10-26', kind: '送り', staff: '外部の人', kids: ['児童G'], start_time: '17:00', end_time: '17:30' },
];
const colored = sgDayHtml('2026-10-26', named, {}, { demo: false, today: '2026-10-27' });
assert.ok(colored.includes('#f8b500') && colored.includes('加藤 湊'), '加藤湊の利用は山吹色');
assert.ok(colored.includes('#4fc3f7'), '加藤先生の送迎は水色');
assert.ok(colored.includes('#1a237e') && colored.includes('#33b679') && colored.includes('#8e24aa'));
assert.ok(colored.includes('#e67c73') && colored.includes('#7986cb') && colored.includes('#d81b60'));
assert.ok(colored.includes('連先生') && colored.includes('友香先生') && colored.includes('文先生') && colored.includes('祥先生') && colored.includes('尚先生'));
assert.ok(!colored.includes('>あや'), 'あやの表記は文先生にそろえる');
const ayaUse = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6});color:(#[0-9a-f]{3,6})[^"]*" title="利用[^"]*中村 亮仁/);
assert.ok(ayaUse && ayaUse[1] === '#f8b500' && ayaUse[2] === '#222', '中村 亮仁の利用は山吹色');
const ayaRide = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6})[^"]*" title="[^"]*文先生"/);
assert.ok(ayaRide && ayaRide[1] === '#8e24aa', '担当が中村文の送迎は紫');
assert.ok(/その他/.test(colored) && colored.includes('中村 <span class="other">その他</span>'), '中村だけでは赤のその他');
assert.ok(!colored.includes('斉藤'), '斉藤　連は連先生と出す');
assert.ok(!colored.includes('ゆか'), 'ゆかは友香先生と出す');
const legend = colored.slice(colored.indexOf('class="sg-leg"'), colored.indexOf('class="sg-cal"'));
assert.strictEqual((legend.match(/連先生/g) || []).length, 1, 'れんの表記ゆれは凡例で1つ');
assert.strictEqual((legend.match(/文先生/g) || []).length, 1, 'あやと中村文は凡例で文先生1つ');
assert.ok(colored.includes('#d50000') && colored.includes('その他'), '一覧外の担当は赤');
const useBlock = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6});color:(#[0-9a-f]{3,6})[^"]*" title="利用[^"]*加藤 湊/);
assert.ok(useBlock && useBlock[1] === '#f8b500' && useBlock[2] === '#222', '利用は山吹色に黒文字');
const ride = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6})[^"]*" title="[^"]*加藤先生"/);
assert.ok(ride && ride[1] === '#4fc3f7', '担当が加藤先生の送迎だけ水色');
const minatoUse = evFace(colored, ['利用', '加藤 湊']);
assert.ok(minatoUse && minatoUse.inner === '湊', '加藤 湊の利用は湊');
assert.ok(minatoUse.title.includes('加藤 湊'), '姓は title に残す');
const minatoPick = evFace(colored, ['☆ 迎え', '加藤 湊']);
assert.ok(minatoPick && minatoPick.inner === '☆湊' && minatoPick.title.includes('加藤先生'), '迎えは☆湊、色の担当は title');
const akihitoUse = evFace(colored, ['利用', '中村 亮仁']);
assert.ok(akihitoUse && akihitoUse.inner === '亮仁', '中村 亮仁の利用は亮仁');

const parentUse = sgDayHtml('2026-10-26', [
  { day: '2026-10-26', kind: '利用', child: '加藤 湊', start_time: '10:00', end_time: '12:00', parent_drop: true, parent_pick: true },
], {}, { demo: false, today: '2026-10-27' });
const parentFace = evFace(parentUse, ['利用', '加藤 湊']);
assert.ok(parentFace && parentFace.inner === '湊', '保護者送迎の注記はブロックに出さない');
assert.ok(parentFace.title.includes('保護者が送る') && parentFace.title.includes('保護者が迎える'), '保護者の注記は title に残す');

const kinmuDay = [
  { day: '2026-10-26', kind: '勤務', staff: '中村 文', title: 'あや先生 １４：００' },
  { day: '2026-10-26', kind: '利用', child: '児童A', start_time: '10:00', end_time: '15:00' },
  { day: '2026-10-26', kind: '利用', child: '児童B', start_time: '10:00', end_time: '15:00' },
  { day: '2026-10-26', kind: '迎え', staff: '中村　文', kids: ['児童A'], start_time: '09:40', end_time: '10:10' },
  { day: '2026-10-26', kind: '送り', staff: '友香先生', kids: ['児童B'], start_time: '15:00', end_time: '15:30' },
  { day: '2026-10-26', kind: '勤務', staff: '友香先生', title: '午後' },
  { day: '2026-10-26', kind: '休所', title: '研修' },
];
const kinmu = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27' });
assert.ok(/<span class="sg-chip" style="background:#8e24aa;color:#fff">勤務 文先生 あや先生 １４：００<\/span>/.test(kinmu), '勤務の担当 中村 文は紫の文先生');
assert.ok(!kinmu.includes('中村 文'), '凡例も予定も中村 文のままにしない');
assert.ok(kinmu.includes('文先生') && kinmu.includes('#8e24aa'));
assert.ok(kinmu.includes('利用 10:00'), 'オフのときは利用を出す');
const asAya = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27', mine: true, me: 'あや' });
assert.ok(asAya.includes('aria-pressed="true"') && asAya.includes('sg-on'), '自分の担当はオンが見た目で分かる');
assert.ok(!/title="利用/.test(asAya) && !asAya.includes('利用 10:00'), '自分の担当では利用を出さない');
const ayaLeg = asAya.slice(asAya.indexOf('class="sg-leg"'), asAya.indexOf('class="sg-cal"'));
assert.ok(!ayaLeg.includes('利用児童'), 'オンの凡例に利用児童は出さない');
assert.ok(asAya.includes('☆ 迎え') && asAya.includes('児童A'), '自分の迎えは残る');
assert.ok(!asAya.includes('児童B'), 'ほかの担当の送りは出さない');
assert.ok(asAya.includes('文先生') && !asAya.includes('友香先生'));
assert.ok(asAya.includes('研修'), '休所は残す');
assert.ok(/勤務 文先生/.test(asAya), '自分の勤務は残す');
assert.ok(asAya.includes('自分の担当の迎え・送りだけです'));
const asBun = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27', mine: true, me: '中村 文' });
assert.ok(!/title="利用/.test(asBun) && asBun.includes('児童A') && !asBun.includes('児童B'), '中村 文はあやと同じ担当');
const asFamily = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27', mine: true, me: '中村' });
assert.ok(asFamily.includes('この日の自分の担当はありません'), '中村だけでは文先生の担当にしない');
assert.ok(!asFamily.includes('児童A') && !asFamily.includes('文先生'));
const asChild = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27', mine: true, me: '中村 亮仁' });
assert.ok(asChild.includes('この日の自分の担当はありません'));
const asNone = sgDayHtml('2026-10-26', kinmuDay, {}, { demo: false, today: '2026-10-27', mine: true, me: '' });
assert.ok(asNone.includes('担当の名前が未登録です'));
assert.ok(!asNone.includes('児童A') && !asNone.includes('友香先生'));

const nov = sgDayHtml('2026-11-17', [], {}, { demo: false, today: '2026-10-26' });
assert.ok(nov.includes("sgOpenMonth('2026-11-17')"), '11月17日の月ボタンはその日');
assert.ok(nov.includes('11/17（火）'));
vm.runInContext(`
  location = { _h: '#leo/day/2026-11-17', get hash() { return this._h; }, set hash(v) { this._h = String(v).charAt(0) === '#' ? String(v) : '#' + v; } };
  SG_HOME_MONTH = '2026-10';
  sgOpenMonth('2026-11-17');
  if (SG_HOME_MONTH !== '2026-11') throw new Error('month ' + SG_HOME_MONTH);
  if (location.hash !== '#leo') throw new Error('hash ' + location.hash);
  sgOpenMonth('bad');
  if (SG_HOME_MONTH !== '2026-11') throw new Error('bad date changed month');
  globalThis.__home = 0;
  leoHomeCal = () => { __home += 1; };
  sgOpenMonth('2026-11-17');
  if (location.hash !== '#leo' || __home !== 1 || SG_HOME_MONTH !== '2026-11') throw new Error('redraw ' + __home + ' ' + SG_HOME_MONTH);
`, sandbox);

const bare = sgDayHtml('2026-10-27', evs, {}, { demo: false, today: '2026-10-26' });
assert.ok(bare.includes('終日'), '時刻のない予定は終日');
assert.ok(bare.includes('未定'));
assert.ok(!bare.includes('data-sg-now'), '今日以外に現在時刻の線は出さない');
assert.ok(!day.includes('予定を追加') && !day.includes('sgEvOpen') && !day.includes('sgEditSlot'), '直す権限が無い日は今までどおり');

const editableEvs = evs.map((e, i) => ({ ...e, id: i + 1 }));
const edit = sgDayHtml('2026-10-26', editableEvs, {}, { demo: true, today: '2026-10-26', canEdit: true });
assert.ok(edit.includes('予定を追加') && edit.includes('sgEditNew(') && edit.includes('sgEvOpen(') && edit.includes('sgEditSlot('));
assert.ok(edit.includes('min-height:44px'));
const top = edit.slice(edit.indexOf('class="sg-top"'), edit.indexOf('</div>'));
assert.ok(!top.includes('予定を追加'), '追加ボタンは日付の行の外');
assert.ok(edit.indexOf('予定を追加') > edit.indexOf('</div>'));

sandbox.ROLE = '職員'; sandbox.DUTY = '児発管';
assert.strictEqual(sandbox.sgCanEditCal('職員X'), true);
sandbox.DUTY = '管理者';
assert.strictEqual(sandbox.sgCanEditCal('職員Y'), true);
sandbox.ROLE = '事務'; sandbox.DUTY = '現場支援員';
assert.strictEqual(sandbox.sgCanEditCal(''), true);
sandbox.ROLE = '職員'; sandbox.DUTY = '現場支援員';
assert.strictEqual(sandbox.sgCanEditCal('中村 友香'), true);
assert.strictEqual(sandbox.sgCanEditCal('中村\u3000友香'), true);
assert.strictEqual(sandbox.sgCanEditCal('中村友香'), true);
assert.strictEqual(sandbox.sgCanEditCal('中村'), false);
assert.strictEqual(sandbox.sgCanEditCal('友香'), false);
assert.strictEqual(sandbox.sgCanEditCal('中村文'), false);
assert.strictEqual(sandbox.sgCanEditCal('中村 亮仁'), false);
assert.strictEqual(sandbox.sgCanEditCal(''), false);
const cfg = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
assert.ok(!/'事務': \[[^\]]*児童の利用・送迎予定/.test(cfg), '事務の仕事から予定タイルを外す');
assert.ok(!/中村友香担当', \[[^\]]*児童の利用・送迎予定/.test(cfg), '中村の欄から予定タイルを外す');
assert.ok(cfg.includes("'#leo/cal'"), '予定の画面は残す');
const cfgWin = {};
vm.runInNewContext(cfg, { window: cfgWin });
const leo = cfgWin.PORTAL_CONFIG.offices.find(o => o.id === 'leo');
assert.strictEqual(leo.groups.map(g => g[1]).join('|'), '現場|事務・計画');
assert.strictEqual(leo.groups[0][2].join('|'), ['今日の送迎（自分の担当）', 'みんなの送迎', '児童の利用・送迎予定', '送迎 型表'].join('|'));
assert.strictEqual(leo.groups[1][2].join('|'), ['アセスメント', '利用契約書・重要事項説明書', '個別支援計画（管理）', 'モニタリングシート（相談員へ渡す印刷）', '個別支援計画 管理表', '利用者情報（児童ごと）', '来月の利用予定（保護者に聞く）', '利用料実費請求', '国保連請求', '保護者の実績確認', 'サービス提供実績記録表', '勤務実績及び利用者の実績表', '直した所', '請求の印（欠席時対応・子育てサポート）', '児童別表示', '実績記録（請求元）'].join('|'));
assert.strictEqual(leo.mine['現場支援員'].join('|'), '');
assert.strictEqual(leo.mine['児発管'].join('|'), '');
assert.strictEqual(leo.mine['事務'].join('|'), '利用者情報（児童ごと）');
assert.strictEqual(leo.who[0][0], '中村友香担当');
assert.strictEqual(leo.who[1][0], '事務担当');
assert.strictEqual(leo.who[0][1].join('|'), '来月の利用予定（保護者に聞く）|個別支援計画（管理）|配置表・型表・管理表・送迎の配慮の入力|児童別表示|受給者証の入力（保護者から）');
assert.ok(!leo.who[0][1].includes('日誌（見る・直す）'), '中村友香担当の欄から日誌を外す');
assert.strictEqual(leo.who[1][1].join('|'), '利用料実費請求|国保連請求|保護者の実績確認|サービス提供実績記録表|上限額管理');
assert.ok(cfgWin.PORTAL_CONFIG.offices.every(o => !(o.groups || []).some(g => /全ての画面|すべての画面|請求・事務/.test(g[1]))));
const groupNames = new Set(leo.groups.flatMap(g => g[2]));
const onHome = new Set([].concat(...Object.values(leo.mine), ...leo.who.map(w => w[1]), leo.routine, [leo.todoTop, '出退勤打刻', '今日の利用児童', 'ヒヤリハット', 'LINE報告を書く', '日誌（見る・直す）', 'シフト']));
assert.ok(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes("t[1] === 'シフト'"), 'シフトはホームに置く');
const uncovered = leo.tiles.map(t => t[1]).filter(n => !groupNames.has(n) && !onHome.has(n)).sort();
assert.strictEqual(uncovered.join('|'), ['公式LINE', '公式LINE（管理画面）', '写真（Googleフォト）', '職員配置表', '書類', '日誌の元シート（参考・旧）', '実績記録（児童ごと）', '日誌（児童ごと）', '不具合・修正の依頼', '今日やること（児発管）'].sort().join('|'));
['出退勤打刻', 'ヒヤリハット', '今日の利用児童', 'LINE報告を書く', '不具合・修正の依頼', '日誌（児童ごと）', '上限額管理', '今日やること（児発管）'].forEach(n => assert.ok(!groupNames.has(n), '毎日やると重ねない: ' + n));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(!leo.groups[0][2].includes('LINE報告を書く'), 'LINE報告は現場に重ねない');
assert.strictEqual(leo.tiles.find(t => t[1] === 'LINE報告を書く')[2], '#leo/line');
assert.strictEqual(leo.tiles.find(t => t[1] === 'モニタリングシート（相談員へ渡す印刷）')[2], '#leo/monitoring');
assert.strictEqual(leo.tiles.find(t => t[1] === 'モニタリングシート（相談員へ渡す印刷）')[6], '児発管');
assert.ok(!html.includes("big('#leo/monitoring'"), '毎日やるにはモニタリングを置かない');
assert.ok(leo.groups[1][2].indexOf('個別支援計画（管理）') + 1 === leo.groups[1][2].indexOf('モニタリングシート（相談員へ渡す印刷）'), '計画のすぐ隣');
assert.ok(!leo.groups.some(g => g[2].includes('LINEの下書き')), 'LINEの下書きはグループに置かない');
assert.ok(html.includes("big('#leo/line', '💬', 'LINE報告を書く'"), '毎日やるはLINE報告を書く');
assert.ok(html.includes("big('#leo/nikki', '📔', '日誌'"), '毎日やるに日誌を1つ');
assert.ok(!html.includes("big('#uketsuke'"), '毎日やるには不具合の依頼を置かない');
assert.ok(html.includes("hideFromHome") && html.includes("不具合・修正の依頼"), '不具合はホームから隠す（ルートは残す）');
assert.ok(!html.includes("big('#leo/linedraft'"), '毎日やるから下書きを外す');
const fixTile = leo.tiles.find(t => t[2] === '#uketsuke');
assert.strictEqual(fixTile[1], '不具合・修正の依頼');
assert.strictEqual(fixTile[0], '🐛');
assert.ok(!fixTile[6], '役割制限なし');
assert.strictEqual(leo.tiles.filter(t => t[2] === '#uketsuke').length, 1, '受付の別名タイルは足さない');
assert.ok(!leo.groups.some(g => g[2].includes('受付') || g[2].includes('不具合・修正の依頼')));
assert.ok(!html.includes('全ての画面') && !html.includes('すべての画面'), '画面側の文言も消す');
assert.ok(!cfg.includes('全ての画面') && !cfg.includes('すべての画面'), '設定の文言も消す');
assert.ok(!html.includes('!anyCatch'), '未分類を最後のグループへ足さない');

const homeSrc = html.slice(html.indexOf('const hideFromHome'), html.indexOf('async function leoHomeStatus'));
function renderLeoHome(role, duty, name) {
  const sbx = {
    DUTY: duty, ROLE: role, IS_CHAIR: false,
    MY_FULL_NAME: String(name || '').replace(/[\s　]/g, ''),
    canManage: () => role === '事務' || duty === '管理者' || duty === '児発管',
    canLeoHomeTodo: () => role === '事務' || duty === '管理者' || duty === '児発管' || String(name || '').replace(/[\s　]/g, '') === '中村友香',
    leo,
  };
  vm.runInNewContext(homeSrc + '\nthis.out = leoHomeBody(leo);', sbx);
  return sbx.out;
}
[['職員', '現場支援員'], ['職員', '児発管'], ['職員', '管理者'], ['事務', '現場支援員']].forEach(([role, duty]) => {
  const body = renderLeoHome(role, duty);
  const dailyEnd = body.indexOf('</div>', body.indexOf('毎日やる'));
  const daily = body.slice(body.indexOf('毎日やる'), dailyEnd);
  assert.ok(!daily.includes('不具合・修正の依頼') && !daily.includes('#uketsuke'), role + '/' + duty + ' の毎日やるには置かない');
  assert.ok(!body.includes('href="#uketsuke"') && !body.includes('不具合・修正の依頼'), role + '/' + duty + ' のホームから受付は外す');
  ['今日の利用児童', 'ヒヤリハット', 'LINE報告を書く', '日誌', '#leo/nikki'].forEach(label => {
    assert.ok(body.includes(label) || daily.includes(label), role + '/' + duty + ' ' + label);
  });
  assert.ok(!daily.includes('#leo/monitoring') && !daily.includes('モニタリングシート'), role + '/' + duty + ' の毎日やるにモニタリングは置かない');
  assert.ok(body.includes('送迎') && body.includes('href="#leo/kata"'), role + '/' + duty + ' に送迎を直置き');
});
const field = renderLeoHome('職員', '現場支援員');
assert.ok(!field.includes('中村友香担当') && !field.includes('事務担当') && !field.includes('がする'), '現場職員に担当欄を出さない');
assert.ok(!field.includes('事務・計画') && !field.includes('href="#leo/g1"'), '現場職員のホームから事務・計画を外す');
assert.ok(!field.includes('href="#leo/g0"'), '送迎は直置き（現場フォルダはホームに出さない）');
const nakaField = renderLeoHome('職員', '現場支援員', '中村友香');
assert.ok(nakaField.includes('中村友香担当'), '中村本人（現場職責でも）には担当欄を出す');
{
  const nsec = nakaField.slice(nakaField.indexOf('中村友香担当'));
  assert.ok(!nsec.includes('今日の日誌') && !nsec.includes('href="#leo/nikki"'), '中村本人の担当欄から今日の日誌を外す');
  assert.ok(nakaField.slice(0, nakaField.indexOf('中村友香担当')).includes('href="#leo/nikki"'), '中村本人も毎日やるの日誌は残す');
}
assert.ok(!nakaField.includes('事務担当'), '中村本人でも事務担当は出さない');
const kanri = renderLeoHome('職員', '児発管');
assert.ok(kanri.includes('中村友香担当'), '児発管に中村友香担当');
assert.ok(!kanri.includes('事務担当') && !kanri.includes('宮本がする'), '児発管に事務担当は出さない');
assert.ok(kanri.includes('事務・計画') || kanri.includes('href="#leo/g1"'), '児発管は事務・計画フォルダを使える');
const clerk = renderLeoHome('事務', '現場支援員');
assert.ok(clerk.includes('中村友香担当') && clerk.includes('事務担当'), '事務は両方の担当欄');
const mgr = renderLeoHome('職員', '管理者');
assert.ok(mgr.includes('中村友香担当') && mgr.includes('事務担当'), '管理者は両方の担当欄');
{
  const nikkiHref = leo.tiles.find(t => t[1] === '日誌（見る・直す）')[2];
  assert.strictEqual(nikkiHref, '#leo/nikki');
  assert.ok(!leo.who[1][1].includes('日誌（見る・直す）'), '事務担当の欄には置かない');
  const nakamura = renderLeoHome('職員', '児発管');
  const sec = nakamura.slice(nakamura.indexOf('中村友香担当'), nakamura.includes('事務担当') ? nakamura.indexOf('事務担当') : undefined);
  assert.ok(!sec.includes('href="#leo/nikki"') && !sec.includes('今日の日誌'), '中村の欄に今日の日誌を出さない');
  assert.ok(nakamura.slice(0, nakamura.indexOf('中村友香担当')).includes('href="#leo/nikki"'), '児発管の毎日やるに日誌は残す');
  assert.ok(sec.includes('href="#leo/master"'), '中村の欄に入力画面');
  assert.ok(sec.includes('href="#leo/jukyusha"') && sec.includes('受給者証の入力（保護者から）'), '中村の欄の最後に受給者証');
  assert.ok(sec.includes('href="#leo/jidobetsu"') && sec.includes('児童別表示'), '中村の欄に児童別表示');
  assert.ok(sec.indexOf('href="#leo/master"') < sec.indexOf('href="#leo/jidobetsu"') && sec.indexOf('href="#leo/jidobetsu"') < sec.indexOf('href="#leo/jukyusha"'), '児童別表示は入力画面のあと、受給者証の前');
  assert.ok(!leo.groups.some(g => g[2].includes('受給者証の入力（保護者から）')), '現場・事務・計画には重ねない');
  assert.ok(!sec.includes('利用料実費請求') && !sec.includes('href="#leo/jippi"'), '中村の欄から実費を外す');
  assert.ok(!sec.includes('href="#leo/kakunin"'), '中村の欄に保護者の実績確認を出さない');
  assert.strictEqual(leo.tiles.find(t => t[2] === '#leo/kakunin')[6], '児発管', '実績確認の役割は変えない');
  assert.ok(leo.who[1][1].includes('保護者の実績確認'), '事務担当の欄にも残す');
  assert.ok(leo.groups[1][2].includes('保護者の実績確認'), '事務・計画にも残す');
  assert.ok(!leo.who[0][1].includes('利用料実費請求'), '中村の一覧から実費を外す');
  assert.strictEqual(leo.tiles.find(t => t[2] === '#leo/jippi')[6], '児発管', '実費画面の役割は変えない');
  assert.strictEqual(leo.tiles.find(t => t[2] === '#leo/contract')[6], '児発管', '契約書の役割は児発管（現場には出さない）');
  assert.ok(leo.groups[1][2].includes('利用契約書・重要事項説明書'), '事務・計画に契約書');
  assert.ok(!leo.who[0][1].includes('利用契約書・重要事項説明書'), '中村の欄に契約書を重ねない');
  assert.ok(leo.who[1][1].includes('利用料実費請求'), '事務担当の欄には残す');
  assert.ok(leo.groups[1][2].includes('利用料実費請求'), '事務・計画にも残す');
  assert.ok(!leo.who[1][1].includes('配置表・型表・管理表・送迎の配慮の入力'), '事務担当の欄には置かない');
  assert.ok(leo.groups[0][2].includes('送迎 型表'), '現場の型表はそのまま');
  const jim = renderLeoHome('事務', '管理者');
  const jsec = jim.slice(jim.indexOf('事務担当'));
  assert.ok(jsec.includes('上限額管理') && jsec.includes('href="#leo/jogan"'), '事務担当に上限額管理');
  assert.ok(!jsec.includes('href="#leo/jukyusha"'), '事務担当に受給者証を置かない');
  assert.ok(!jsec.includes('href="#leo/jidobetsu"') && !jsec.includes('児童別表示'), '事務担当の欄から児童別表示を外す');
}
{
  const sbx = { DUTY: '現場支援員', ROLE: '職員', IS_CHAIR: false, MY_FULL_NAME: '', canManage: () => false, canLeoHomeTodo: () => false, leo };
  vm.runInNewContext(homeSrc + "\nthis.out = groupList(leo).find(g => g.label === '現場').tiles.map(t => t[1] + ' ' + t[2]).join('|');", sbx);
  assert.ok(sbx.out.includes('送迎 型表 #leo/kata'), '現場に型表の編集');
  assert.ok(!sbx.out.includes('日誌（見る・直す）'), '日誌は現場グループから外して毎日やるへ');
  assert.ok(!sbx.out.includes('#leo/master'), '児発管の入力は現場に出さない');
  assert.ok(!sbx.out.includes('gl:g4'), '元シートは現場に出さない');
}
assert.strictEqual(leo.tiles.find(t => t[1] === '送迎 型表')[2], '#leo/kata');
assert.ok(!leo.tiles.find(t => t[1] === '送迎 型表')[3].includes('見るだけ'));
assert.ok(leo.tiles.find(t => t[1] === '日誌（見る・直す）')[3].includes('ポータルで直す'));
assert.ok(leo.tiles.find(t => t[2] === 'gl:g4')[1].includes('参考・旧'));

// その他（研修・見学など）: 担当の有無に関係なく常に赤 #d50000。時刻があれば時間軸、無ければ終日の欄。担当名は出す
{
  const od = '2026-10-26';
  const sonota = [
    { id: 901, day: od, kind: 'その他', staff: '宮本 幸子', note: '研修', start_time: '10:00', end_time: '11:00' },
    { id: 902, day: od, kind: 'その他', note: '見学者', start_time: '13:00', end_time: '14:00' },
    { id: 903, day: od, kind: 'その他', note: '時刻なし', staff: '連先生' },
    { id: 904, day: od, kind: 'その他', note: '外部', staff: '外部の人', start_time: '15:00' },
  ];
  const h = sgDayHtml(od, sonota, {}, { demo: false, today: '2026-10-27' });
  assert.strictEqual((h.match(/<div class="sg-ev[^"]*" style="[^"]*" title="その他[^"]*"/g) || []).length, 3, '時刻のあるその他は時間軸のブロック');
  assert.ok(/background:#d50000;color:#fff[^"]*" title="その他 10:00–11:00 研修 宮本 幸子"/.test(h), '担当が宮本でも赤');
  assert.ok(/background:#d50000;color:#fff[^"]*" title="その他 13:00–14:00 見学者"/.test(h), '担当なしも赤');
  assert.ok(/background:#d50000;color:#fff[^"]*" title="その他 15:00 外部 外部の人"/.test(h), '一覧外の担当も赤');
  assert.ok(h.includes('<div class="k">その他 10:00<wbr>–11:00　宮本 幸子</div><div class="nm">研修</div>'), '担当名は上の行、本文は内容');
  assert.ok(!/background:#d81b60/.test(h), '宮本のピンクは使わない');
  const chip = h.match(/<span class="sg-chip[^"]*"[^>]*>その他 連先生 時刻なし<\/span>/);
  assert.ok(chip && chip[0].includes('background:#d50000') && !chip[0].includes('neutral') && !chip[0].includes('#1a237e'), '終日のチップも担当に関係なく赤（担当名は出す）');
  const leg = h.slice(h.indexOf('class="sg-leg"'), h.indexOf('class="sg-cal"'));
  assert.ok(leg.includes('その他（研修・見学など）') && leg.includes('background:#d50000'), '凡例に赤');
  assert.ok(!leg.includes('宮本 幸子') && !leg.includes('連先生'), 'その他だけの担当は担当色の凡例に出さない');
  const none = sgDayHtml(od, [{ day: od, kind: '利用', child: '児童A', start_time: '10:00', end_time: '11:00' }], {}, { demo: false, today: '2026-10-27' });
  assert.ok(!none.includes('その他（研修・見学など）'), 'その他が無い日は凡例に出さない');
  const mine = sgDayHtml(od, sonota, {}, { demo: false, mine: true, me: '宮本 幸子', today: '2026-10-27' });
  assert.ok(mine.includes('研修') && !mine.includes('見学者') && mine.includes('その他（研修・見学など）'), '自分の担当では自分のその他だけ（赤）');
}

sandbox.leoListedStaff = n => String(n).replace(/[\s\u3000]/g, '') !== '河合尚美';
{
  const day = '2026-11-11';
  const rows = [
    { day, kind: '勤務', staff: '河合　尚美', title: '10:00〜18:00', source: 'shift', _shift: true },
    { day, kind: '勤務', staff: '中村　友香', title: '10:00〜18:00', source: 'shift', _shift: true },
    { day, kind: '迎え', staff: '河合 尚美', kids: ['児童A'], start_time: '15:00', end_time: '15:30', place: '見本公園' },
    { day, kind: '迎え', staff: '連先生', kids: ['児童B'], start_time: '14:00', end_time: '14:30' },
  ];
  const h = sgDayHtml(day, rows, {}, { demo: false, today: '2026-10-01' });
  const chips = h.slice(h.indexOf('class="sg-chips"'), h.indexOf('class="sg-time"'));
  assert.ok(!chips.includes('河合'), '日の予定の終日（勤務）に河合を出さない');
  assert.ok(chips.includes('友香先生'), 'ほかの勤務は残す');
  assert.ok(h.includes('河合 尚美'), '保存済みの迎え担当は残す');
  assert.ok(h.includes('連先生'));
}
delete sandbox.leoListedStaff;
console.log('leo_home_cal_test ok');
