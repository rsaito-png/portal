// 給与口座・マイナンバー（#me：本人入力／#me/list：事務・会長の閲覧のみ）
// 個人番号は画面では下4桁以外伏せ、詳細（事務・会長）のみ全桁。console やログに番号を出さない。
(function (g) {
  const ME_TYPES = ['普通', '当座'];
  const ME = { bank: null, mine: null, ack: false, name: '', office: '' };
  const meEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const meCanList = () => (typeof ROLE !== 'undefined' && ROLE === '事務') || (typeof IS_CHAIR !== 'undefined' && IS_CHAIR);
  const meBack = () => `<button class="back" type="button" onclick="location.hash=''">← トップへ</button>`;
  const meDt = s => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  function meUid() {
    try {
      const s = JSON.parse(localStorage.getItem('sess') || 'null');
      if (!s || !s.token) return '';
      const payload = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub || '';
    } catch (e) { return ''; }
  }
  function meMask(n) {
    const d = String(n || '').replace(/\D/g, '');
    if (!d) return '—';
    if (d.length <= 4) return d;
    return '•'.repeat(d.length - 4) + d.slice(-4);
  }
  function meToKana(s) {
    const hw = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
    const fw = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
    let t = String(s || '');
    t = t.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    t = t.replace(/[\uff66-\uff9d]/g, ch => fw[hw.indexOf(ch)] || ch);
    const daku = { カ:'ガ',キ:'ギ',ク:'グ',ケ:'ゲ',コ:'ゴ',サ:'ザ',シ:'ジ',ス:'ズ',セ:'ゼ',ソ:'ゾ',タ:'ダ',チ:'ヂ',ツ:'ヅ',テ:'デ',ト:'ド',ハ:'バ',ヒ:'ビ',フ:'ブ',ヘ:'ベ',ホ:'ボ',ウ:'ヴ' };
    const hand = { ハ:'パ',ヒ:'ピ',フ:'プ',ヘ:'ペ',ホ:'ポ' };
    t = t.replace(/(.)[゛ﾞ]/g, (m, a) => daku[a] || m).replace(/(.)[゜ﾟ]/g, (m, a) => hand[a] || m);
    return t.trim();
  }
  function meNumberValid(p) {
    const s = String(p || '').replace(/\D/g, '');
    if (!/^\d{12}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += (+s[i]) * (i < 6 ? i + 2 : i - 4);
    const r = sum % 11, cd = r <= 1 ? 0 : 11 - r;
    return cd === +s[11];
  }
  function meVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function meOn(id) { const el = document.getElementById(id); return !!(el && (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)); }
  function meInp(id, label, v, extra) {
    return `<label class="note">${label}</label><input id="${id}" value="${meEsc(v || '')}" ${extra || ''}>`;
  }
  function meFormHtml() {
    const bank = ME.bank || {};
    const typ = ME_TYPES.map(t => `<option value="${t}" ${bank.account_type===t?'selected':''}>${t}</option>`).join('');
    const mnSaved = ME.mine ? meMask(ME.mine) : '';
    const admin = meCanList() ? `<p class="note noprint"><a href="#me/list">職員の登録状況一覧（閲覧のみ）</a></p>` : '';
    return `${admin}
      <h3>給与口座・マイナンバー</h3>
      <p class="note">年末調整の申告はフリーウェイから案内します。</p>
      <p class="note">給与の振込口座と、本人の個人番号を届け出てください。個人番号は保存後、本人にも下4桁以外は表示しません。</p>

      <h4>給与振込口座</h4>
      <div class="card">
        ${meInp('bk_bank', '銀行名', bank.bank_name, 'placeholder="例：三重銀行"')}
        ${meInp('bk_branch', '支店名', bank.branch_name, 'placeholder="例：四日市支店"')}
        <label class="note">口座種別</label><select id="bk_type" style="width:100%;padding:10px">${typ}</select>
        ${meInp('bk_num', '口座番号（数字のみ）', bank.account_number, 'inputmode="numeric" autocomplete="off" placeholder="例：1234567"')}
        ${meInp('bk_kana', '口座名義（カタカナ）', bank.account_holder_kana, 'placeholder="例：サイトウ　レン"')}
        ${bank.updated_at ? `<p class="note">口座の最終更新：${meEsc(meDt(bank.updated_at))}（Asia/Tokyo）</p>` : ''}
      </div>

      <h4>本人の個人番号（マイナンバー）</h4>
      <div class="card">
        <p>利用目的：源泉徴収票・給与支払報告書等の税務手続き、社会保険・雇用保険の届出のために使用します。番号確認書類（カードの写し）の画像は、今回は不要です。</p>
        ${mnSaved ? `<p>登録済みの番号：<b>${meEsc(mnSaved)}</b>（下4桁以外は伏せています）</p>` : ''}
        <label class="note">個人番号（12桁）${mnSaved ? '　※変更するときだけ新しい番号を入れる' : ''}</label>
        <input id="mn_num" inputmode="numeric" autocomplete="off" placeholder="${mnSaved ? '変更するときだけ新しい12桁を入れる' : '数字12桁'}">
        <label class="note"><input type="checkbox" id="mn_ack" style="width:auto" ${ME.mine || ME.ack ? 'checked' : ''}> 上記の利用目的を確認し、個人番号の提出に同意します</label>
      </div>

      <p>
        <button type="button" onclick="meSave()">保存する</button>
      </p>
      <div id="me_msg" style="color:#c00"></div>`;
  }
  function mePaint() {
    const back = meBack();
    const el = $('view');
    if (!el) return;
    el.innerHTML = back + meFormHtml();
  }
  function meMsg(t, ok) {
    const el = document.getElementById('me_msg');
    if (el) { el.style.color = ok ? '#2e6b4f' : '#c00'; el.textContent = t; }
  }
  function meReadMn(id) {
    const v = meVal(id).replace(/\D/g, '');
    if (!v) return { skip: true };
    if (!meNumberValid(v)) return { error: '個人番号の12桁が正しくありません（チェックディジットを含む）' };
    return { value: v };
  }
  async function meLoad() {
    ME.bank = null; ME.mine = null; ME.ack = false;
    if (typeof DEMO !== 'undefined' && DEMO) {
      ME.name = '見本 花子'; ME.office = 'レオ';
      ME.bank = { bank_name: '三重銀行', branch_name: '四日市', account_type: '普通', account_number: '1234567', account_holder_kana: 'ミホン　ハナコ' };
      ME.mine = '123456789016';
      ME.ack = true;
      return;
    }
    const uid = meUid();
    const prof = await sb(`staff_profiles?user_id=eq.${encodeURIComponent(uid)}&select=full_name,nikki_name,office`).catch(() => []);
    ME.name = (prof[0] && (prof[0].full_name || prof[0].nikki_name)) || '';
    ME.office = (prof[0] && prof[0].office) || '';
    const banks = await sb(`staff_bank_accounts?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => []);
    ME.bank = banks[0] || null;
    const mns = await sb(`staff_my_numbers?user_id=eq.${encodeURIComponent(uid)}&select=my_number,purpose_ack,updated_at`).catch(() => []);
    ME.mine = mns[0] && mns[0].my_number ? mns[0].my_number : null;
    ME.ack = !!(mns[0] && mns[0].purpose_ack);
  }
  async function meUpsert(table, conflict, body) {
    return sb(table + '?on_conflict=' + conflict, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  }
  async function meSave() {
    try {
      if (typeof DEMO !== 'undefined' && DEMO) { meMsg('見本モードなので保存しません', true); return; }
      const uid = meUid();
      if (!uid) { meMsg('ログインし直してください。'); return; }
      const bankName = meVal('bk_bank'), branch = meVal('bk_branch'), num = meVal('bk_num').replace(/\D/g, ''), kana = meToKana(meVal('bk_kana'));
      if (bankName || branch || num || kana) {
        if (!bankName || !branch || !num || !kana) { meMsg('口座は、銀行名・支店名・口座番号・名義（カタカナ）をそろえてください。'); return; }
        if (!/^[0-9]{4,16}$/.test(num)) { meMsg('口座番号は4〜16桁の数字で入れてください。'); return; }
        if (!/^[ァ-ヶー・　 ]+$/.test(kana)) { meMsg('口座名義はカタカナで入れてください。'); return; }
        await meUpsert('staff_bank_accounts', 'user_id', { user_id: uid, bank_name: bankName, branch_name: branch, account_type: meVal('bk_type') || '普通', account_number: num, account_holder_kana: kana });
      }
      const mn = meReadMn('mn_num');
      if (mn.error) { meMsg(mn.error); return; }
      if (mn.value) {
        if (!meOn('mn_ack')) { meMsg('個人番号の利用目的を確認し、同意にチェックしてください。'); return; }
        await meUpsert('staff_my_numbers', 'user_id', { user_id: uid, my_number: mn.value, purpose_ack: true });
        ME.mine = mn.value;
        ME.ack = true;
      }
      if (!bankName && !branch && !num && !kana && !mn.value && !ME.bank && !ME.mine) {
        meMsg('口座か個人番号を入れてから保存してください。');
        return;
      }
      const bk = await sb(`staff_bank_accounts?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => []);
      ME.bank = bk[0] || ME.bank;
      mePaint();
      meMsg('保存しました。', true);
    } catch (e) {
      meMsg((e && e.message) || '保存できませんでした。');
    }
  }
  async function renderMe() {
    const back = meBack();
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try {
      await meLoad();
      mePaint();
    } catch (e) {
      $('view').innerHTML = back + '<h3>給与口座・マイナンバー</h3><p>' + meEsc(e.message) + '</p>';
    }
  }
  function meNameOf(p) { return (p && (p.full_name || p.nikki_name)) || '（氏名未登録）'; }
  async function renderMeList() {
    const back = meBack();
    if (!meCanList() && !(typeof DEMO !== 'undefined' && DEMO && ROLE === '事務')) {
      $('view').innerHTML = back + '<h3>給与口座・マイナンバー（一覧）</h3><p>事務と会長だけが見られます。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try {
      if (typeof DEMO !== 'undefined' && DEMO) {
        $('view').innerHTML = back + `<h3>給与口座・マイナンバー（一覧）</h3><p class="note">見本モードです。</p>
          <p><a href="#me">自分の届出画面</a></p>
          <div class="sheet-scroll"><table class="tbl"><tr><th>氏名</th><th>所属</th><th>口座</th><th>個人番号</th><th></th></tr>
          <tr><td>見本 花子</td><td>レオ</td><td>三重銀行　••••567</td><td>登録済 ${meEsc(meMask('123456789016'))}</td><td><button type="button" class="back" onclick="location.hash='#me/list/demo-2'">詳細</button></td></tr>
          </table></div>`;
        return;
      }
      const [profs, banks, mns] = await Promise.all([
        sb('staff_profiles?select=user_id,full_name,nikki_name,office,active&order=office,full_name'),
        sb('staff_bank_accounts?select=user_id,bank_name,branch_name,account_type,account_number'),
        sb('staff_my_numbers?select=user_id,my_number')
      ]);
      const bmap = Object.fromEntries((banks||[]).map(r => [r.user_id, r]));
      const mmap = Object.fromEntries((mns||[]).map(r => [r.user_id, r]));
      const rows = (profs||[]).filter(p => p.active !== false).map(p => {
        const b = bmap[p.user_id], m = mmap[p.user_id];
        const bank = b ? `${meEsc(b.bank_name)}　${meEsc(meMask(b.account_number))}` : '未登録';
        const mn = m ? ('登録済 ' + meEsc(meMask(m.my_number))) : '未登録';
        return `<tr><td>${meEsc(meNameOf(p))}</td><td>${meEsc(p.office || '')}</td><td>${bank}</td><td>${mn}</td>
          <td><button type="button" class="back" onclick="location.hash='#me/list/${meEsc(p.user_id)}'">詳細</button></td></tr>`;
      }).join('');
      $('view').innerHTML = back + `<h3>給与口座・マイナンバー（一覧）</h3>
        <p class="note">閲覧のみです。口座番号と個人番号は下4桁以外を伏せています。全文は詳細で確認できます。</p>
        <p><a href="#me">自分の届出画面</a></p>
        <div class="sheet-scroll"><table class="tbl"><tr><th>氏名</th><th>所属</th><th>口座</th><th>個人番号</th><th></th></tr>
        ${rows || '<tr><td colspan="5">職員がいません。</td></tr>'}</table></div>
        <p class="note">${(profs||[]).filter(p => p.active !== false).length} 名</p>`;
    } catch (e) {
      $('view').innerHTML = back + '<h3>給与口座・マイナンバー（一覧）</h3><p>' + meEsc(e.message) + '</p>';
    }
  }
  function meKV(label, v) { return `<p><span class="note">${label}</span><br>${meEsc(v == null || v === '' ? '—' : v)}</p>`; }
  async function renderMeDetail(uid) {
    const back = `<button class="back" type="button" onclick="location.hash='#me/list'">← 一覧へ</button>`;
    if (!meCanList() && !(typeof DEMO !== 'undefined' && DEMO && ROLE === '事務')) {
      $('view').innerHTML = back + '<p>事務と会長だけが見られます。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try {
      if (typeof DEMO !== 'undefined' && DEMO) {
        $('view').innerHTML = back + '<h3>見本 花子（レオ）</h3><p class="note">見本です。</p>' + meKV('個人番号（全桁）', '123456789016') + meKV('口座番号（全桁）', '1234567');
        return;
      }
      const [profs, banks, mns] = await Promise.all([
        sb(`staff_profiles?user_id=eq.${encodeURIComponent(uid)}&select=user_id,full_name,nikki_name,office`),
        sb(`staff_bank_accounts?user_id=eq.${encodeURIComponent(uid)}&select=*`),
        sb(`staff_my_numbers?user_id=eq.${encodeURIComponent(uid)}&select=my_number,purpose_ack,updated_at`)
      ]);
      const p = (profs || [])[0] || {};
      const b = (banks || [])[0];
      const m = (mns || [])[0];
      $('view').innerHTML = back + `<h3>${meEsc(meNameOf(p))}（${meEsc(p.office || '')}）の給与口座・マイナンバー</h3>
        <p class="note">閲覧のみです。個人番号と口座番号は全桁を表示しています。印刷するときは取り扱いに注意してください。</p>
        <h4>給与振込口座</h4>
        <div class="card">${b ? meKV('銀行名', b.bank_name) + meKV('支店名', b.branch_name) + meKV('口座種別', b.account_type) + meKV('口座番号（全桁）', b.account_number) + meKV('口座名義', b.account_holder_kana) + (b.updated_at ? meKV('最終更新（Asia/Tokyo）', meDt(b.updated_at)) : '') : '<p>未登録</p>'}</div>
        <h4>本人の個人番号</h4>
        <div class="card">${m ? meKV('個人番号（全桁）', m.my_number) + meKV('利用目的の同意', m.purpose_ack ? 'あり' : 'なし') + (m.updated_at ? meKV('最終更新（Asia/Tokyo）', meDt(m.updated_at)) : '') : '<p>未登録</p>'}</div>
        <p class="noprint"><button type="button" class="back" onclick="window.print()">印刷／PDFにする</button></p>`;
    } catch (e) {
      $('view').innerHTML = back + '<p>' + meEsc(e.message) + '</p>';
    }
  }
  g.renderMe = renderMe;
  g.renderMeList = renderMeList;
  g.renderMeDetail = renderMeDetail;
  g.meSave = meSave;
  g.meMaskNumber = meMask;
  g.meNumberValid = meNumberValid;
  g.meToKana = meToKana;
})(typeof window !== 'undefined' ? window : globalThis);
