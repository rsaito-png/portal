// レオ 上限額管理（#leo/jogan）：対象児童の月次・総費用額を入れて、相手事業所へのメール下書きを開く。
// 区分（レオが管理／他所が管理）が違っても、送る文面は同じ＝その月の利用金額（総費用額）。送信はしない。
(function (g) {
  const JOGAN_SIGN = 'レオ　宮本';
  const JOGAN_SIDES = ['レオが管理', '他所が管理'];

  function joganParseYen(raw) {
    if (raw == null) return null;
    const t = String(raw).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/,/g, '').replace(/，/g, '');
    if (t === '') return null;
    if (!/^\d+$/.test(t)) return NaN;
    const n = Number(t);
    if (n > 99999999) return NaN;
    return n;
  }
  function joganYen(n) {
    return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }
  function joganWhen(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    if (!m) return null;
    const y = Number(m[1]), month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const n = y - 2018;
    const era = y >= 2019 ? (n === 1 ? '令和元年' : `令和${n}年`) : `${y}年`;
    return { y, m: month, era };
  }
  function joganSubject(ym) {
    const w = joganWhen(ym);
    if (!w) return '';
    return `レオ　上限額管理　${w.m}月`;
  }
  function joganBody(o) {
    const w = joganWhen(o.ym);
    const partner = String(o.partnerName || '').replace(/[\r\n]/g, '').trim();
    if (!w || !partner || o.totalYen == null || Number.isNaN(Number(o.totalYen))) return '';
    return `${partner}御中\nお世話になっております。\n${w.era}${w.m}月分の利用金額（総費用額）をお送りします。\n総費用額：${joganYen(o.totalYen)}\nどうぞよろしくお願いいたします。\n${JOGAN_SIGN}`;
  }
  function joganEmailOk(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }
  // 下書きできるとき { ok, subject, body, mailto, gmail }。できないときは reason。
  function joganDraft(o) {
    const email = String(o.email || '').trim();
    const total = o.totalYen;
    if (!joganEmailOk(email)) return { ok: false, reason: 'no-email' };
    if (total == null || total === '') return { ok: false, reason: 'no-amount' };
    if (Number.isNaN(Number(total))) return { ok: false, reason: 'bad-amount' };
    const subject = joganSubject(o.ym);
    const body = joganBody({ partnerName: o.partnerName, ym: o.ym, totalYen: total });
    if (!subject || !body) return { ok: false, reason: 'bad-amount' };
    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const q = new URLSearchParams({ view: 'cm', fs: '1', to: email, su: subject, body });
    return { ok: true, subject, body, mailto, gmail: 'https://mail.google.com/mail/?' + q.toString() };
  }

  const api = { JOGAN_SIGN, JOGAN_SIDES, joganParseYen, joganYen, joganWhen, joganSubject, joganBody, joganEmailOk, joganDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
  if (typeof LEO_VIEWS === 'undefined') return;

  let JG_MONTH = '';
  let JG_ROWS = [];
  const JG_DEMO_AMT = {};
  let JG_DEMO_SEEDED = false;
  const JG_DEMO_CHILDREN = [
    { child: '児童A', side: 'レオが管理', partner_name: '見本学園', partner_email: 'demo-a@example.com' },
    { child: '児童B', side: '他所が管理', partner_name: '見本キッズ', partner_email: 'demo-b@example.com' },
    { child: '児童C', side: 'レオが管理', partner_name: '見本ウィズ', partner_email: '' },
  ];
  function joganEnsureMonth() {
    if (JG_MONTH) return JG_MONTH;
    const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7);
    JG_MONTH = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    return JG_MONTH;
  }
  function joganDraftHtml(row) {
    if (Number.isNaN(row.total_yen) || Number.isNaN(row.burden_yen)) return '<p style="color:#c00">金額は0以上の整数で入れてください。</p>';
    const d = joganDraft({ partnerName: row.partner_name, email: row.partner_email, ym: JG_MONTH, totalYen: row.total_yen });
    if (!d.ok && d.reason === 'no-email') return '<p style="color:#c00;font-weight:bold">送信不可（相手メールが未設定）</p><p class="note">この行は残します。メールが分かり次第、マスタを直してから下書きできます。</p>';
    if (!d.ok) return '<p class="note">総費用額を入れると、メール下書きを開けます。</p>';
    return `<p style="margin:6px 0"><a href="${esc(d.mailto)}">メール下書きを開く</a></p>
      <p style="margin:6px 0"><a href="${esc(d.gmail)}" target="_blank" rel="noopener">Gmailで下書き</a></p>
      <p class="note" style="margin:4px 0">件名：${esc(d.subject)}</p>
      <pre style="white-space:pre-wrap;font-size:15px;background:#f7f7f7;padding:8px;border-radius:8px;margin:6px 0">${esc(d.body)}</pre>`;
  }
  function joganCard(r, i) {
    const mail = r.partner_email ? esc(r.partner_email) : '<span style="color:#c00">メール未確認</span>';
    const tv = r.total_yen == null || Number.isNaN(r.total_yen) ? '' : r.total_yen;
    const bv = r.burden_yen == null || Number.isNaN(r.burden_yen) ? '' : r.burden_yen;
    return `<div class="card" style="margin:10px 0"><b>${esc(r.child)}</b>
      <p class="note" style="margin:4px 0">相手：${esc(r.partner_name)}<br>${mail}</p>
      <label>総費用額（円）<br><input id="jg_t${i}" inputmode="numeric" autocomplete="off" value="${tv}" placeholder="例 12345" oninput="joganOnInput(${i})"></label>
      <label>利用者負担額（任意・メールには書きません）<br><input id="jg_b${i}" inputmode="numeric" autocomplete="off" value="${bv}" oninput="joganOnInput(${i})"></label>
      <div id="jg_d${i}">${joganDraftHtml(r)}</div></div>`;
  }
  function joganRead(i) {
    const total = joganParseYen((document.getElementById('jg_t' + i) || {}).value);
    const burden = joganParseYen((document.getElementById('jg_b' + i) || {}).value);
    return { total_yen: total, burden_yen: burden };
  }
  function joganOnInput(i) {
    const row = JG_ROWS[i]; if (!row) return;
    const v = joganRead(i);
    row.total_yen = v.total_yen; row.burden_yen = v.burden_yen;
    if (typeof DEMO !== 'undefined' && DEMO) JG_DEMO_AMT[JG_MONTH + '\t' + row.child] = { total_yen: v.total_yen, burden_yen: v.burden_yen };
    const el = document.getElementById('jg_d' + i); if (el) el.innerHTML = joganDraftHtml(row);
  }
  async function joganSave() {
    const msg = document.getElementById('jg_msg'); if (!msg) return;
    const rows = JG_ROWS.map((r, i) => ({ ...r, ...joganRead(i) }));
    if (rows.some(r => Number.isNaN(r.total_yen) || Number.isNaN(r.burden_yen))) { msg.style.color = '#c00'; msg.textContent = '金額は0以上の整数で入れてください。'; return; }
    if (rows.some(r => r.total_yen == null && r.burden_yen != null)) { msg.style.color = '#c00'; msg.textContent = '利用者負担額だけの行は保存できません。総費用額を入れてください。'; return; }
    rows.forEach((r, i) => { JG_ROWS[i].total_yen = r.total_yen; JG_ROWS[i].burden_yen = r.burden_yen; });
    if (typeof DEMO !== 'undefined' && DEMO) {
      rows.forEach(r => { JG_DEMO_AMT[JG_MONTH + '\t' + r.child] = { total_yen: r.total_yen, burden_yen: r.burden_yen }; });
      msg.style.color = ''; msg.textContent = '見本モードなので保存しません。下書きリンクは確認できます。';
      return;
    }
    try {
      const upserts = rows.filter(r => r.total_yen != null).map(r => ({ ym: JG_MONTH, child: r.child, total_yen: r.total_yen, burden_yen: r.burden_yen }));
      const clears = rows.filter(r => r.total_yen == null).map(r => r.child);
      if (upserts.length) await sb('leo_jogan_amount?on_conflict=ym,child', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(upserts) });
      for (const c of clears) await sb(`leo_jogan_amount?ym=eq.${JG_MONTH}&child=eq.${encodeURIComponent(c)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      msg.style.color = ''; msg.textContent = '保存しました。';
    } catch (e) { msg.style.color = '#c00'; msg.textContent = e.message; }
  }
  function joganMonth(v) {
    if (!/^\d{4}-\d{2}$/.test(v || '')) return;
    JG_MONTH = v; renderLeoView('jogan');
  }
  function joganShift(delta) {
    const [y, m] = JG_MONTH.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    joganMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  g.joganOnInput = joganOnInput; g.joganSave = joganSave; g.joganMonth = joganMonth; g.joganShift = joganShift;

  LEO_VIEWS.jogan = async function () {
    if (!canManage()) return '<p>この画面は児発管・管理者・事務の方だけが使えます。</p>';
    joganEnsureMonth();
    let missing = '';
    if (typeof DEMO !== 'undefined' && DEMO) {
      if (!JG_DEMO_SEEDED) {
        JG_DEMO_AMT[JG_MONTH + '\t児童A'] = { total_yen: 12345, burden_yen: null };
        JG_DEMO_AMT[JG_MONTH + '\t児童C'] = { total_yen: 8000, burden_yen: null };
        JG_DEMO_SEEDED = true;
      }
      JG_ROWS = JG_DEMO_CHILDREN.map(c => Object.assign({ total_yen: null, burden_yen: null }, c, JG_DEMO_AMT[JG_MONTH + '\t' + c.child] || {}));
    } else {
      try {
        const [masters, amounts] = await Promise.all([
          sb('leo_jogan_master?active=eq.true&order=sort_no,child'),
          sb(`leo_jogan_amount?ym=eq.${JG_MONTH}&select=child,total_yen,burden_yen`)]);
        const byChild = {}; (amounts || []).forEach(a => { byChild[a.child] = a; });
        JG_ROWS = (masters || []).map(m => ({ child: m.child, side: m.side, partner_name: m.partner_name, partner_email: m.partner_email || '', total_yen: byChild[m.child] ? byChild[m.child].total_yen : null, burden_yen: byChild[m.child] ? byChild[m.child].burden_yen : null }));
      } catch (e) {
        missing = `<p style="color:#c00">金額の保存場所がまだありません。管理者が <code>supabase/leo_jogan.sql</code> を Supabase の SQL Editor で実行してください。</p><p class="note">${esc(e.message)}</p>`;
        JG_ROWS = [];
      }
    }
    const [y, m] = JG_MONTH.split('-').map(Number);
    const ready = JG_ROWS.filter(r => joganDraft({ partnerName: r.partner_name, email: r.partner_email, ym: JG_MONTH, totalYen: r.total_yen }).ok).length;
    const noMail = JG_ROWS.filter(r => !joganEmailOk(r.partner_email)).length;
    const block = side => {
      const cards = JG_ROWS.map((r, i) => r.side === side ? joganCard(r, i) : '').join('');
      return cards || '<p class="note">この区分の対象はいません。</p>';
    };
    return `<h3>上限額管理</h3>${demoNote()}
      <p class="note">上限額管理がある児童だけです（無償化・レオのみ・不要は出しません）。区分が違っても、メールの文面は同じです。その月の利用金額（総費用額）を相手事業所へ下書きします。ポータルからは送りません。開いた下書きを、soumu@（宮本）のメールで確認してから送ってください。署名は「${JOGAN_SIGN}」です。</p>
      <p class="ptabs"><button type="button" onclick="joganShift(-1)">← 前の月</button> <b>${y}年${m}月分</b> <button type="button" onclick="joganShift(1)">次の月 →</button></p>
      <p><input type="month" value="${JG_MONTH}" onchange="joganMonth(this.value)" style="width:auto"></p>
      ${missing || (JG_ROWS.length ? `<p>対象 ${JG_ROWS.length}人・下書きできる ${ready}人${noMail ? `・送信不可（メール未設定） ${noMail}人` : ''}</p>` : '<p>有効な対象児童がありません。</p>')}
      <p><button type="button" onclick="joganSave()">この月の金額を保存</button></p>
      <p id="jg_msg" class="note"></p>
      <h4>レオが管理</h4><p class="note">レオが上限額管理事業所です。相手へ利用金額を送ります。</p>${block('レオが管理')}
      <h4>他所が管理</h4><p class="note">相手の事業所が上限額管理事業所です。送る文面は上と同じです。</p>${block('他所が管理')}`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
