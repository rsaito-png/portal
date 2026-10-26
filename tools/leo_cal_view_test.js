// レオ予定の見た目（日・週・月）。node tools/leo_cal_view_test.js
// 作成・確定の保存処理（leo_events への POST/PATCH/DELETE）は変えていないことだけ確認する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => '2026-11-04';
const sandbox = {
  DEMO: false,
  LEO_VIEWS: {},
  esc, today,
  canManage: () => true,
  demoNote: () => '',
  console,
  alert() {},
  document: { getElementById() { return null; }, querySelectorAll() { return []; } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'leo_cal.js'), 'utf8'), sandbox, { filename: 'leo_cal.js' });

const { calDay, calWeek, calMonth, calWin, calGeom, calColor, calForm, CAL } = sandbox;

const care = { '児童B': '抱っこが必要' };
const evs = [
  { id: 1, day: '2026-11-04', kind: '利用', child: '児童A', start_time: '10:30', end_time: '14:30', note: '⚠ 保護者の備考：午後は早めにお迎えに行きます。' },
  { id: 2, day: '2026-11-04', kind: '利用', child: '児童B', start_time: '15:50', end_time: '17:00' },
  { id: 3, day: '2026-11-04', kind: '利用', child: '児童C', start_time: '16:15', end_time: '17:00', parent_pick: true },
  { id: 4, day: '2026-11-04', kind: '休み', child: '児童D' },
  { id: 5, day: '2026-11-04', kind: '迎え', staff: '職員X', kids: ['児童A'], start_time: '10:10', end_time: '10:40', kid_times: { '児童A': '10:20' }, kid_places: { '児童A': '〇〇小学校' } },
  { id: 6, day: '2026-11-04', kind: '迎え', staff: '職員Y', kids: ['児童B', '児童C'], start_time: '15:00', end_time: '16:20', kid_times: { '児童B': '15:00', '児童C': '15:25' }, kid_places: { '児童B': '△△学園', '児童C': '□□バス停' } },
  { id: 7, day: '2026-11-04', kind: '送り', staff: '職員X', kids: ['児童A', '児童B'], start_time: '14:30', end_time: '17:20', kid_times: { '児童A': '14:30', '児童B': '17:00' }, kid_places: { '児童A': '自宅', '児童B': '〇〇園' } },
  { id: 8, day: '2026-11-04', kind: '不在', staff: '職員Z', title: '午後不在' },
  { id: 9, day: '2026-11-04', kind: '利用', child: '児童E', start_time: '13:00', end_time: '15:00' },
];
const day = calDay('2026-11-04', evs, care);

assert.ok(!day.includes('<th>児童</th>'), '日表示は表ではない');
assert.ok(day.includes('児童A') && day.includes('児童B') && day.includes('児童C'), '児童名');
assert.ok(day.includes('10:30') && day.includes('14:30') && day.includes('15:50') && day.includes('17:00'), '利用時間');
assert.ok(day.includes('職員X') && day.includes('10:20') && day.includes('〇〇小学校'), '迎えの担当・時刻・場所');
assert.ok(day.includes('自宅') && day.includes('〇〇園'), '送りの場所');
assert.ok(day.includes('保護者の備考') && day.includes('午後は早めにお迎えに行きます'), '保護者備考は展開用に残す');
assert.ok(!day.includes('⚠ 保護者の備考：'), '備考の見出しは重複させない');
assert.ok(day.includes('calEdit(1)'), '直す');
assert.ok(day.includes('児童D') && day.includes('休み'), '休み');
assert.ok(day.includes('抱っこが必要') && day.includes('配慮'), '送迎の配慮');
assert.ok(day.includes('保護者が迎えに来る'), '保護者のお迎え');
assert.ok(day.includes('☆ 迎え') && day.includes('★ 送り'), '送迎の便');
assert.ok(day.includes('職員Z') && day.includes('午後不在'), '職員の不在');
assert.ok(day.includes('利用 4人'), '利用人数');
assert.ok(!day.includes('リーダー'), '職名は使わない');

const win = calWin(evs);
const g = calGeom(win, evs[0]);
assert.ok(g.left >= 0 && g.width > 10, '利用の棒に幅がある ' + JSON.stringify(g));
assert.ok(day.includes('width:' + g.width + '%'), '棒の幅が時刻に対応する');
assert.notStrictEqual(calColor('児童A'), calColor('児童B'));

const cols = sandbox.canManage;
sandbox.canManage = () => false;
const plain = calDay('2026-11-04', evs, {});
assert.ok(!plain.includes('calEdit('), '見るだけの人に直すは出ない');
sandbox.canManage = cols;

