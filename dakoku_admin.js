// 打刻設定（#dakoku-settings）。事業所・半径・座標・職員割当。会長・事務・管理者。
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const can = () => (typeof DEMO !== 'undefined' && DEMO)
    || (typeof ROLE !== 'undefined' && ROLE === '事務')
    || (typeof DUTY !== 'undefined' && DUTY === '管理者')
    || (typeof IS_CHAIR !== 'undefined' && IS_CHAIR);

  async function loadOffices() {
    const rows = await sb('dakoku_offices?select=*&order=sort_no.asc,name.asc');
    return Array.isArray(rows) ? rows : [];
  }
  async function loadStaff() {
    const rows = await sb('dakoku_staff?select=*&order=office.asc,id.asc');
    return Array.isArray(rows) ? rows : [];
  }

  function paint(offices, staff) {
    const back = `<button class="back" onclick="location.hash='soumu'">← 総務へ</button>`;
    const oRows = offices.map(r => `<tr>
      <td><input id="dko_name_${esc(r.name)}" value="${esc(r.name)}" style="width:6.5rem" disabled title="名称の変更は削除して作り直し"></td>
      <td><input id="dko_code_${esc(r.name)}" value="${esc(r.code || '')}" style="width:5rem"></td>
      <td><input id="dko_radius_${esc(r.name)}" type="number" value="${r.radius == null ? '' : esc(r.radius)}" style="width:5rem" placeholder="不要なら空"></td>
      <td><input id="dko_lat_${esc(r.name)}" type="number" step="any" value="${r.lat == null ? '' : esc(r.lat)}" style="width:7rem"></td>
      <td><input id="dko_lng_${esc(r.name)}" type="number" step="any" value="${r.lng == null ? '' : esc(r.lng)}" style="width:7rem"></td>
      <td><input id="dko_sort_${esc(r.name)}" type="number" value="${esc(r.sort_no || 0)}" style="width:3.5rem"></td>
      <td><input id="dko_en_${esc(r.name)}" type="checkbox" style="width:auto" ${r.enabled ? 'checked' : ''}></td>
      <td class="ops"><button type="button" class="inl sec" onclick="dkaSaveOffice('${esc(r.name)}')">保存</button>
        <button type="button" class="inl back" onclick="dkaDelOffice('${esc(r.name)}')">削除</button></td>
    </tr>`).join('');
    const opts = offices.map(o => `<option value="${esc(o.name)}">${esc(o.name)}</option>`).join('');
    const sRows = staff.map(r => {
      const op = offices.map(o => `<option value="${esc(o.name)}"${o.name === r.office ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
      return `<tr>
        <td><code>${esc(r.id)}</code></td>
        <td><input id="dks_name_${esc(r.id)}" value="${esc(r.name)}" style="width:7rem"></td>
        <td><select id="dks_office_${esc(r.id)}">${op}</select></td>
        <td><input id="dks_email_${esc(r.id)}" value="${esc(r.email || '')}" style="width:12rem" placeholder="任意"></td>
        <td><input id="dks_role_${esc(r.id)}" value="${esc(r.role || '本人')}" style="width:5rem"></td>
        <td><input id="dks_en_${esc(r.id)}" type="checkbox" style="width:auto" ${r.enabled ? 'checked' : ''}></td>
        <td class="ops"><button type="button" class="inl sec" onclick="dkaSaveStaff('${esc(r.id)}')">保存</button>
          <button type="button" class="inl back" onclick="dkaDelStaff('${esc(r.id)}')">削除</button></td>
      </tr>`;
    }).join('');
    $('view').innerHTML = back + `<h3>⏰ 打刻設定</h3>
      <p class="note">事業所の座標・許可半径と、職員の所属割当です。打刻画面（#dakoku）はここを読みます。既存の値は変えずに直してください。半径・緯度・経度を空にすると位置情報不要になります。</p>
      <p id="dka_msg" class="note"></p>
      <div class="card"><h4>事業所</h4>
        ${offices.length ? `<table class="tbl"><tr><th>名称</th><th>コード</th><th>半径m</th><th>緯度</th><th>経度</th><th>順</th><th>有効</th><th></th></tr>${oRows}</table>` : '<p>ありません</p>'}
        <p><button type="button" class="inl" onclick="dkaAddOffice()">＋事業所を追加</button></p>
      </div>
      <div class="card"><h4>職員割当</h4>
        ${staff.length ? `<table class="tbl"><tr><th>ID</th><th>氏名</th><th>所属</th><th>メール</th><th>役割</th><th>有効</th><th></th></tr>${sRows}</table>` : '<p>ありません</p>'}
        <p>追加：ID <input id="dka_new_id" style="width:5rem"> 氏名 <input id="dka_new_name" style="width:7rem">
          所属 <select id="dka_new_office">${opts}</select>
          <button type="button" class="inl" onclick="dkaAddStaff()">追加</button></p>
      </div>
      <p class="note"><a href="#dakoku">打刻画面を開く</a></p>`;
  }

  async function refresh() {
    const [offices, staff] = await Promise.all([loadOffices(), loadStaff()]);
    paint(offices, staff);
  }

  async function renderDakokuSettings() {
    const back = `<button class="back" onclick="location.hash='soumu'">← 総務へ</button>`;
    if (typeof loadDuty === 'function') await loadDuty();
    if (!can()) {
      $('view').innerHTML = back + '<h3>⏰ 打刻設定</h3><p>会長・事務・職責「管理者」だけが使えます。</p>';
      return;
    }
    if (typeof DEMO !== 'undefined' && DEMO) {
      $('view').innerHTML = back + '<h3>⏰ 打刻設定</h3><p>見本モードでは表示しません。</p>';
      return;
    }
    $('view').innerHTML = back + '<p>読み込み中…</p>';
    try { await refresh(); }
    catch (e) {
      $('view').innerHTML = back + `<h3>⏰ 打刻設定</h3><p style="color:#c00">${esc(e.message)}</p>
        <p class="note">supabase/dakoku.sql を適用しているか確認してください。</p>`;
    }
  }

  function numOrNull(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  g.dkaSaveOffice = async function (name) {
    const msg = $('dka_msg');
    try {
      const body = {
        code: ($('dko_code_' + name).value || '').trim(),
        radius: numOrNull($('dko_radius_' + name).value),
        lat: numOrNull($('dko_lat_' + name).value),
        lng: numOrNull($('dko_lng_' + name).value),
        sort_no: Number($('dko_sort_' + name).value) || 0,
        enabled: !!$('dko_en_' + name).checked,
        updated_at: new Date().toISOString()
      };
      await sb('dakoku_offices?name=eq.' + encodeURIComponent(name), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body)
      });
      if (msg) msg.textContent = '事業所「' + name + '」を保存しました';
    } catch (e) { if (msg) msg.textContent = e.message; else alert(e.message); }
  };

  g.dkaDelOffice = async function (name) {
    if (!confirm('事業所「' + name + '」を削除しますか？\n所属職員がいると削除できません。打刻履歴は残ります。')) return;
    try {
      await sb('dakoku_offices?name=eq.' + encodeURIComponent(name), { method: 'DELETE' });
      await refresh();
    } catch (e) { alert(e.message); }
  };

  g.dkaAddOffice = async function () {
    const name = prompt('事業所名（既存と重複不可）');
    if (!name || !name.trim()) return;
    const code = prompt('コード（半角）', '') || '';
    const radius = numOrNull(prompt('半径メートル（位置情報不要なら空）', '200'));
    const lat = numOrNull(prompt('緯度（不要なら空）', ''));
    const lng = numOrNull(prompt('経度（不要なら空）', ''));
    try {
      await sb('dakoku_offices', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name: name.trim(), code: code.trim(), radius, lat, lng, enabled: true, sort_no: 99 })
      });
      await refresh();
    } catch (e) { alert(e.message); }
  };

  g.dkaSaveStaff = async function (id) {
    const msg = $('dka_msg');
    try {
      const body = {
        name: ($('dks_name_' + id).value || '').trim(),
        office: $('dks_office_' + id).value,
        email: ($('dks_email_' + id).value || '').trim() || null,
        role: ($('dks_role_' + id).value || '本人').trim() || '本人',
        enabled: !!$('dks_en_' + id).checked,
        updated_at: new Date().toISOString()
      };
      if (!body.name) throw new Error('氏名は必須です');
      await sb('dakoku_staff?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body)
      });
      if (msg) msg.textContent = '職員「' + id + '」を保存しました';
    } catch (e) { if (msg) msg.textContent = e.message; else alert(e.message); }
  };

  g.dkaDelStaff = async function (id) {
    if (!confirm('職員「' + id + '」を削除しますか？（打刻履歴は残ります）')) return;
    try {
      await sb('dakoku_staff?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      await refresh();
    } catch (e) { alert(e.message); }
  };

  g.dkaAddStaff = async function () {
    const id = ($('dka_new_id').value || '').trim();
    const name = ($('dka_new_name').value || '').trim();
    const office = $('dka_new_office').value;
    if (!id || !name || !office) return alert('ID・氏名・所属が必要です');
    try {
      await sb('dakoku_staff', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ id, name, office, role: '本人', enabled: true })
      });
      await refresh();
    } catch (e) { alert(e.message); }
  };

  g.renderDakokuSettings = renderDakokuSettings;
})(typeof window !== 'undefined' ? window : globalThis);
