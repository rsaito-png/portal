// 人事労務の相談所。相談した本人と総務奉行（宮本さん）だけが見られる（supabase/hr_soudan.sql の RLS）
const hsE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hsT = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function renderSoudan() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>人事労務の相談所</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  let boss = false; try { boss = await lbRpc('is_soumu_bugyo'); } catch (e) {}
  let rows = []; try { rows = await sb('hr_soudan?select=*&order=created_at.desc'); } catch (e) {}
  const card = r => `<div class="card" style="margin:8px 0;padding:10px;border:1px solid #ddd;border-radius:8px">
    <div style="font-size:12px;color:#666">${hsT(r.created_at)}${boss ? '　' + hsE(r.name) : ''}${r.topic ? '　【' + hsE(r.topic) + '】' : ''}${r.reply ? '' : '　<b style="color:#c00">未回答</b>'}</div>
    <div style="white-space:pre-wrap;margin:6px 0">${hsE(r.body)}</div>
    ${r.reply ? `<div style="white-space:pre-wrap;background:#f3f7ff;padding:8px;border-radius:6px">💬 総務奉行より（${hsT(r.replied_at)}）<br>${hsE(r.reply)}</div>` : ''}
    ${boss ? `<textarea id="hs_r${r.id}" rows="3" style="width:100%" placeholder="答えを書く">${hsE(r.reply || '')}</textarea><button onclick="hsReply(${r.id})">答えを送る</button>` : ''}</div>`;
  const form = `<div style="margin:10px 0"><select id="hs_t"><option value="">（分類なし）</option>${['休み・勤務時間', '給料・手当', '社会保険・税金', '働き方・仕事内容', '人間関係', '体調・家庭の事情', 'その他'].map(t => `<option>${t}</option>`).join('')}</select>
    <input id="hs_n" placeholder="名前" style="margin:6px 0;width:100%">
    <textarea id="hs_b" rows="5" style="width:100%" placeholder="相談したいことを書いてください"></textarea><button onclick="hsSend()">相談を送る</button></div>`;
  const open = rows.filter(r => !r.reply).length;
  $('view').innerHTML = back + `<h3>人事労務の相談所</h3><p style="font-size:13px">休み、給料、働き方、人間関係などの相談を受け付けます。読むのは総務奉行（宮本さん）だけで、会長やほかの職員には見えません。</p>`
    + (boss ? `<h4>届いた相談${open ? `（未回答 ${open}件）` : ''}</h4>${rows.map(card).join('') || '<p>まだありません。</p>'}<details><summary>自分も相談を書く</summary>${form}</details>`
      : form + `<h4>自分の相談</h4>${rows.map(card).join('') || '<p>まだありません。</p>'}`);
  const n = document.getElementById('hs_n'); if (n) n.value = s.email || '';
}
async function hsSend() {
  const b = $('hs_b').value.trim(); if (!b) return alert('相談の中身を書いてください');
  try { await sb('hr_soudan', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: b, topic: $('hs_t').value || null, name: $('hs_n').value.trim() || null }) }); alert('送りました。答えはこの画面に出ます。'); renderSoudan(); } catch (e) { alert('送れませんでした: ' + e.message); }
}
async function hsReply(id) {
  const t = $('hs_r' + id).value.trim(); if (!t) return;
  try { await sb('hr_soudan?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reply: t, replied_at: new Date().toISOString() }) }); renderSoudan(); } catch (e) { alert('送れませんでした: ' + e.message); }
}