const noId = calDay('2026-11-04', [{ day: '2026-11-04', kind: '利用', child: '児童A', start_time: '10:00', end_time: '12:00', note: 'メモだけ' }], {});
assert.ok(noId.includes('メモ') && noId.includes('メモだけ') && !noId.includes('calEdit('), 'idのない予定（作成前の確認）は直さない');
assert.ok(noId.includes('迎えなし') && noId.includes('送りなし'));

CAL.d = '2026-11-04';
CAL.mode = 'week';
const weekEvs = evs.concat([
  { id: 10, day: '2026-11-02', kind: '利用', child: '児童A', start_time: '13:00', end_time: '16:00' },
  { id: 11, day: '2026-11-07', kind: '休所', title: '土曜日はお休み' },
]);
const week = calWeek(weekEvs, care);
for (const d of ['11/2（月）', '11/3（火）', '11/4（水）', '11/5（木）', '11/6（金）', '11/7（土）', '11/8（日）']) assert.ok(week.includes(d), d);
assert.ok(week.includes('calv-bar') && week.includes('児童A'), '週の棒');
assert.ok(week.includes('土曜日はお休み'), '休所');
assert.ok(week.includes("calOpen('2026-11-04')"), '週から日を開く');
assert.ok(week.includes('送迎の便'), '週でも送迎は残す');

CAL.mode = 'month';
const month = calMonth(weekEvs);
assert.ok(month.includes('calv-m') && month.includes('calv-dots'), '月は色の点');
assert.ok(month.includes("calOpen('2026-11-04')"), '月から日を開く');
assert.ok(month.includes('休所'));

const form = calForm({ id: 1, day: '2026-11-04', kind: '利用', child: '児童A', kids: ['児童A'], staff: '職員X', start_time: '10:30', end_time: '14:30', parent_drop: false, parent_pick: true, place: '自宅', note: 'メモ', source: 'portal' }, ['児童A'], ['職員X']);
for (const id of ['cf_day', 'cf_kind', 'cf_child', 'cf_kids', 'cf_staff', 'cf_st', 'cf_en', 'cf_pd', 'cf_pp', 'cf_place', 'cf_note']) assert.ok(form.includes('id="' + id + '"'), id);
assert.ok(form.includes('calSave()') && form.includes('calDel()') && form.includes('保護者が送ってくる') && form.includes('保護者が迎えに来る'));

const save = sandbox.calSave.toString();
assert.ok(save.includes("leo_events?id=eq.") && save.includes('method: \'PATCH\'') && save.includes('method: \'POST\''), '保存先は従来どおり');
assert.ok(save.includes('parent_drop') && save.includes('parent_pick') && save.includes('source: \'portal\''));
const del = sandbox.calDel.toString();
assert.ok(del.includes("method: 'DELETE'") && del.includes('leo_events?id=eq.'));

const multi = calDay('2026-11-04', [
  { id: 1, day: '2026-11-04', kind: '利用', child: '児童A', start_time: '10:00', end_time: '12:00' },
  { id: 2, day: '2026-11-04', kind: '迎え', staff: '職員X', kids: ['児童A'], start_time: '09:40', end_time: '10:10' },
  { id: 3, day: '2026-11-04', kind: '迎え', staff: '職員Y', kids: ['児童A'], start_time: '09:50', end_time: '10:20' },
], {});
assert.ok(multi.includes('複数'), '迎えが複数なら警告');
assert.ok(multi.includes('担当なし') === false);
const miss = calDay('2026-11-04', [
  { id: 1, day: '2026-11-04', kind: '利用', child: '児童D', start_time: '14:00', end_time: '16:00' },
  { id: 2, day: '2026-11-04', kind: '迎え', staff: '', kids: ['児童D'], start_time: '13:40', end_time: '14:10', kid_times: { '児童D': '13:50' }, kid_places: { '児童D': '自宅' } },
], {});
assert.ok(miss.includes('担当なし') && miss.includes('13:50') && miss.includes('自宅') && miss.includes('送りなし'));

// 作成前の確認（leo_yotei と同じ呼び方）で、確定ボタンの文言は別ファイル。ここでは月の日が全部描けること。
const preview = ['2026-11-02', '2026-11-04'].map(d => calDay(d, evs.filter(e => e.day === d).map(({ id, ...rest }) => rest), {})).join('');
assert.ok(preview.includes('児童A') && !preview.includes('calEdit('));

console.log('leo_cal_view_test ok');
