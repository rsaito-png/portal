// SNS投稿素材：職員が写真とひとことメモを入稿（supabase/sns_material.sql）。写真は非公開バケット sns-material。
// 入稿の瞬間に pg_net で X自動投稿ボットへ webhook（private_config.sns_material_webhook_url）。
const snE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snMe = () => { const s = JSON.parse(localStorage.getItem('sess') || '{}'); try { return JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return ''; } };
const snH = () => { const s = JSON.parse(localStorage.getItem('sess') || '{}'); return { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token }; };
async function renderSns() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>📸 SNS投稿素材</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  const me = snMe();
  let offs = [], rows = [];
  try { offs = await sb('sns_office?select=name&active=eq.true&order=sort'); } catch (e) { }
  try { rows = await sb('sns_material?select=*&user_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc&limit=50'); } catch (e) { }
  const td = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const inp = 'display:block;width:100%;box-sizing:border-box;font-size:16px;margin:6px 0';
  $('view').innerHTML = back + `<h3>📸 SNS投稿素材</h3>
    <p style="font-size:13px">法人のSNS（Instagram・Googleマップ）に使う写真とひとことを送ってください。会長の確認のあとで投稿します。（茶夢はInstagramのみ）<br>例）茶夢：利用者さんの絵、クッキングの様子　／　レオ：活動の写真（Googleマップ用）</p>
    <p style="font-size:13px;color:#b00">⚠️ 児童・利用者さんの顔や名前（名札・作品の署名など）が写らないようにしてください。</p>
    <div class="card">
      <label>事業所<select id="sn_o" style="${inp}">${offs.map(o => `<option>${snE(o.name)}</option>`).join('')}</select></label>
      <label>用途<select id="sn_p" style="${inp}"><option>Instagram</option><option>Googleマップ</option></select></label>
      <label>写真（複数可・カメラからも選べます）<input id="sn_f" type="file" accept="image/*" multiple style="${inp}"></label>
      <label>ひとことメモ<textarea id="sn_m" rows="3" maxlength="1000" style="${inp};resize:vertical" placeholder="例）みんなでクッキーを焼きました"></textarea></label>
      <label>撮影日<input id="sn_d" type="date" value="${td}" style="${inp}"></label>
      <button id="sn_go" onclick="snSend()" style="width:100%;font-size:16px;padding:10px">送る</button></div>
    <h4>自分が送った分</h4><div id="sn_list">${rows.map(r => `<div class="card" style="margin:8px 0;padding:10px"><div style="font-size:12px;color:#666">${snE(r.shot_on || '')}　${snE(r.office)}／${snE(r.purpose)}　📷${(r.photos || []).length}枚　<b>${snE(r.status)}</b></div><div style="white-space:pre-wrap">${snE(r.memo || '')}</div><div id="sn_th${r.id}"></div></div>`).join('') || '<p>まだありません。</p>'}</div>`;
  rows.forEach(r => snThumbs(r));
  if ($('sn_p') && $('sn_o')) { const snSync = () => { const o = $('sn_o').value, g = $('sn_p').querySelector('option[value="Googleマップ"],option:nth-child(2)'); const cha = o === '茶夢'; if (g) { g.disabled = cha; g.hidden = cha; } if (cha && $('sn_p').value === 'Googleマップ') $('sn_p').value = 'Instagram'; else if (o === 'レオ') $('sn_p').value = 'Googleマップ'; }; $('sn_o').onchange = snSync; snSync(); }
}
async function snThumbs(r) {
  const el = document.getElementById('sn_th' + r.id); if (!el || !(r.photos || []).length) return;
  try {
    const x = await fetch(C.supabaseUrl + '/storage/v1/object/sign/sns-material', { method: 'POST', headers: { ...snH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600, paths: r.photos }) });
    const j = await x.json();
    el.innerHTML = j.filter(a => a.signedURL).map(a => `<img src="${C.supabaseUrl}/storage/v1${a.signedURL}" style="width:72px;height:72px;object-fit:cover;margin:4px 4px 0 0;border-radius:4px" loading="lazy">`).join('');
  } catch (e) { }
}
async function snSend() {
  const fs = [...$('sn_f').files]; if (!fs.length) return alert('写真を選んでください');
  const btn = $('sn_go'); btn.disabled = true; btn.textContent = '送っています…';
  try {
    const me = snMe(), paths = [];
    for (const f of fs) {
      const ext = (f.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'jpg';
      const p = `${me}/${crypto.randomUUID()}.${ext}`;
      const r = await fetch(C.supabaseUrl + '/storage/v1/object/sns-material/' + p, { method: 'POST', headers: { ...snH(), 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'false' }, body: f });
      if (!r.ok) throw new Error('写真を保存できませんでした（' + r.status + '）');
      paths.push(p);
    }
    await sb('sns_material', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ office: $('sn_o').value, purpose: $('sn_p').value, photos: paths, memo: $('sn_m').value.trim() || null, shot_on: $('sn_d').value || null }) });
    alert('送りました。ありがとうございます'); renderSns();
  } catch (e) { alert('送れませんでした: ' + e.message); btn.disabled = false; btn.textContent = '送る'; }
}
