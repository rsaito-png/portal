// ウェブサイトの問い合わせ。会長ページの中だけ。見えるかどうかはサーバーの site_contact_is_owner。
async function contactRpc(name, body) {
  if (typeof DEMO !== 'undefined' && DEMO) return { ok: false, status: 0, data: null };
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (!s.token || typeof C === 'undefined') return { ok: false, status: 401, data: null };
  const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data };
}

function contactSafeId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '')) ? String(id) : '';
}

async function contactBadge() {
  try {
    const tile = document.getElementById('chair_tile');
    if (!tile) return;
    const who = await contactRpc('site_contact_is_owner');
    const old = tile.querySelector('.contact-badge');
    if (old) old.remove();
    if (!who.ok || who.data !== true) return;
    const n = await contactRpc('site_contact_unread_count');
    const raw = n.ok ? Number(n.data) : 0;
    const count = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    if (count > 0) tile.insertAdjacentHTML('afterbegin', `<span class="badge contact-badge">新着 ${count}</span>`);
  } catch (e) { }
}

function contactCard(row, sales) {
  const id = contactSafeId(row.id);
  const when = esc(String(row.created_at || '').replace('T', ' ').slice(0, 16));
  const review = row.review === 'needs-review' ? '要確認' : row.review === 'restored' ? '営業から戻した' : '';
  const read = row.read_at ? '既読' : '未読';
  return `<article class="card" style="padding:12px">
    <div style="font-size:13px;color:#666">${when}　${esc(read)}${review ? '　' + esc(review) : ''}</div>
    <p style="margin:6px 0"><b>${esc(row.name || '')}</b>　${esc(row.email || '')}<br>${esc(row.service || '')}</p>
    <p style="white-space:pre-wrap;margin:0">${esc(row.body || '')}</p>
    ${row.sales_reason ? `<p class="note" style="margin:8px 0 0">${esc(row.sales_reason)}</p>` : ''}
    <p style="margin:8px 0 0">${!row.read_at && id ? `<button type="button" class="back" onclick="contactMarkRead('${id}')">既読にする</button> ` : ''}
    ${sales && id ? `<button type="button" onclick="contactRestore('${id}')">通常の受信に戻す</button>` : ''}</p>
  </article>`;
}

async function contactInboxMount() {
  const el = document.getElementById('contact_inbox');
  if (!el) return;
  try {
    const who = await contactRpc('site_contact_is_owner');
    if (!who.ok || who.data !== true) { el.innerHTML = ''; return; }
    const [normal, sales] = await Promise.all([
      contactRpc('site_contact_inbox', { p_lane: 'normal' }),
      contactRpc('site_contact_inbox', { p_lane: 'sales' }),
    ]);
    if (!normal.ok) { el.innerHTML = '<p>問い合わせを表示できません。</p>'; return; }
    const rows = Array.isArray(normal.data) ? normal.data : [];
    const held = sales.ok && Array.isArray(sales.data) ? sales.data : [];
    const unread = rows.filter((item) => !item.read_at).length;
    const heldHtml = sales.ok
      ? (held.length ? held.map((item) => contactCard(item, true)).join('') : '<p class="note">隔離中の営業はありません。</p>')
      : '<p>営業の隔離を表示できません。</p>';
    el.innerHTML = `<h3 class="nx" id="contact_inbox_h">ウェブサイトからの問い合わせ${unread ? '（未読 ' + unread + '）' : ''}</h3>
    <p class="note">営業と判断したものは下の隔離に分けてあり、上の未読とトップの印には入りません。戻すとその場で通常の受信に戻ります。</p>
    ${rows.length ? rows.map((item) => contactCard(item, false)).join('') : '<p class="note">まだありません。</p>'}
    <h3 class="nx">営業の隔離 ${held.length ? '（' + held.length + '件）' : ''}</h3>
    ${heldHtml}`;
    if (String(location.hash || '').indexOf('inquiries') >= 0) {
      const heading = document.getElementById('contact_inbox_h');
      if (heading && heading.scrollIntoView) heading.scrollIntoView();
    }
  } catch (e) {
    el.innerHTML = '<p>問い合わせを表示できません。</p>';
  }
}

async function contactMarkRead(id) {
  if (!contactSafeId(id)) return;
  await contactRpc('site_contact_mark_read', { p_id: id });
  await contactInboxMount();
  await contactBadge();
}

async function contactRestore(id) {
  if (!contactSafeId(id)) return;
  await contactRpc('site_contact_restore', { p_id: id });
  await contactInboxMount();
  await contactBadge();
}
