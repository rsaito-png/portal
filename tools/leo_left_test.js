// 退所日の境界（node tools/leo_left_test.js）。画面の除外と SQL の境界を同じ規則で確認する。
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const L = require('../leo_left.js');

const idx = L.leftIndex([
  { name: '増田 匠杜', left_on: '2026-10-31' },
  { name: '児童D', left_on: '2026-09-30' },
  { name: '児童A', left_on: null },
  { name: '空', left_on: '' },
]);

assert(L.leftOnOf(idx, '増田 匠杜') === '2026-10-31', 'exact name');
assert(L.leftOnOf(idx, '増田匠杜') === '2026-10-31', 'space-insensitive');
assert(L.leftOnOf(idx, '増田　匠杜') === '2026-10-31', 'ideographic space');
assert(L.leftOnOf(idx, '児童A') === null, 'no date');
assert(!L.leftPast(idx, '増田 匠杜', '2026-10-31'), '退所日当日は在籍');
assert(L.leftPast(idx, '増田 匠杜', '2026-11-01'), '翌日は対象外');
assert(!L.leftPast(idx, '増田 匠杜', '2026-10-21'), '退所前は出る');
assert(L.leftBefore(idx, '増田 匠杜', '2026-11-01'), '11月はまるごと対象外');
assert(!L.leftBefore(idx, '増田 匠杜', '2026-10-01'), '10月は対象');
assert(L.leftDone(idx, '児童D', '2026-10-21') === true, '過ぎた退所は一覧で退所');
assert(L.leftDone(idx, '増田 匠杜', '2026-10-21') === false, '未来の退所はまだ在籍');
assert(L.leftStatus(idx, '増田 匠杜', '2026-10-21') === 'scheduled', '退所予定');
assert(L.leftStatus(idx, '児童D', '2026-10-21') === 'left', '退所済');
assert(L.leftStatus(idx, '児童A', '2026-10-21') === 'active', '在籍');
assert(L.leftDone(idx, '増田 匠杜', '2026-11-01') === true, '翌日には退所児童');

// 月の途中退所：その日までは残り、翌日以降の行だけ落とす
const mid = L.leftIndex([{ name: '児童C', left_on: '2026-11-15' }]);
assert(!L.leftBefore(mid, '児童C', '2026-11-01'), '月途中は依頼の対象');
assert(!L.leftPast(mid, '児童C', '2026-11-15'), '15日は残す');
assert(L.leftPast(mid, '児童C', '2026-11-16'), '16日は落とす');

const events = [
  { id: 1, day: '2026-10-31', kind: '利用', child: '増田 匠杜' },
  { id: 2, day: '2026-11-02', kind: '利用', child: '増田匠杜' },
  { id: 3, day: '2026-11-02', kind: '利用', child: '児童A' },
  { id: 4, day: '2026-11-02', kind: '休み', child: '児童D' },
  { id: 5, day: '2026-11-02', kind: '迎え', kids: ['増田 匠杜', '児童A'], staff: '職員X', kid_places: { '増田 匠杜': '学校', '児童A': '公園' }, kid_times: { '増田 匠杜': '14:30', '児童A': '14:40' }, title: '☆元' },
  { id: 6, day: '2026-11-02', kind: '送り', kids: ['増田 匠杜'], staff: '職員Y', title: '★だけ' },
  { id: 7, day: '2026-11-02', kind: '休所', title: '祝日' },
  { id: 8, day: '2026-10-21', kind: '迎え', kids: ['増田 匠杜', '児童A'], title: '☆残す' },
];
const f = L.filterEventsByLeft(events, idx);
assert(f.some(e => e.id === 1), '退所日の利用は残す');
assert(!f.some(e => e.id === 2), '翌日の利用は出さない');
assert(f.some(e => e.id === 3), 'ほかの児童は残す');
assert(!f.some(e => e.id === 4), '退所済みの休みは出さない');
const pick = f.find(e => e.id === 5);
assert(pick && pick.kids.join(',') === '児童A', '同乗の退所児童だけ外す');
assert(pick.kid_places['児童A'] === '公園' && !pick.kid_places['増田 匠杜'], '場所も外す');
assert(pick.title === '☆児童A', '表示用のタイトル');
assert(!f.some(e => e.id === 6), '全員退所の便は出さない');
assert(f.some(e => e.id === 7), '休所は触らない');
assert(f.find(e => e.id === 8).title === '☆残す', '退所前の便はそのまま');
assert(events[4].kids.length === 2, '元データは消さない');

const rows = [
  { day: '2026-10-31', child: '増田 匠杜' },
  { day: '2026-11-03', child: '増田 匠杜' },
  { day: '2026-11-03', child: '児童A' },
];
const fr = L.filterByLeftDay(rows, idx);
assert(fr.length === 2 && fr[1].child === '児童A', '日誌由来の送迎も翌日以降だけ外す');

console.log('leo_left_test ok');
