// 職員ポータルの「上に戻る」。保護者向けのページには読み込まない。
// 少し下へスクロールしたあと、右下の丸い ↑ を出す。押すとページの先頭へ戻る。
(function () {
  if (typeof document === 'undefined' || document.getElementById('to-top')) return;
  var css = document.createElement('style');
  css.id = 'to-top-css';
  css.textContent = [
    'html body #to-top{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:70;',
    'width:64px;height:64px;min-width:64px;min-height:64px;max-width:64px;margin:0;padding:0;box-sizing:border-box;',
    'border-radius:50% !important;border:3px solid #1a120c;background:var(--main,#2e6b4f);color:#fff8e8;',
    'font-size:32px;line-height:1;font-weight:800;font-family:inherit;box-shadow:3px 3px 0 #1a120c;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}',
    'html body #to-top[hidden]{display:none !important}',
    'html body #to-top:focus-visible{outline:3px solid #d4a945;outline-offset:3px}',
    '@media (min-width:900px){html body #to-top{width:80px;height:80px;min-width:80px;min-height:80px;max-width:80px;font-size:40px;right:24px;bottom:calc(24px + env(safe-area-inset-bottom,0px))}}',
    'html.th-yamen body.portal #to-top{background:linear-gradient(180deg,var(--ym-red-2,#a3201c),var(--ym-red,#7a1414));color:var(--ym-ivory,#f6ecd2);border:2px solid var(--ym-gold,#d4a945) !important;box-shadow:0 3px 0 #2a0505}',
    'body:has(#uk_fab:not([hidden])) #to-top{bottom:calc(88px + env(safe-area-inset-bottom,0px))}',
    'body:has(.ui-tabbar) #to-top{bottom:calc(88px + env(safe-area-inset-bottom,0px))}',
    '@media (min-width:900px){body:has(#uk_fab:not([hidden])) #to-top{bottom:calc(128px + env(safe-area-inset-bottom,0px))}}',
    '@media print{html body #to-top{display:none !important}}'
  ].join('');
  document.head.appendChild(css);
  var b = document.createElement('button');
  b.id = 'to-top';
  b.type = 'button';
  b.setAttribute('aria-label', '上に戻る');
  b.hidden = true;
  b.dataset.pcs = '1';
  b.innerHTML = '<span aria-hidden="true">↑</span>';
  b.addEventListener('click', function () {
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var top = document.getElementById('ttl') || document.querySelector('header') || document.body;
    if (top && top.focus) { try { top.setAttribute('tabindex', '-1'); top.focus({ preventScroll: true }); } catch (e) {} }
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  document.body.appendChild(b);
  var SHOW = 240;
  function place() {
    var y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    b.hidden = y < SHOW;
  }
  window.addEventListener('scroll', place, { passive: true });
  window.addEventListener('hashchange', function () { setTimeout(place, 0); });
  place();
})();
