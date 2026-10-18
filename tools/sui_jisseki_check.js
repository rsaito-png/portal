// 水晶玉 月間実績の表示用ヘルパの軽い検証（DB不要）
const sjNormAdd = arr => (arr || []).map(a => typeof a === 'string' ? { name: a, count: 1 } : { name: a.name, count: Math.max(1, +a.count || 1) }).filter(a => a.name);
const sjAddText = adds => { const a = sjNormAdd(adds); return a.length ? a.map(x => x.count > 1 ? `${x.name}×${x.count}` : x.name).join('、') : '—'; };
const sjLabel = (u, kind) => {
  if (!kind) return '—';
  if (u && u.kind === '障害児') return kind === '新規' ? '障害児相談支援（新規）' : '障害児継続相談支援（継続）';
  return kind === '新規' ? 'サービス利用支援（新規）' : '継続サービス利用支援（継続）';
};

function assert(c, m) { if (!c) throw new Error(m); }
assert(sjAddText(['初回加算', { name: '退院・退所加算', count: 2 }]) === '初回加算、退院・退所加算×2', 'add text');
assert(sjLabel({ kind: '障害福祉サービス' }, '新規') === 'サービス利用支援（新規）', 'adult new');
assert(sjLabel({ kind: '障害児' }, '継続') === '障害児継続相談支援（継続）', 'child cont');
assert(sjLabel({ kind: '障害福祉サービス' }, null) === '—', 'none');
assert(sjNormAdd([{ name: '集中支援加算', count: 0 }])[0].count === 1, 'count floor');
console.log('sui_jisseki_check: ok');
