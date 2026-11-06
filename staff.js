// 職員マスタ（#staff）：staff_profiles の手編集。総務・人事労務。
// 見る：会長・事務・職責「管理者」。ほかの職員を直す：会長・事務。会長フラグは会長だけ。
(function (g) {
  const ST_DUTIES = ['現場支援員', '児発管', '管理者', '事務'];
  const ST_ROLES = ['職員', '事務'];
  const ST = { rows: [], edit: null, showInactive: false, me: null };

  const stEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stName = r => r.full_name || r.nikki_name || (r.email || '').split('@')[0] || '（名前未設定）';
  const stOffices = () => {
    const fromC = (typeof C !== 'undefined' && C.offices) ? C.offices.map(o => o.name) : [];
    const extra = ['星心会レスパイトスタジオ'];
    return [...new Set(fromC.concat(extra))];
  };
  const stExtraList = v => {
    if (Array.isArray(v)) return v.map(s => String(s || '').trim()).filter(Boolean);
    if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    return [];
  };
  const stCanOpen = () => {
    if (typeof DEMO !== 'undefined' && DEMO) return true;
    return (typeof ROLE !== 'undefined' && ROLE === '事務')
      || (typeof DUTY !== 'undefined' && DUTY === '管理者')
      || (typeof IS_CHAIR !== 'undefined' && IS_CHAIR);
  };
  const stCanEditOthers = () => (typeof DEMO !== 'undefined' && DEMO)
    || (typeof ROLE !== 'undefined' && ROLE === '事務')
    || (typeof IS_CHAIR !== 'undefined' && IS_CHAIR);
  const stCanEditChairFlag = () => (typeof DEMO !== 'undefined' && DEMO) || (typeof IS_CHAIR !== 'undefined' && IS_CHAIR);
  const stMyUid = () => {
    try {
      const s = JSON.parse(localStorage.getItem('sess') || 'null');
      if (!s || !s.token) return '';
      const payload = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub || '';
    } catch (e) { return ''; }
  };

  async function stLoad() {
    if (typeof DEMO !== 'undefined' && DEMO) {
      ST.rows = [
        { user_id: 'demo-1', email: 'demo-jimu@example.com', office: 'レオ', role: '事務', duty: '事務', full_name: '見本 事務', nikki_name: '見本事務', chamu_record_name: null, extra_offices: [], nicchu: false, daily_report: true, active: true, is_chair: false, rank: '総務奉行', chat_email: null },
        { user_id: 'demo-2', email: 'demo-mgr@example.com', office: 'レオ', role: '職員', duty: '管理者', full_name: '見本 管理者', nikki_name: '見本管理者', chamu_record_name: null, extra_offices: ['茶夢'], nicchu: true, daily_report: true, active: true, is_chair: true, rank: null, chat_email: null },
        { user_id: 'demo-3', email: 'demo-staff@example.com', office: '金斗雲', role: '職員', duty: '現場支援員', full_name: '見本 職員', nikki_name: '見本職員', chamu_record_name: null, extra_offices: [], nicchu: false, daily_report: false, active: true, is_chair: false, rank: null, chat_email: null }
      ];
      return;
    }
    ST.rows = await sb('rpc/staff_admin_roster', { method: 'POST', body: '{}' }) || [];
  }

  function stRowCanEdit(r) {
    if (!r) return false;
    const me = stMyUid();
    if (r.is_chair && !stCanEditChairFlag()) return false;
    if (r.user_id !== me && !stCanEditOthers()) return false;
    return true;
  }

  function stListHtml() {
    const rows = ST.rows.filter(r => ST.showInactive || r.active);
    if (!rows.length) return '<p class="note">表示する職員がいません。</p>';
    return `<div class="sheet-scroll"><table class="tbl"><tr>
      <th>氏名</th><th>所属</th><th>職責</th><th>役割</th><th>権限</th><th></th></tr>
      ${rows.map(r => {
        const flags = [
          r.is_chair ? '会長' : '',
          r.nicchu ? '日中一時' : '',
          r.daily_report ? '業務報告' : '',
          r.active ? '' : '無効'
        ].filter(Boolean).join('・') || '—';
        const extras = stExtraList(r.extra_offices);
        return `<tr style="${r.active ? '' : 'opacity:.55'}">
          <td><b>${stEsc(stName(r))}</b><br><small>${stEsc(r.email || '')}</small></td>
          <td>${stEsc(r.office)}${extras.length ? `<br><small>兼務：${stEsc(extras.join('、'))}</small>` : ''}</td>
          <td>${stEsc(r.duty)}</td>
          <td>${stEsc(r.role)}</td>
          <td><small>${stEsc(flags)}</small></td>
          <td>${stRowCanEdit(r)
            ? `<button type="button" class="back" onclick="staffEdit('${stEsc(r.user_id)}')">直す</button>`
            : '<small style="color:#888">権限なし</small>'}</td></tr>`;
      }).join('')}</table></div>`;
  }

  function stForm(r) {
    if (!r) return '';
    const me = stMyUid();
    const self = r.user_id === me;
    const canRole = stCanEditOthers() || (typeof DEMO !== 'undefined' && DEMO);
    const canChair = stCanEditChairFlag();
    const roleDisabled = (!canRole) || (self && r.role !== '事務');
    const roleDisAttr = roleDisabled
      ? (self && r.role !== '事務'
        ? ' disabled title="自分を事務に上げられません"'
        : ' disabled title="役割は会長・事務だけ"')
      : '';
    const offices = stOffices();
    const extras = stExtraList(r.extra_offices);
    const officeOpts = offices.map(o => `<option value="${stEsc(o)}"${o === r.office ? ' selected' : ''}>${stEsc(o)}</option>`).join('');
    const dutyOpts = ST_DUTIES.map(d => `<option value="${stEsc(d)}"${d === r.duty ? ' selected' : ''}>${stEsc(d)}</option>`).join('');
    const roleOpts = ST_ROLES.map(d => `<option value="${stEsc(d)}"${d === r.role ? ' selected' : ''}>${stEsc(d)}</option>`).join('');
    const extraChecks = offices.map(o => {
      if (o === r.office) return '';
      const on = extras.includes(o);
      return `<label style="display:inline-block;margin:2px 10px 2px 0"><input type="checkbox" class="st_extra" value="${stEsc(o)}"${on ? ' checked' : ''}> ${stEsc(o)}</label>`;
    }).join('');
    const warn = [];
    if (r.is_chair) warn.push('この人は会長です。会長フラグは会長だけが変えられます。');
    if (self) warn.push('自分の行です。役割を「事務」へ上げること・自分を会長にすることはできません。');
    if (!stCanEditOthers() && self) warn.push('管理者は自分の行だけ直せます。ほかの職員は会長・事務が直します。');
    return `<div class="card" id="st_form" style="border-left:4px solid #555;margin:12px 0">
      <h4 style="margin:0 0 8px">${stEsc(stName(r))} を直す</h4>
      <p class="note">${stEsc(r.email || '')}${warn.length ? '<br>' + warn.map(stEsc).join('<br>') : ''}</p>
      <div class="uig">
        <label><span>氏名（フルネーム）</span><input id="st_full" maxlength="80" value="${stEsc(r.full_name || '')}"></label>
        <label><span>日誌に出る名前</span><input id="st_nikki" maxlength="80" value="${stEsc(r.nikki_name || '')}"></label>
        <label><span>茶夢の公式名（空＝置き換えなし）</span><input id="st_chamu" maxlength="60" value="${stEsc(r.chamu_record_name || '')}"></label>
        <label><span>所属</span><select id="st_office">${officeOpts}</select></label>
        <label class="wide"><span>兼務（所属以外）</span><div>${extraChecks || '<span class="note">選択肢なし</span>'}</div></label>
        <label><span>職責</span><select id="st_duty">${dutyOpts}</select></label>
        <label><span>役割（データの見える範囲）</span><select id="st_role"${roleDisAttr}>${roleOpts}</select></label>
        <label><span>役職名（評定所など。空可）</span><input id="st_rank" maxlength="40" value="${stEsc(r.rank || '')}" placeholder="例 総務奉行"></label>
        <label><span>Chat用メール（任意）</span><input id="st_chat" maxlength="120" value="${stEsc(r.chat_email || '')}" placeholder="例 xxx@psr-seishinkai.org"></label>
      </div>
      <p>
        <label><input type="checkbox" id="st_nicchu"${r.nicchu ? ' checked' : ''}> 日中一時の記録を使える</label><br>
        <label><input type="checkbox" id="st_report"${r.daily_report ? ' checked' : ''}> 業務報告の対象</label><br>
        <label><input type="checkbox" id="st_active"${r.active ? ' checked' : ''}> 有効（オフにするとログイン後の所属判定などから外れる）</label><br>
        <label><input type="checkbox" id="st_chair"${r.is_chair ? ' checked' : ''} ${canChair ? '' : 'disabled title="会長だけ"'}> 会長</label>
      </p>
      <p><button type="button" onclick="staffSave('${stEsc(r.user_id)}')">保存</button>
        <button type="button" class="back" onclick="staffEdit(null)">やめる</button>
        <span id="st_msg" class="note"></span></p>
    </div>`;
  }

  async function renderStaffAdmin() {
    const back = `<button class="back" onclick="location.hash='soumu'">← 総務へ</button>`;
    if (typeof loadDuty === 'function') await loadDuty();
    if (!stCanOpen()) {
      $('view').innerHTML = back + '<h3>👥 職員マスタ</h3><p>会長・事務・職責「管理者」だけが使えます。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try {
      await stLoad();
    } catch (e) {
      $('view').innerHTML = back + `<h3>👥 職員マスタ</h3><p style="color:#c00">${stEsc(e.message)}</p>
        <p class="note">管理者が supabase/staff_admin.sql を適用しているか確認してください。</p>`;
      return;
    }
    const edit = ST.edit ? ST.rows.find(r => r.user_id === ST.edit) : null;
    const note = stCanEditOthers()
      ? 'ほかの職員の所属・兼務・職責・名前などを直せます。役割（職員／事務）は会長・事務、会長フラグは会長だけです。'
      : '名簿は見られます。直せるのは自分の行だけです（ほかの職員は会長・事務が直します）。';
    $('view').innerHTML = back + `<h3>👥 職員マスタ</h3>
      <p class="note">${note} 新しいログインの作成（招待メール）は、この画面ではしません。</p>
      <p><label><input type="checkbox" ${ST.showInactive ? 'checked' : ''} onchange="ST.showInactive=this.checked;renderStaffAdmin()"> 無効の職員も表示</label>
       　<small>登録 ${ST.rows.length}人／有効 ${ST.rows.filter(r => r.active).length}人</small></p>
      ${edit && stRowCanEdit(edit) ? stForm(edit) : (ST.edit && !edit ? '<p class="note">選んだ職員が見つかりません。</p>' : '')}
      ${stListHtml()}`;
    if (edit && stRowCanEdit(edit)) {
      const f = document.getElementById('st_form');
      if (f) f.scrollIntoView({ block: 'nearest' });
    }
  }

  function staffEdit(id) {
    ST.edit = id || null;
    renderStaffAdmin();
  }

  async function staffSave(id) {
    const msg = document.getElementById('st_msg');
    const row = ST.rows.find(r => r.user_id === id);
    if (!row || !msg) return;
    if (!stRowCanEdit(row)) { msg.style.color = '#c00'; msg.textContent = 'この職員を直す権限がありません。'; return; }
    const office = (document.getElementById('st_office') || {}).value;
    const duty = (document.getElementById('st_duty') || {}).value;
    const roleEl = document.getElementById('st_role');
    const role = roleEl && !roleEl.disabled ? roleEl.value : row.role;
    const extras = [...document.querySelectorAll('.st_extra:checked')].map(el => el.value).filter(v => v && v !== office);
    const patch = {
      office,
      duty,
      role,
      extra_offices: extras,
      full_name: (document.getElementById('st_full') || {}).value || '',
      nikki_name: (document.getElementById('st_nikki') || {}).value || '',
      chamu_record_name: (document.getElementById('st_chamu') || {}).value || '',
      rank: (document.getElementById('st_rank') || {}).value || '',
      chat_email: (document.getElementById('st_chat') || {}).value || '',
      nicchu: !!(document.getElementById('st_nicchu') || {}).checked,
      daily_report: !!(document.getElementById('st_report') || {}).checked,
      active: !!(document.getElementById('st_active') || {}).checked
    };
    const chairEl = document.getElementById('st_chair');
    if (chairEl && !chairEl.disabled) patch.is_chair = !!chairEl.checked;

    if (typeof DEMO !== 'undefined' && DEMO) {
      Object.assign(row, patch);
      msg.style.color = ''; msg.textContent = '見本モードなので保存しません。';
      setTimeout(() => { ST.edit = null; renderStaffAdmin(); }, 600);
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem('sess') || '{}');
      const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/staff_admin_update', {
        method: 'POST',
        headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ p_user_id: id, p_patch: patch })
      });
      if (!r.ok) {
        let detail = '';
        try { const j = await r.json(); detail = j.message || j.hint || j.details || ''; } catch (e2) {}
        throw new Error(detail || ('保存できませんでした（' + r.status + '）'));
      }
      ST.edit = null;
      await renderStaffAdmin();
    } catch (e) {
      msg.style.color = '#c00';
      msg.textContent = e.message || String(e);
    }
  }

  g.ST = ST;
  g.renderStaffAdmin = renderStaffAdmin;
  g.staffEdit = staffEdit;
  g.staffSave = staffSave;
  g.stCanOpenStaff = stCanOpen;
})(typeof window !== 'undefined' ? window : globalThis);
