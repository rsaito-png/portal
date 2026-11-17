// 職員側：「書類の控え」リンク（docs.html?t=…、閲覧専用・期限なし・何度でも使える）を出す・コピー・再発行する。
// 使う画面：レオ #leo/contract、金斗雲 #kintoun/contract（署名リンク発行の横）。発行できる人は署名リンクと同じ（＋会長）。送信はしない（公式LINEで送る）。
const DV = { leo: null, kin: null };
const DV_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'docs.html?t=' + t;
const dvK = s => String(s || '').replace(/[\s\u3000]/g, '');
async function dvList(office) {
  const k = office === 'レオ' ? 'leo' : 'kin';
  try { const rows = await sb('rpc/doc_view_list', { method: 'POST', body: JSON.stringify({ p_office: office }) }); DV[k] = {}; (rows || []).forEach(r => { DV[k][office === 'レオ' ? dvK(r.child) : String(r.user_id)] = r; }); }
  catch (e) { DV[k] = null; }
  return DV[k];
}
const dvEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dvQ = s => dvEsc(String(s ?? '').replace(/['"\\]/g, '')); // onclick の引数用（引用符は落とす）
// 表のセルに入れるボタン（office: 'レオ'＝key は児童名、'金斗雲'＝key は利用者id）
function dvCell(office, key, name) {
  const k = office === 'レオ' ? 'leo' : 'kin', m = DV[k]; if (!m) return '';
  const r = m[office === 'レオ' ? dvK(key) : String(key)], a = `'${office}','${dvQ(key)}','${dvQ(name)}'`;
  return `<div class="dvc" style="margin-top:6px">${r ? `<button class="back" onclick="dvShow(${a},false)">📎 控えリンク</button>` : `<button class="back" onclick="dvShow(${a},false)">📎 控えリンクを作る</button>`}</div>`;
}
async function dvCopy(t) { try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch (e) { }
  try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
async function dvShow(office, key, name, renew) {
  const ev = window.event, btn = ev && ev.currentTarget && ev.currentTarget.tagName === 'BUTTON' ? ev.currentTarget : null;
  if (renew && !confirm(`${name} さんの控えリンクを作り直します。\n今までのリンクは使えなくなります（送ったリンクも開けなくなります）。よろしいですか？`)) return;
  if (btn) btn.disabled = true;
  try {
    const body = office === 'レオ' ? { p_office: office, p_child: key, p_new: !!renew } : { p_office: office, p_user_id: Number(key), p_new: !!renew };
    const t = await sb('rpc/doc_view_issue', { method: 'POST', body: JSON.stringify(body) }), u = DV_URL(t), ok = await dvCopy(u);
    await dvList(office);
    if (btn && btn.closest('.dvc') && !renew) btn.textContent = '📎 控えリンク';
    const host = (btn && btn.closest('.dvc')) || document.body; let box = host.querySelector('.dvbox'); if (!box) { box = document.createElement('div'); box.className = 'dvbox'; host.appendChild(box); }
    box.innerHTML = `<div style="border:2px solid ${office === 'レオ' ? '#e8833a' : '#2e6b4f'};border-radius:8px;padding:8px;margin:6px 0;background:#fff;max-width:420px">
      <b>${dvEsc(name)} さんの書類の控えリンク</b>（見るだけ・期限なし）
      <p style="margin:4px 0;${ok ? 'color:#1a6b1a;font-weight:bold' : 'color:#b00'}">${renew ? '作り直しました。' : ''}${ok ? 'コピーしました。公式LINEの1対1トークに貼って送ってください。' : '自動でコピーできませんでした。下のリンクを選んでコピーしてください。'}</p>
      <input readonly value="${dvEsc(u)}" onclick="this.select()" style="width:100%;box-sizing:border-box">
      <p style="margin:6px 0 0"><button class="back" onclick="dvCopy(this.closest('.dvbox').querySelector('input').value).then(o=>this.textContent=o?'コピーしました ✔':'コピーできません')">もう一度コピー</button>
      <a href="${dvEsc(u)}" target="_blank" rel="noopener"><button class="back">開いて確かめる</button></a>
      <button class="back" onclick="dvShow('${office}','${dvQ(key)}','${dvQ(name)}',true)">作り直す（古いリンクは無効）</button>
      <button class="back" onclick="this.closest('.dvbox').remove()">閉じる</button></p>
      <p class="note" style="margin:4px 0 0">署名・同意が済んだ契約書・重要事項説明書・${office === 'レオ' ? '個別支援計画（本案）' : '居宅介護計画'}を、ご${office === 'レオ' ? '家庭' : '本人'}がいつでも見られます。ほかの方の書類は出ません。リンクを間違えて送ったときは「作り直す」を押してください。</p></div>`;
  } catch (e) { alert(e.message); }
  finally { if (btn) btn.disabled = false; }
}
if (typeof window !== 'undefined') { window.dvList = dvList; window.dvCell = dvCell; window.dvShow = dvShow; window.dvCopy = dvCopy; }
