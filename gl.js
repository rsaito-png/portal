// 内部リンク（Google ドライブ等）と、書類に入れる職員名は公開リポジトリに置かない。
// ログイン後に Supabase の portal_links（RLS：在籍職員のみ）から読む。リンクは href="gl:キー" の形で書く。
window.GL = window.GL || {};
function gl(k, fallback) { return (window.GL && window.GL[k]) || (fallback ?? ''); }
let GL_LOADING = null;
function loadGL() {
  let s = {}; try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (_) {}
  if (!s.token || !window.PORTAL_CONFIG) return Promise.resolve();
  const C = window.PORTAL_CONFIG;
  GL_LOADING = fetch(C.supabaseUrl + '/rest/v1/portal_links?select=k,url', { headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token } })
    .then(r => r.ok ? r.json() : []).then(a => { if (Array.isArray(a)) a.forEach(x => { window.GL[x.k] = x.url; }); }).catch(() => {});
  return GL_LOADING;
}
loadGL();
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="gl:"]'); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  const k = a.getAttribute('href').slice(3);
  if (gl(k)) { window.open(gl(k), '_blank', 'noopener'); return; }
  const w = window.open('about:blank', '_blank');
  loadGL().then(() => { if (gl(k)) { if (w) w.location = gl(k); else location.href = gl(k); } else { if (w) w.close(); alert('リンクを読み込めませんでした。ログインし直してください。'); } });
}, true);
