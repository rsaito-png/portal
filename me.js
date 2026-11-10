// 入職・年末調整の届出（#me：本人入力／#me/list：事務・会長の閲覧のみ）
// 個人番号は画面では下4桁以外伏せ、詳細（事務・会長）のみ全桁。console やログに番号を出さない。
(function (g) {
  const ME_YEAR0 = 2026;
  const ME_TYPES = ['普通', '当座'];
  const ME_REL = ['夫','妻','父','母','子','兄','弟','姉','妹','祖父','祖母','孫','その他'];
  const ME_CAT = ['特定扶養親族','特定親族','同居老親等','その他'];
  const ME_NR = ['','16歳以上30歳未満又は70歳以上','留学','障害者','38万円以上の支払'];
  const ME_DIS = ['','一般の障害者','特別障害者','同居特別障害者'];
  const ME = { year: ME_YEAR0, d: null, bank: null, mine: null, deps: {}, name: '', office: '', files: [], pending: null, look: null };
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
  function meEmpty() {
    return {
      person: { kana:'', birth:'', postal:'', address:'', household_name:'', household_rel:'', has_spouse:'', otsu:false, disability:'', widow:false, single_parent:false, working_student:false, working_student_note:'', disability_note:'' },
      spouse: { has:false, name:'', kana:'', rel:'', birth:'', address:'', income_est:'', nonresident:false, support_fact:'', dep_id:'spouse' },
      relatives: [],
      under16: [],
      retirees: [],
      disability_family: { notes:'' },
      other_earner: '',
      basic: { salary_income:'', salary_amount:'', other_income:'', total_income:'', class_I:'', basic_deduction:'' },
      spouse_ded: { apply:false, name:'', kana:'', birth:'', address:'', salary_income:'', salary_amount:'', other_income:'', total_income:'', class_II:'', spouse_deduction:'', spouse_special_deduction:'', nonresident:false, support_fact:'', dep_id:'spouse_ded' },
      specified: [],
      income_adj: { self_special:false, spouse_special:false, dep_special:false, dep_under23:false, name:'', kana:'', birth:'', rel:'', address:'', income_est:'', fact:'', as_fuyo:false, dep_id:'adj' },
      insurance: { life_general:[], life_care:[], life_pension:[], life_under23:false, life_under23_names:'', quake:[], social:[], shoukibo:[] },
      housing: { has:false, note:'' },
      prev_job: { has:false, payer:'', payment_amt:'', tax_amt:'', social_amt:'', files:[] }
    };
  }
  function meVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function meOn(id) { const el = document.getElementById(id); return !!(el && (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)); }
  function meInp(id, label, v, extra) {
    return `<label class="note">${label}</label><input id="${id}" value="${meEsc(v || '')}" ${extra || ''}>`;
  }
  function meOpt(list, cur) { return list.map(x => `<option value="${meEsc(x)}" ${String(x)===String(cur||'')?'selected':''}>${meEsc(x || '（なし）')}</option>`).join(''); }
  function meYen(id, label, v) { return meInp(id, label, v, 'inputmode="numeric" placeholder="円（数字）"'); }
  function meRowLife(pre, i, r) {
    r = r || {};
    return `<div class="card" style="margin:8px 0">
      ${meInp(pre+'_co_'+i, '保険会社等の名称', r.company)}
      ${meInp(pre+'_kind_'+i, '保険等の種類', r.kind)}
      ${meInp(pre+'_term_'+i, '保険期間又は年金支払期間', r.term)}
      ${meInp(pre+'_who_'+i, '保険等の契約者の氏名', r.contractor)}
      ${meInp(pre+'_ben_'+i, '保険金等の受取人の氏名', r.beneficiary)}
      ${meInp(pre+'_brel_'+i, '受取人の続柄', r.beneficiary_rel)}
      <label class="note">新・旧の区分</label><select id="${pre}_no_${i}" style="width:100%;padding:10px">${meOpt(['','新','旧'], r.new_old)}</select>
      ${r.start ? meInp(pre+'_start_'+i, '支払開始日', r.start, 'type="date"') : (pre==='pen' ? meInp(pre+'_start_'+i, '支払開始日', r.start, 'type="date"') : '')}
      ${meYen(pre+'_amt_'+i, '本年中に支払った保険料等の金額', r.premium)}
    </div>`;
  }
  function meCollectLife(pre, n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const company = meVal(pre+'_co_'+i); if (!company && !meVal(pre+'_amt_'+i)) continue;
      rows.push({ company, kind: meVal(pre+'_kind_'+i), term: meVal(pre+'_term_'+i), contractor: meVal(pre+'_who_'+i), beneficiary: meVal(pre+'_ben_'+i), beneficiary_rel: meVal(pre+'_brel_'+i), new_old: meVal(pre+'_no_'+i), start: meVal(pre+'_start_'+i), premium: meVal(pre+'_amt_'+i) });
    }
    return rows;
  }
  function meCollectRel(prefix, n, kind) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const name = meVal(prefix+'_name_'+i); if (!name && !meVal(prefix+'_birth_'+i)) continue;
      rows.push({
        id: meVal(prefix+'_id_'+i) || (kind + '_' + (i+1)),
        kind, name, kana: meToKana(meVal(prefix+'_kana_'+i)), rel: meVal(prefix+'_rel_'+i),
        birth: meVal(prefix+'_birth_'+i), address: meVal(prefix+'_addr_'+i), income_est: meVal(prefix+'_inc_'+i),
        category: meVal(prefix+'_cat_'+i), live_together: meOn(prefix+'_live_'+i),
        nonresident: meVal(prefix+'_nr_'+i), support_fact: meVal(prefix+'_sf_'+i),
        change_date: meVal(prefix+'_cd_'+i), change_reason: meVal(prefix+'_cr_'+i),
        disability: meVal(prefix+'_dis_'+i)
      });
    }
    return rows;
  }
  function meRelBlock(title, prefix, rows, kind, showCat) {
    const n = Math.max((rows || []).length, 1);
    let h = `<h4>${title}</h4><p class="note">該当者がいなければ空のままで構いません。</p>`;
    for (let i = 0; i < n; i++) {
      const r = (rows || [])[i] || {};
      const id = r.id || (kind + '_' + (i+1));
      const saved = ME.deps[id];
      h += `<div class="card" style="margin:8px 0">
        <input type="hidden" id="${prefix}_id_${i}" value="${meEsc(id)}">
        ${meInp(prefix+'_name_'+i, '氏名', r.name)}
        ${meInp(prefix+'_kana_'+i, 'フリガナ', r.kana)}
        <label class="note">あなたとの続柄</label><select id="${prefix}_rel_${i}" style="width:100%;padding:10px">${meOpt([''].concat(ME_REL), r.rel)}</select>
        ${meInp(prefix+'_birth_'+i, '生年月日', r.birth, 'type="date"')}
        ${meInp(prefix+'_addr_'+i, '住所又は居所（本人と異なる場合）', r.address)}
        ${meYen(prefix+'_inc_'+i, '令和'+(ME.year-2018)+'年中の所得の見積額', r.income_est)}
        ${showCat ? `<label class="note">区分</label><select id="${prefix}_cat_${i}" style="width:100%;padding:10px">${meOpt([''].concat(ME_CAT), r.category)}</select>` : ''}
        <label class="note"><input type="checkbox" id="${prefix}_live_${i}" style="width:auto" ${r.live_together?'checked':''}> 同居</label>
        <label class="note">非居住者である親族</label><select id="${prefix}_nr_${i}" style="width:100%;padding:10px">${meOpt(ME_NR, r.nonresident)}</select>
        ${meInp(prefix+'_sf_'+i, '生計を一にする事実（送金等の合計額・非居住者の場合）', r.support_fact)}
        ${meInp(prefix+'_cd_'+i, '異動月日', r.change_date, 'type="date"')}
        ${meInp(prefix+'_cr_'+i, '異動の事由', r.change_reason)}
        <label class="note">障害者区分</label><select id="${prefix}_dis_${i}" style="width:100%;padding:10px">${meOpt(ME_DIS, r.disability)}</select>
        <label class="note">個人番号（12桁）${saved ? '　登録済：' + meEsc(meMask(saved)) : ''}</label>
        <input id="${prefix}_mn_${i}" inputmode="numeric" autocomplete="off" placeholder="${saved ? '変更するときだけ新しい12桁を入れる' : '数字12桁'}">
      </div>`;
    }
    h += `<p><button type="button" class="back" onclick="meAddRow('${kind}')">＋ 行を足す</button></p>`;
    return h;
  }
  function meCollect() {
    const d = meEmpty();
    d.person = {
      kana: meToKana(meVal('me_kana')), birth: meVal('me_birth'), postal: meVal('me_postal'), address: meVal('me_addr'),
      household_name: meVal('me_hh'), household_rel: meVal('me_hhrel'), has_spouse: meVal('me_spouse_yn'),
      otsu: meOn('me_otsu'), disability: meVal('me_dis'), widow: meOn('me_widow'), single_parent: meOn('me_single'),
      working_student: meOn('me_student'), working_student_note: meVal('me_student_note'), disability_note: meVal('me_dis_note')
    };
    d.spouse = {
      has: meOn('sp_has') || !!meVal('sp_name'), name: meVal('sp_name'), kana: meToKana(meVal('sp_kana')), rel: meVal('sp_rel'),
      birth: meVal('sp_birth'), address: meVal('sp_addr'), income_est: meVal('sp_inc'), nonresident: meOn('sp_nr'),
      support_fact: meVal('sp_sf'), dep_id: 'spouse'
    };
    d.relatives = meCollectRel('rel', document.querySelectorAll('[id^="rel_id_"]').length, 'gensen16plus');
    d.under16 = meCollectRel('u16', document.querySelectorAll('[id^="u16_id_"]').length, 'under16');
    d.retirees = meCollectRel('ret', document.querySelectorAll('[id^="ret_id_"]').length, 'retiree');
    d.disability_family.notes = meVal('me_fam_dis');
    d.other_earner = meVal('me_other_earner');
    d.basic = { salary_income: meVal('ba_inc'), salary_amount: meVal('ba_amt'), other_income: meVal('ba_oth'), total_income: meVal('ba_tot'), class_I: meVal('ba_cls'), basic_deduction: meVal('ba_ded') };
    d.spouse_ded = {
      apply: meOn('sd_apply') || !!meVal('sd_name'), name: meVal('sd_name'), kana: meToKana(meVal('sd_kana')), birth: meVal('sd_birth'),
      address: meVal('sd_addr'), salary_income: meVal('sd_inc'), salary_amount: meVal('sd_amt'), other_income: meVal('sd_oth'),
      total_income: meVal('sd_tot'), class_II: meVal('sd_cls'), spouse_deduction: meVal('sd_ded'), spouse_special_deduction: meVal('sd_sped'),
      nonresident: meOn('sd_nr'), support_fact: meVal('sd_sf'), dep_id: 'spouse_ded'
    };
    d.specified = meCollectRel('sr', document.querySelectorAll('[id^="sr_id_"]').length, 'specified').map((r, i) => Object.assign(r, { deduction_amt: meVal('sr_ded_'+i) }));
    d.income_adj = {
      self_special: meOn('ia_self'), spouse_special: meOn('ia_sp'), dep_special: meOn('ia_dep'), dep_under23: meOn('ia_u23'),
      name: meVal('ia_name'), kana: meToKana(meVal('ia_kana')), birth: meVal('ia_birth'), rel: meVal('ia_rel'),
      address: meVal('ia_addr'), income_est: meVal('ia_inc'), fact: meVal('ia_fact'), as_fuyo: meOn('ia_asfuyo'), dep_id: 'adj'
    };
    const lg = document.querySelectorAll('[id^="lg_co_"]').length;
    const lc = document.querySelectorAll('[id^="lc_co_"]').length;
    const lp = document.querySelectorAll('[id^="pen_co_"]').length;
    d.insurance.life_general = meCollectLife('lg', lg);
    d.insurance.life_care = meCollectLife('lc', lc);
    d.insurance.life_pension = meCollectLife('pen', lp);
    d.insurance.life_under23 = meOn('ins_u23');
    d.insurance.life_under23_names = meVal('ins_u23n');
    const qn = document.querySelectorAll('[id^="qk_co_"]').length;
    d.insurance.quake = [];
    for (let i = 0; i < qn; i++) {
      if (!meVal('qk_co_'+i) && !meVal('qk_amt_'+i)) continue;
      d.insurance.quake.push({ company: meVal('qk_co_'+i), kind: meVal('qk_kind_'+i), term: meVal('qk_term_'+i), who: meVal('qk_who_'+i), type: meVal('qk_type_'+i), premium: meVal('qk_amt_'+i) });
    }
    const sn = document.querySelectorAll('[id^="soc_kind_"]').length;
    d.insurance.social = [];
    for (let i = 0; i < sn; i++) {
      if (!meVal('soc_kind_'+i) && !meVal('soc_amt_'+i)) continue;
      d.insurance.social.push({ kind: meVal('soc_kind_'+i), payee: meVal('soc_pay_'+i), who: meVal('soc_who_'+i), premium: meVal('soc_amt_'+i) });
    }
    const kn = document.querySelectorAll('[id^="sko_kind_"]').length;
    d.insurance.shoukibo = [];
    for (let i = 0; i < kn; i++) {
      if (!meVal('sko_kind_'+i) && !meVal('sko_amt_'+i)) continue;
      d.insurance.shoukibo.push({ kind: meVal('sko_kind_'+i), premium: meVal('sko_amt_'+i) });
    }
    d.housing = { has: meOn('hs_has'), note: meVal('hs_note') };
    d.prev_job = { has: meOn('pj_has'), payer: meVal('pj_payer'), payment_amt: meVal('pj_pay'), tax_amt: meVal('pj_tax'), social_amt: meVal('pj_soc'), files: (ME.d && ME.d.prev_job && ME.d.prev_job.files) || [] };
    ME.d = d;
    return d;
  }
  function meAddRow(kind) {
    meCollect();
    if (kind === 'gensen16plus') ME.d.relatives.push({ id: 'rel_' + Date.now() });
    else if (kind === 'under16') ME.d.under16.push({ id: 'u16_' + Date.now() });
    else if (kind === 'retiree') ME.d.retirees.push({ id: 'ret_' + Date.now() });
    else if (kind === 'specified') ME.d.specified.push({ id: 'sr_' + Date.now() });
    else if (kind === 'life_general') ME.d.insurance.life_general.push({});
    else if (kind === 'life_care') ME.d.insurance.life_care.push({});
    else if (kind === 'life_pension') ME.d.insurance.life_pension.push({});
    else if (kind === 'quake') ME.d.insurance.quake.push({});
    else if (kind === 'social') ME.d.insurance.social.push({});
    else if (kind === 'shoukibo') ME.d.insurance.shoukibo.push({});
    mePaint();
  }
  function meYearLabel(y) { return '令和' + (Number(y) - 2018) + '年分（' + y + '年）'; }
  function meFormHtml() {
    const d = ME.d || meEmpty();
    const p = d.person || {};
    const emp = (typeof C !== 'undefined' && C.esign && C.esign.employer) ? C.esign.employer : {};
    const bank = ME.bank || {};
    const years = [2026, 2025].map(y => `<option value="${y}" ${y===ME.year?'selected':''}>${meYearLabel(y)}</option>`).join('');
    const typ = ME_TYPES.map(t => `<option value="${t}" ${bank.account_type===t?'selected':''}>${t}</option>`).join('');
    const mnSaved = ME.mine ? meMask(ME.mine) : '';
    const admin = meCanList() ? `<p class="note noprint"><a href="#me/list">職員の提出状況一覧（閲覧のみ）</a></p>` : '';
    const lg = (d.insurance.life_general && d.insurance.life_general.length) ? d.insurance.life_general : [{}];
    const lc = (d.insurance.life_care && d.insurance.life_care.length) ? d.insurance.life_care : [{}];
    const lp = (d.insurance.life_pension && d.insurance.life_pension.length) ? d.insurance.life_pension : [{}];
    const qk = (d.insurance.quake && d.insurance.quake.length) ? d.insurance.quake : [{}];
    const soc = (d.insurance.social && d.insurance.social.length) ? d.insurance.social : [{}];
    const sko = (d.insurance.shoukibo && d.insurance.shoukibo.length) ? d.insurance.shoukibo : [{}];
    const files = ((d.prev_job && d.prev_job.files) || []).map((f, i) => `<li>${meEsc(f.name || '添付')} <button type="button" class="back" onclick="meOpenFile('${meEsc(f.path)}')">見る</button></li>`).join('');
    return `${admin}
      <h3>入職・年末調整の届出</h3>
      <p class="note">振込口座・個人番号と、国税庁の${meYearLabel(ME.year)}の申告書に沿った項目を、この画面で一度に届け出できます。控除額の計算は行いません（記入と提出の受付です）。個人番号は保存後、本人にも下4桁以外は表示しません。</p>
      <p class="note">出典：国税庁「令和8年分 扶養控除等（異動）申告書」「基礎控除申告書兼配偶者控除等申告書兼特定親族特別控除申告書兼所得金額調整控除申告書」「保険料控除申告書」。令和7・8年の改正（基礎控除の引上げ、特定親族特別控除、給与所得控除の最低保障額の引上げ、23歳未満の扶養親族がいる場合の生命保険料控除の特例、扶養親族等の所得要件の改正）を反映しています。令和8年12月の年末調整で使う基礎控除の判定目安は、合計所得489万円以下＝104万円、489万円超655万円以下＝67万円、655万円超2,350万円以下＝62万円、2,350万円超は48・32・16万円です。</p>
      <label class="note">年分</label>
      <select id="me_year" style="width:100%;padding:10px" onchange="meChangeYear(this.value)">${years}</select>

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
        <label class="note"><input type="checkbox" id="mn_ack" style="width:auto" ${ME.mine || (ME.ack) ? 'checked' : ''}> 上記の利用目的を確認し、個人番号の提出に同意します</label>
      </div>

      <h4>給与所得者の扶養控除等（異動）申告書（${meYearLabel(ME.year)}）</h4>
      <div class="card">
        <p class="note">給与の支払者（表示のみ）：${meEsc(emp.name || '')}／${meEsc(emp.address || '')}</p>
        <p>氏名（登録）：<b>${meEsc(ME.name || '（氏名未登録）')}</b>　所属：${meEsc(ME.office || '')}</p>
        ${meInp('me_kana', 'あなたのフリガナ', p.kana)}
        ${meInp('me_birth', 'あなたの生年月日', p.birth, 'type="date"')}
        ${meInp('me_postal', '郵便番号', p.postal, 'inputmode="numeric" placeholder="123-4567"')}
        ${meInp('me_addr', 'あなたの住所又は居所', p.address)}
        ${meInp('me_hh', '世帯主の氏名', p.household_name)}
        ${meInp('me_hhrel', '世帯主のあなたとの続柄', p.household_rel)}
        <label class="note">配偶者の有無</label><select id="me_spouse_yn" style="width:100%;padding:10px">${meOpt(['','有','無'], p.has_spouse)}</select>
        <label class="note"><input type="checkbox" id="me_otsu" style="width:auto" ${p.otsu?'checked':''}> 乙欄：従たる給与についての扶養控除等申告書を、ほかの給与の支払者に提出している（他に主たる給与がある）</label>
        <label class="note">あなた（本人）の障害者区分</label><select id="me_dis" style="width:100%;padding:10px">${meOpt(ME_DIS, p.disability)}</select>
        ${meInp('me_dis_note', '障害者又は勤労学生の内容（手帳の種類・等級・交付年月日、学校名など）', p.disability_note)}
        <label class="note"><input type="checkbox" id="me_widow" style="width:auto" ${p.widow?'checked':''}> 寡婦</label>
        <label class="note"><input type="checkbox" id="me_single" style="width:auto" ${p.single_parent?'checked':''}> ひとり親</label>
        <label class="note"><input type="checkbox" id="me_student" style="width:auto" ${p.working_student?'checked':''}> 勤労学生</label>
        ${meInp('me_student_note', '勤労学生の内容（学校名と入学年月日、所得の種類と見積額）', p.working_student_note)}
        ${meInp('me_fam_dis', '同一生計配偶者・扶養親族の障害者（人数や氏名など、扶養控除等申告書の記載に相当）', d.disability_family && d.disability_family.notes)}
        ${meInp('me_other_earner', '同一生計内に所得者がほかにいる場合（その扶養親族等の氏名など・Ｄ欄）', d.other_earner)}
      </div>
      <h4>源泉控除対象配偶者</h4>
      <div class="card">
        <label class="note"><input type="checkbox" id="sp_has" style="width:auto" ${d.spouse && d.spouse.has?'checked':''}> 源泉控除対象配偶者がいる</label>
        ${meInp('sp_name', '氏名', d.spouse && d.spouse.name)}
        ${meInp('sp_kana', 'フリガナ', d.spouse && d.spouse.kana)}
        <label class="note">続柄</label><select id="sp_rel" style="width:100%;padding:10px">${meOpt([''].concat(ME_REL), d.spouse && d.spouse.rel)}</select>
        ${meInp('sp_birth', '生年月日', d.spouse && d.spouse.birth, 'type="date"')}
        ${meInp('sp_addr', '住所又は居所（本人と異なる場合）', d.spouse && d.spouse.address)}
        ${meYen('sp_inc', '本年中の所得の見積額', d.spouse && d.spouse.income_est)}
        <label class="note"><input type="checkbox" id="sp_nr" style="width:auto" ${d.spouse && d.spouse.nonresident?'checked':''}> 非居住者である配偶者</label>
        ${meInp('sp_sf', '生計を一にする事実（送金等の合計額）', d.spouse && d.spouse.support_fact)}
        <label class="note">個人番号（12桁）${ME.deps.spouse ? '　登録済：' + meEsc(meMask(ME.deps.spouse)) : ''}</label>
        <input id="sp_mn" inputmode="numeric" autocomplete="off" placeholder="${ME.deps.spouse ? '変更するときだけ新しい12桁を入れる' : '数字12桁'}">
      </div>
      ${meRelBlock('源泉控除対象親族（16歳以上・平23.1.1以前生）', 'rel', d.relatives, 'gensen16plus', true)}
      ${meRelBlock('住民税に関する事項：16歳未満の扶養親族', 'u16', d.under16, 'under16', false)}
      ${meRelBlock('住民税に関する事項：退職手当等を有する配偶者・扶養親族・特定親族', 'ret', d.retirees, 'retiree', true)}

      <h4>基礎控除申告書（${meYearLabel(ME.year)}）</h4>
      <div class="card">
        <p class="note">令和8年12月以後の年末調整の判定目安（計算はしません。該当するものを選び、額を書いてください）：489万円以下＝104万円／489万円超655万円以下＝67万円（区分Ⅰ＝Ａ）／655万円超900万円以下＝62万円（Ａ）／900万円超950万円以下＝62万円（Ｂ）／950万円超1,000万円以下＝62万円（Ｃ）／1,000万円超2,350万円以下＝62万円／2,350万円超2,400万円以下＝48万円／2,400万円超2,450万円以下＝32万円／2,450万円超2,500万円以下＝16万円。</p>
        ${meYen('ba_inc', '⑴ 給与所得：収入金額の見積額', d.basic.salary_income)}
        ${meYen('ba_amt', '⑴ 給与所得：所得金額の見積額', d.basic.salary_amount)}
        ${meYen('ba_oth', '⑵ 給与所得以外の所得の合計額', d.basic.other_income)}
        ${meYen('ba_tot', 'あなたの本年中の合計所得金額の見積額（⑴と⑵の合計）', d.basic.total_income)}
        <label class="note">判定・区分Ⅰ（Ａ〜Ｃ。配偶者控除等を書くとき）</label>
        <select id="ba_cls" style="width:100%;padding:10px">${meOpt(['','Ａ','Ｂ','Ｃ'], d.basic.class_I)}</select>
        ${meYen('ba_ded', '基礎控除の額', d.basic.basic_deduction)}
      </div>

      <h4>配偶者控除等申告書</h4>
      <div class="card">
        <label class="note"><input type="checkbox" id="sd_apply" style="width:auto" ${d.spouse_ded && d.spouse_ded.apply?'checked':''}> 配偶者（特別）控除の適用を受ける</label>
        ${meInp('sd_name', '配偶者の氏名', d.spouse_ded && d.spouse_ded.name)}
        ${meInp('sd_kana', 'フリガナ', d.spouse_ded && d.spouse_ded.kana)}
        ${meInp('sd_birth', '配偶者の生年月日', d.spouse_ded && d.spouse_ded.birth, 'type="date"')}
        ${meInp('sd_addr', '住所又は居所（本人と異なる場合）', d.spouse_ded && d.spouse_ded.address)}
        ${meYen('sd_inc', '配偶者の給与所得：収入金額の見積額', d.spouse_ded && d.spouse_ded.salary_income)}
        ${meYen('sd_amt', '配偶者の給与所得：所得金額の見積額', d.spouse_ded && d.spouse_ded.salary_amount)}
        ${meYen('sd_oth', '配偶者の給与所得以外の所得の合計額', d.spouse_ded && d.spouse_ded.other_income)}
        ${meYen('sd_tot', '配偶者の本年中の合計所得金額の見積額', d.spouse_ded && d.spouse_ded.total_income)}
        <label class="note">区分Ⅱ（①老人控除対象配偶者／②62万円以下かつ70歳未満／③62万円超95万円以下／④95万円超133万円以下）</label>
        <select id="sd_cls" style="width:100%;padding:10px">${meOpt(['','①','②','③','④'], d.spouse_ded && d.spouse_ded.class_II)}</select>
        ${meYen('sd_ded', '配偶者控除の額', d.spouse_ded && d.spouse_ded.spouse_deduction)}
        ${meYen('sd_sped', '配偶者特別控除の額', d.spouse_ded && d.spouse_ded.spouse_special_deduction)}
        <label class="note"><input type="checkbox" id="sd_nr" style="width:auto" ${d.spouse_ded && d.spouse_ded.nonresident?'checked':''}> 非居住者である配偶者</label>
        ${meInp('sd_sf', '生計を一にする事実（送金等の合計額）', d.spouse_ded && d.spouse_ded.support_fact)}
        <label class="note">配偶者の個人番号（12桁）${ME.deps.spouse_ded ? '　登録済：' + meEsc(meMask(ME.deps.spouse_ded)) : ''}</label>
        <input id="sd_mn" inputmode="numeric" autocomplete="off" placeholder="${ME.deps.spouse_ded ? '変更するときだけ新しい12桁を入れる' : '数字12桁'}">
      </div>

      <h4>特定親族特別控除申告書（19歳以上23歳未満・所得が62万円超123万円以下）</h4>
      <p class="note">対象の生年月日（令和8年分）：平成16年1月2日〜平成20年1月1日。控除額の目安（計算はしません）：62万超85万以下＝63万円 … 120万超123万以下＝3万円。</p>
      ${meRelBlock('特定親族', 'sr', d.specified, 'specified', false)}
      <p class="note">各人の「特定親族特別控除の額」は、該当する行を足したあと下の欄に書いてください（行ごと）。</p>
      ${(d.specified || [{}]).concat((d.specified||[]).length?[]:[]).map((_, i) => meYen('sr_ded_'+i, '特定親族特別控除の額（'+(i+1)+'人目）', (d.specified[i]||{}).deduction_amt)).join('')}

      <h4>所得金額調整控除申告書</h4>
      <div class="card">
        <p class="note">本年中の年末調整の対象となる給与の収入金額が850万円以下の場合は、記載不要です。</p>
        <label class="note"><input type="checkbox" id="ia_self" style="width:auto" ${d.income_adj.self_special?'checked':''}> あなた自身が特別障害者</label>
        <label class="note"><input type="checkbox" id="ia_sp" style="width:auto" ${d.income_adj.spouse_special?'checked':''}> 同一生計配偶者が特別障害者</label>
        <label class="note"><input type="checkbox" id="ia_dep" style="width:auto" ${d.income_adj.dep_special?'checked':''}> 扶養親族が特別障害者</label>
        <label class="note"><input type="checkbox" id="ia_u23" style="width:auto" ${d.income_adj.dep_under23?'checked':''}> 扶養親族が年齢23歳未満（平16.1.2以後生）</label>
        ${meInp('ia_name', '左記の者の氏名（同一生計配偶者又は扶養親族）', d.income_adj.name)}
        ${meInp('ia_kana', 'フリガナ', d.income_adj.kana)}
        ${meInp('ia_birth', '生年月日', d.income_adj.birth, 'type="date"')}
        ${meInp('ia_rel', 'あなたとの続柄', d.income_adj.rel)}
        ${meInp('ia_addr', '住所又は居所（本人と異なる場合）', d.income_adj.address)}
        ${meYen('ia_inc', '本年中の合計所得金額の見積額', d.income_adj.income_est)}
        ${meInp('ia_fact', '特別障害者に該当する事実', d.income_adj.fact)}
        <label class="note"><input type="checkbox" id="ia_asfuyo" style="width:auto" ${d.income_adj.as_fuyo?'checked':''}> 扶養控除等申告書のとおり</label>
        <label class="note">左記の者の個人番号（12桁）${ME.deps.adj ? '　登録済：' + meEsc(meMask(ME.deps.adj)) : ''}</label>
        <input id="ia_mn" inputmode="numeric" autocomplete="off" placeholder="${ME.deps.adj ? '変更するときだけ新しい12桁を入れる' : '数字12桁'}">
      </div>

      <h4>保険料控除申告書（${meYearLabel(ME.year)}）</h4>
      <p class="note">生命保険料・地震保険料・社会保険料（申告分）・小規模企業共済等掛金（iDeCoなど）。控除額の計算はしません。</p>
      <h4>一般の生命保険料</h4>
      ${lg.map((r,i) => meRowLife('lg', i, r)).join('')}
      <p><button type="button" class="back" onclick="meAddRow('life_general')">＋ 行を足す</button></p>
      <label class="note"><input type="checkbox" id="ins_u23" style="width:auto" ${d.insurance.life_under23?'checked':''}> 年齢23歳未満の扶養親族がいる（生命保険料控除の特例）</label>
      ${meInp('ins_u23n', '☆ 年齢23歳未満の扶養親族の氏名（特例を受ける場合）', d.insurance.life_under23_names)}
      <h4>介護医療保険料</h4>
      ${lc.map((r,i) => meRowLife('lc', i, r)).join('')}
      <p><button type="button" class="back" onclick="meAddRow('life_care')">＋ 行を足す</button></p>
      <h4>個人年金保険料</h4>
      ${lp.map((r,i) => meRowLife('pen', i, r)).join('')}
      <p><button type="button" class="back" onclick="meAddRow('life_pension')">＋ 行を足す</button></p>
      <h4>地震保険料・旧長期損害保険料</h4>
      ${qk.map((r,i) => `<div class="card" style="margin:8px 0">
        ${meInp('qk_co_'+i, '保険会社等の名称', r.company)}
        ${meInp('qk_kind_'+i, '保険等の種類（目的）', r.kind)}
        ${meInp('qk_term_'+i, '保険期間', r.term)}
        ${meInp('qk_who_'+i, '家屋等に居住又は家財を利用している者等の氏名', r.who)}
        <label class="note">区分</label><select id="qk_type_${i}" style="width:100%;padding:10px">${meOpt(['','地震','旧長期'], r.type)}</select>
        ${meYen('qk_amt_'+i, '本年中に支払った保険料等の金額', r.premium)}
      </div>`).join('')}
      <p><button type="button" class="back" onclick="meAddRow('quake')">＋ 行を足す</button></p>
      <h4>社会保険料（申告分）</h4>
      ${soc.map((r,i) => `<div class="card" style="margin:8px 0">
        ${meInp('soc_kind_'+i, '社会保険の種類', r.kind, 'placeholder="例：国民年金"')}
        ${meInp('soc_pay_'+i, '保険料支払先の名称', r.payee)}
        ${meInp('soc_who_'+i, '保険料を負担することになっている人の氏名', r.who)}
        ${meYen('soc_amt_'+i, '本年中に支払った保険料の金額', r.premium)}
      </div>`).join('')}
      <p><button type="button" class="back" onclick="meAddRow('social')">＋ 行を足す</button></p>
      <h4>小規模企業共済等掛金（申告分）</h4>
      ${sko.map((r,i) => `<div class="card" style="margin:8px 0">
        ${meInp('sko_kind_'+i, '掛金の種類', r.kind, 'placeholder="例：iDeCo、小規模企業共済"')}
        ${meYen('sko_amt_'+i, '本年中に支払った掛金の金額', r.premium)}
      </div>`).join('')}
      <p><button type="button" class="back" onclick="meAddRow('shoukibo')">＋ 行を足す</button></p>

      <h4>住宅借入金等特別控除</h4>
      <div class="card">
        <label class="note"><input type="checkbox" id="hs_has" style="width:auto" ${d.housing && d.housing.has?'checked':''}> 住宅借入金等特別控除の適用を受ける（申告書は税務署から本人へ交付されます）</label>
        ${meInp('hs_note', '備考（適用年・備考など）', d.housing && d.housing.note)}
      </div>

      <h4>${meYearLabel(ME.year)}の前職の源泉徴収票</h4>
      <div class="card">
        <label class="note"><input type="checkbox" id="pj_has" style="width:auto" ${d.prev_job && d.prev_job.has?'checked':''}> 本年中に前の勤務先から給与の支払を受けた（源泉徴収票がある）</label>
        ${meInp('pj_payer', '前の給与の支払者の名称', d.prev_job && d.prev_job.payer)}
        ${meYen('pj_pay', '支払金額', d.prev_job && d.prev_job.payment_amt)}
        ${meYen('pj_tax', '源泉徴収税額', d.prev_job && d.prev_job.tax_amt)}
        ${meYen('pj_soc', '社会保険料等の金額', d.prev_job && d.prev_job.social_amt)}
        <label class="note">源泉徴収票の画像またはPDF（JPEG・PNG・PDF、10MBまで）</label>
        <input id="pj_file" type="file" accept="image/jpeg,image/png,application/pdf">
        ${files ? `<ul>${files}</ul>` : '<p class="note">まだ添付はありません。</p>'}
      </div>

      <p class="noprint">
        <button type="button" onclick="meSave(false)">下書きを保存する</button>
        <button type="button" onclick="meSave(true)">提出する</button>
      </p>
      <div id="me_msg" style="color:#c00"></div>
      ${ME.status ? `<p class="note">この年分の状態：${ME.status === 'submitted' ? '提出済み' : '下書き'}${ME.submitted_at ? '（' + meEsc(meDt(ME.submitted_at)) + '）' : ''}</p>` : ''}`;
  }
  function mePaint() {
    const back = meBack();
    const el = $('view');
    if (!el) return;
    el.innerHTML = back + meFormHtml();
  }
  async function meChangeYear(y) {
    ME.year = Number(y) || ME_YEAR0;
    if (typeof DEMO !== 'undefined' && DEMO) { mePaint(); return; }
    await meLoad();
    mePaint();
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
    ME.bank = null; ME.mine = null; ME.deps = {}; ME.d = meEmpty(); ME.status = ''; ME.submitted_at = null;
    if (typeof DEMO !== 'undefined' && DEMO) {
      ME.name = '見本 花子'; ME.office = 'レオ';
      ME.bank = { bank_name: '三重銀行', branch_name: '四日市', account_type: '普通', account_number: '1234567', account_holder_kana: 'ミホン　ハナコ' };
      ME.mine = '123456789016';
      ME.d.person = { kana:'ミホン　ハナコ', birth:'1990-04-01', postal:'510-0000', address:'三重県四日市市（見本）', household_name:'見本 太郎', household_rel:'夫', has_spouse:'有', otsu:false, disability:'', widow:false, single_parent:false, working_student:false, working_student_note:'', disability_note:'' };
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
    const deps = await sb(`staff_dependent_my_numbers?user_id=eq.${encodeURIComponent(uid)}&year=eq.${ME.year}&select=dep_id,my_number`).catch(() => []);
    ME.deps = {};
    (deps || []).forEach(r => { ME.deps[r.dep_id] = r.my_number; });
    const ye = await sb(`staff_ye_declarations?user_id=eq.${encodeURIComponent(uid)}&year=eq.${ME.year}&select=status,payload,submitted_at,updated_at`).catch(() => []);
    if (ye[0]) {
      ME.d = Object.assign(meEmpty(), ye[0].payload || {});
      ME.status = ye[0].status;
      ME.submitted_at = ye[0].submitted_at;
    }
  }
  async function meUpsert(table, conflict, body) {
    return sb(table + '?on_conflict=' + conflict, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  }
  async function meUpload(file) {
    const uid = meUid();
    const safe = String(file.name || 'file').replace(/[^\w.\u3040-\u30ff\u4e00-\u9fff-]+/g, '_').slice(0, 80);
    const path = uid + '/' + ME.year + '/prev_gensen/' + Date.now() + '-' + safe;
    const s = JSON.parse(localStorage.getItem('sess') || '{}');
    const r = await fetch(C.supabaseUrl + '/storage/v1/object/staff-ye-docs/' + path, {
      method: 'POST',
      headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'x-upsert': 'false', 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!r.ok) throw new Error('添付を保存できませんでした（' + r.status + '）');
    return { path, name: file.name };
  }
  async function meSave(submit) {
    meCollect();
    const msgNeed = '必須の項目を確認してください。';
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
      } else if (!ME.mine && meOn('mn_ack') === false && submit) {
        /* 提出時も個人番号は任意（入職の途中保存を妨げない） */
      }
      const depInputs = [
        ['spouse', 'sp_mn'], ['spouse_ded', 'sd_mn'], ['adj', 'ia_mn']
      ];
      ME.d.relatives.forEach((r, i) => depInputs.push([r.id, 'rel_mn_'+i]));
      ME.d.under16.forEach((r, i) => depInputs.push([r.id, 'u16_mn_'+i]));
      ME.d.retirees.forEach((r, i) => depInputs.push([r.id, 'ret_mn_'+i]));
      ME.d.specified.forEach((r, i) => depInputs.push([r.id, 'sr_mn_'+i]));
      for (const [depId, inputId] of depInputs) {
        const x = meReadMn(inputId);
        if (x.error) { meMsg(x.error); return; }
        if (x.value) {
          await meUpsert('staff_dependent_my_numbers', 'user_id,year,dep_id', { user_id: uid, year: ME.year, dep_id: depId, my_number: x.value });
          ME.deps[depId] = x.value;
        }
      }
      const fi = document.getElementById('pj_file');
      if (fi && fi.files && fi.files[0]) {
        const f = fi.files[0];
        if (f.size > 10485760) { meMsg('添付は10MBまでです。'); return; }
        const saved = await meUpload(f);
        ME.d.prev_job.files = (ME.d.prev_job.files || []).concat([saved]);
      }
      if (submit && !ME.d.person.birth) { meMsg('提出するには、あなたの生年月日を入れてください。'); return; }
      if (submit && !ME.d.person.address) { meMsg('提出するには、あなたの住所又は居所を入れてください。'); return; }
      const body = { user_id: uid, year: ME.year, status: submit ? 'submitted' : 'draft', payload: ME.d, submitted_at: submit ? new Date().toISOString() : ME.submitted_at || null };
      await meUpsert('staff_ye_declarations', 'user_id,year', body);
      ME.status = body.status;
      if (submit) ME.submitted_at = body.submitted_at;
      const bk = await sb(`staff_bank_accounts?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => []);
      ME.bank = bk[0] || ME.bank;
      mePaint();
      meMsg(submit ? '提出しました。' : '下書きを保存しました。', true);
    } catch (e) {
      meMsg((e && e.message) || msgNeed);
    }
  }
  async function meOpenFile(path) {
    if (!path) return;
    try {
      if (typeof DEMO !== 'undefined' && DEMO) return;
      const s = JSON.parse(localStorage.getItem('sess') || '{}');
      const r = await fetch(C.supabaseUrl + '/storage/v1/object/authenticated/staff-ye-docs/' + path, { headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token } });
      if (!r.ok) throw new Error('添付を開けませんでした（' + r.status + '）');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (e) { meMsg((e && e.message) || '添付を開けませんでした。'); }
  }
  async function renderMe() {
    const back = meBack();
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try {
      const q = new URLSearchParams((location.hash.split('?')[1] || ''));
      if (q.get('y')) ME.year = Number(q.get('y')) || ME_YEAR0;
      await meLoad();
      mePaint();
    } catch (e) {
      $('view').innerHTML = back + '<h3>入職・年末調整の届出</h3><p>' + meEsc(e.message) + '</p>';
    }
  }
  function meNameOf(p) { return (p && (p.full_name || p.nikki_name)) || '（氏名未登録）'; }
  async function renderMeList() {
    const back = meBack();
    if (!meCanList() && !(typeof DEMO !== 'undefined' && DEMO && ROLE === '事務')) {
      $('view').innerHTML = back + '<h3>入職・年末調整の届出（一覧）</h3><p>事務と会長だけが見られます。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    const year = Number(q.get('y') || ME.year || ME_YEAR0);
    ME.year = year;
    try {
      if (typeof DEMO !== 'undefined' && DEMO) {
        $('view').innerHTML = back + `<h3>入職・年末調整の届出（一覧）</h3><p class="note">見本モードです。</p>
          <p><a href="#me">自分の届出画面</a></p>
          <div class="sheet-scroll"><table class="tbl"><tr><th>氏名</th><th>所属</th><th>口座</th><th>個人番号</th><th>${meYearLabel(year)}</th><th></th></tr>
          <tr><td>見本 花子</td><td>レオ</td><td>三重銀行　••••567</td><td>登録済 ${meEsc(meMask('123456789016'))}</td><td>提出済み</td><td><button type="button" class="back" onclick="location.hash='#me/list/demo-2'">詳細</button></td></tr>
          </table></div>`;
        return;
      }
      const [profs, banks, mns, yes] = await Promise.all([
        sb('staff_profiles?select=user_id,full_name,nikki_name,office,active&order=office,full_name'),
        sb('staff_bank_accounts?select=user_id,bank_name,branch_name,account_type,account_number'),
        sb('staff_my_numbers?select=user_id,my_number'),
        sb(`staff_ye_declarations?year=eq.${year}&select=user_id,status,submitted_at,updated_at`)
      ]);
      const bmap = Object.fromEntries((banks||[]).map(r => [r.user_id, r]));
      const mmap = Object.fromEntries((mns||[]).map(r => [r.user_id, r]));
      const ymap = Object.fromEntries((yes||[]).map(r => [r.user_id, r]));
      const rows = (profs||[]).filter(p => p.active !== false).map(p => {
        const b = bmap[p.user_id], m = mmap[p.user_id], y = ymap[p.user_id];
        const st = !y ? '未' : (y.status === 'submitted' ? '提出済み' : '下書き');
        const bank = b ? `${meEsc(b.bank_name)}　${meEsc(meMask(b.account_number))}` : '未登録';
        const mn = m ? ('登録済 ' + meEsc(meMask(m.my_number))) : '未登録';
        return `<tr><td>${meEsc(meNameOf(p))}</td><td>${meEsc(p.office || '')}</td><td>${bank}</td><td>${mn}</td><td>${st}</td>
          <td><button type="button" class="back" onclick="location.hash='#me/list/${meEsc(p.user_id)}?y=${year}'">詳細</button></td></tr>`;
      }).join('');
      const ys = [2026, 2025].map(y => `<option value="${y}" ${y===year?'selected':''}>${meYearLabel(y)}</option>`).join('');
      $('view').innerHTML = back + `<h3>入職・年末調整の届出（一覧）</h3>
        <p class="note">閲覧のみです。口座番号と個人番号は下4桁以外を伏せています。全文は詳細で確認できます。</p>
        <p><a href="#me">自分の届出画面</a></p>
        <label class="note">年分</label><select style="width:100%;padding:10px" onchange="location.hash='#me/list?y='+this.value">${ys}</select>
        <div class="sheet-scroll"><table class="tbl"><tr><th>氏名</th><th>所属</th><th>口座</th><th>個人番号</th><th>${meEsc(meYearLabel(year))}</th><th></th></tr>
        ${rows || '<tr><td colspan="6">職員がいません。</td></tr>'}</table></div>
        <p class="note">${(profs||[]).filter(p => p.active !== false).length} 名</p>`;
    } catch (e) {
      $('view').innerHTML = back + '<h3>入職・年末調整の届出（一覧）</h3><p>' + meEsc(e.message) + '</p>';
    }
  }
  function meShowAllMn(v) { return v ? String(v).replace(/\D/g, '') : '（未登録）'; }
  function meKV(label, v) { return `<p><span class="note">${label}</span><br>${meEsc(v == null || v === '' ? '—' : v)}</p>`; }
  function mePeople(list, nums, title) {
    if (!list || !list.length) return `<p class="note">${title}：該当なし</p>`;
    return `<h4>${title}</h4>` + list.map(r => `<div class="card" style="margin:8px 0">
      ${meKV('氏名', r.name)} ${meKV('フリガナ', r.kana)} ${meKV('続柄', r.rel)} ${meKV('生年月日', r.birth)}
      ${meKV('住所', r.address)} ${meKV('所得の見積額', r.income_est)} ${meKV('区分', r.category)} ${meKV('同居', r.live_together ? 'はい' : '')}
      ${meKV('非居住者', r.nonresident)} ${meKV('生計を一にする事実', r.support_fact)} ${meKV('障害者区分', r.disability)}
      ${meKV('個人番号', meShowAllMn(nums[r.id]))} ${r.deduction_amt ? meKV('控除額', r.deduction_amt) : ''}
    </div>`).join('');
  }
  async function renderMeDetail(uid) {
    const back = `<button class="back" type="button" onclick="location.hash='#me/list?y=${ME.year||ME_YEAR0}'">← 一覧へ</button>`;
    if (!meCanList() && !(typeof DEMO !== 'undefined' && DEMO && ROLE === '事務')) {
      $('view').innerHTML = back + '<p>事務と会長だけが見られます。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    const year = Number(q.get('y') || ME.year || ME_YEAR0);
    ME.year = year;
    try {
      if (typeof DEMO !== 'undefined' && DEMO) {
        $('view').innerHTML = back + '<h3>見本 花子（レオ）の届出</h3><p class="note">見本です。</p>' + meKV('個人番号（全桁）', '123456789016') + meKV('口座番号（全桁）', '1234567');
        return;
      }
      const [profs, banks, mns, deps, yes] = await Promise.all([
        sb(`staff_profiles?user_id=eq.${encodeURIComponent(uid)}&select=user_id,full_name,nikki_name,office`),
        sb(`staff_bank_accounts?user_id=eq.${encodeURIComponent(uid)}&select=*`),
        sb(`staff_my_numbers?user_id=eq.${encodeURIComponent(uid)}&select=my_number,purpose_ack,updated_at`),
        sb(`staff_dependent_my_numbers?user_id=eq.${encodeURIComponent(uid)}&year=eq.${year}&select=dep_id,my_number`),
        sb(`staff_ye_declarations?user_id=eq.${encodeURIComponent(uid)}&year=eq.${year}&select=*`)
      ]);
      const p = (profs || [])[0] || {};
      const b = (banks || [])[0];
      const m = (mns || [])[0];
      const nums = Object.fromEntries((deps || []).map(r => [r.dep_id, r.my_number]));
      const y = (yes || [])[0];
      const d = Object.assign(meEmpty(), (y && y.payload) || {});
      const ins = d.insurance || {};
      const files = ((d.prev_job && d.prev_job.files) || []).map(f => `<li><button type="button" class="back" onclick="meOpenFile('${meEsc(f.path)}')">${meEsc(f.name || '添付')}</button></li>`).join('');
      $('view').innerHTML = back + `<h3>${meEsc(meNameOf(p))}（${meEsc(p.office || '')}）の届出　${meEsc(meYearLabel(year))}</h3>
        <p class="note">閲覧のみです。個人番号と口座番号は全桁を表示しています。印刷するときは取り扱いに注意してください。</p>
        <p>状態：${y ? (y.status === 'submitted' ? '提出済み' : '下書き') : '未提出'} ${y && y.submitted_at ? '／提出：' + meEsc(meDt(y.submitted_at)) : ''} ${y && y.updated_at ? '／更新：' + meEsc(meDt(y.updated_at)) : ''}</p>
        <h4>給与振込口座</h4>
        <div class="card">${b ? meKV('銀行名', b.bank_name) + meKV('支店名', b.branch_name) + meKV('口座種別', b.account_type) + meKV('口座番号（全桁）', b.account_number) + meKV('口座名義', b.account_holder_kana) : '<p>未登録</p>'}</div>
        <h4>本人の個人番号</h4>
        <div class="card">${m ? meKV('個人番号（全桁）', m.my_number) + meKV('利用目的の同意', m.purpose_ack ? 'あり' : 'なし') : '<p>未登録</p>'}</div>
        <h4>本人（扶養控除等申告書）</h4>
        <div class="card">
          ${meKV('フリガナ', d.person.kana)} ${meKV('生年月日', d.person.birth)} ${meKV('郵便番号', d.person.postal)} ${meKV('住所又は居所', d.person.address)}
          ${meKV('世帯主の氏名', d.person.household_name)} ${meKV('世帯主との続柄', d.person.household_rel)} ${meKV('配偶者の有無', d.person.has_spouse)}
          ${meKV('乙欄（他に主たる給与）', d.person.otsu ? 'はい' : 'いいえ')} ${meKV('障害者区分', d.person.disability)} ${meKV('障害者・勤労学生の内容', d.person.disability_note)}
          ${meKV('寡婦', d.person.widow ? 'はい' : '')} ${meKV('ひとり親', d.person.single_parent ? 'はい' : '')} ${meKV('勤労学生', d.person.working_student ? 'はい' : '')}
          ${meKV('勤労学生の内容', d.person.working_student_note)} ${meKV('親族の障害者', d.disability_family && d.disability_family.notes)} ${meKV('Ｄ欄', d.other_earner)}
        </div>
        <h4>源泉控除対象配偶者</h4>
        <div class="card">${d.spouse && (d.spouse.has || d.spouse.name) ? meKV('氏名', d.spouse.name) + meKV('続柄', d.spouse.rel) + meKV('生年月日', d.spouse.birth) + meKV('所得の見積額', d.spouse.income_est) + meKV('個人番号（全桁）', meShowAllMn(nums.spouse)) : '<p>記載なし</p>'}</div>
        ${mePeople(d.relatives, nums, '源泉控除対象親族（16歳以上）')}
        ${mePeople(d.under16, nums, '16歳未満の扶養親族')}
        ${mePeople(d.retirees, nums, '退職手当等を有する配偶者・扶養親族・特定親族')}
        <h4>基礎控除申告書</h4>
        <div class="card">${meKV('給与収入の見積', d.basic.salary_income)} ${meKV('給与所得の見積', d.basic.salary_amount)} ${meKV('給与以外の所得', d.basic.other_income)} ${meKV('合計所得の見積', d.basic.total_income)} ${meKV('区分Ⅰ', d.basic.class_I)} ${meKV('基礎控除の額', d.basic.basic_deduction)}</div>
        <h4>配偶者控除等申告書</h4>
        <div class="card">${d.spouse_ded && (d.spouse_ded.apply || d.spouse_ded.name) ? meKV('氏名', d.spouse_ded.name) + meKV('生年月日', d.spouse_ded.birth) + meKV('合計所得の見積', d.spouse_ded.total_income) + meKV('区分Ⅱ', d.spouse_ded.class_II) + meKV('配偶者控除の額', d.spouse_ded.spouse_deduction) + meKV('配偶者特別控除の額', d.spouse_ded.spouse_special_deduction) + meKV('個人番号（全桁）', meShowAllMn(nums.spouse_ded)) : '<p>記載なし</p>'}</div>
        ${mePeople(d.specified, nums, '特定親族特別控除の対象者')}
        <h4>所得金額調整控除申告書</h4>
        <div class="card">${meKV('本人が特別障害者', d.income_adj.self_special ? 'はい' : '')} ${meKV('同一生計配偶者が特別障害者', d.income_adj.spouse_special ? 'はい' : '')} ${meKV('扶養親族が特別障害者', d.income_adj.dep_special ? 'はい' : '')} ${meKV('23歳未満の扶養親族', d.income_adj.dep_under23 ? 'はい' : '')} ${meKV('左記の者', d.income_adj.name)} ${meKV('個人番号（全桁）', meShowAllMn(nums.adj))}</div>
        <h4>保険料控除申告書</h4>
        <div class="card">
          ${meKV('23歳未満の扶養親族（生命保険料控除の特例）', ins.life_under23 ? 'あり　' + (ins.life_under23_names || '') : 'なし')}
          ${meKV('一般の生命保険', (ins.life_general||[]).map(x => (x.company||'') + ' ' + (x.premium||'')).join('／') || '—')}
          ${meKV('介護医療', (ins.life_care||[]).map(x => (x.company||'') + ' ' + (x.premium||'')).join('／') || '—')}
          ${meKV('個人年金', (ins.life_pension||[]).map(x => (x.company||'') + ' ' + (x.premium||'')).join('／') || '—')}
          ${meKV('地震・旧長期', (ins.quake||[]).map(x => (x.company||'') + ' ' + (x.type||'') + ' ' + (x.premium||'')).join('／') || '—')}
          ${meKV('社会保険料（申告分）', (ins.social||[]).map(x => (x.kind||'') + ' ' + (x.premium||'')).join('／') || '—')}
          ${meKV('小規模企業共済等掛金', (ins.shoukibo||[]).map(x => (x.kind||'') + ' ' + (x.premium||'')).join('／') || '—')}
        </div>
        <h4>住宅借入金等特別控除</h4>
        <div class="card">${meKV('適用', d.housing && d.housing.has ? '受ける' : '受けない')} ${meKV('備考', d.housing && d.housing.note)}</div>
        <h4>前職の源泉徴収票</h4>
        <div class="card">${meKV('有無', d.prev_job && d.prev_job.has ? 'あり' : 'なし')} ${meKV('支払者', d.prev_job && d.prev_job.payer)} ${meKV('支払金額', d.prev_job && d.prev_job.payment_amt)} ${meKV('源泉徴収税額', d.prev_job && d.prev_job.tax_amt)} ${meKV('社会保険料等', d.prev_job && d.prev_job.social_amt)}${files ? '<ul>' + files + '</ul>' : ''}</div>
        <p class="noprint"><button type="button" class="back" onclick="window.print()">印刷／PDFにする</button></p>`;
    } catch (e) {
      $('view').innerHTML = back + '<p>' + meEsc(e.message) + '</p>';
    }
  }
  g.renderMe = renderMe;
  g.renderMeList = renderMeList;
  g.renderMeDetail = renderMeDetail;
  g.meSave = meSave;
  g.meAddRow = meAddRow;
  g.meChangeYear = meChangeYear;
  g.meOpenFile = meOpenFile;
  g.meMaskNumber = meMask;
  g.meNumberValid = meNumberValid;
  g.meToKana = meToKana;
})(typeof window !== 'undefined' ? window : globalThis);
