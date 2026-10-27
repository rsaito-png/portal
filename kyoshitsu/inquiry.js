// 申し込み文面。サーバーには送らない。電話とショートメッセージのリンクだけを作る。
function kyoshitsuInquiry(input) {
  const name = String((input && input.name) || '').replace(/\s+/g, ' ').trim();
  const purpose = input && (input.purpose === '申し込み' || input.purpose === '問い合わせ') ? input.purpose : '';
  const note = String((input && input.note) || '').trim().slice(0, 400);
  const errors = [];
  if (!name) errors.push('お名前を入れてください。');
  else if (name.length > 80) errors.push('お名前は80字以内にしてください。');
  if (!purpose) errors.push('申し込みか、問い合わせかを選んでください。');
  const lines = ['AIエージェントを教える教室への' + (purpose || '連絡'), 'お名前: ' + name];
  if (note) lines.push('内容: ' + note);
  const text = lines.join('\n');
  const digits = '09067082837';
  const body = encodeURIComponent(text);
  return {
    ok: errors.length === 0,
    errors: errors,
    text: text,
    phone: '090-6708-2837',
    tel: 'tel:' + digits,
    smsIos: 'sms:' + digits + '&body=' + body,
    smsOther: 'sms:' + digits + '?body=' + body,
  };
}

function kyoshitsuSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const form = document.getElementById('inquiry');
  const err = document.getElementById('inquiry-errors');
  const done = document.getElementById('inquiry-done');
  if (!form || !err || !done) return false;
  const data = new FormData(form);
  const result = kyoshitsuInquiry({
    name: data.get('name'),
    purpose: data.get('purpose'),
    note: data.get('note'),
  });
  err.replaceChildren();
  if (!result.ok) {
    done.hidden = true;
    result.errors.forEach(function (msg) {
      const li = document.createElement('li');
      li.textContent = msg;
      err.appendChild(li);
    });
    err.hidden = false;
    err.focus();
    err.scrollIntoView({ block: 'center' });
    return false;
  }
  err.hidden = true;
  document.getElementById('inquiry-text').textContent = result.text;
  const tel = document.getElementById('inquiry-tel');
  tel.href = result.tel;
  tel.textContent = result.phone + ' に電話する';
  const sms = document.getElementById('inquiry-sms');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  sms.href = ios ? result.smsIos : result.smsOther;
  done.hidden = false;
  done.focus();
  done.scrollIntoView({ block: 'center' });
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { kyoshitsuInquiry: kyoshitsuInquiry };
}
