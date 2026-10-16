/* 署名欄（iPhone対応）。居宅介護GAS Code v11.7 の署名ページの描画部分を、ポータル用に独立させたもの。
   使い方: const pad = createSignPad(document.getElementById('cv'));
           pad.clear(); pad.isDrawn(); pad.toDataURL();  // PNG
   canvas の親要素に高さを付け、canvas は width:100%;height:100%;display:block;touch-action:none にする。
   ページ全体に html,body{overscroll-behavior:none} と、署名欄まわりに
   -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent を付ける。 */
function createSignPad(cv) {
  var ctx = cv.getContext('2d'), drawn = false, down = false, last = null, W = window;
  var hasPE = !!W.PointerEvent;
  function fit() {
    var r = cv.getBoundingClientRect(), k = W.devicePixelRatio || 1;
    cv.width = r.width * k; cv.height = r.height * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    drawn = false;
  }
  function remeasure() {
    var r = cv.getBoundingClientRect();
    if (!cv.width || Math.abs(cv.width / (W.devicePixelRatio || 1) - r.width) > 2) fit();
  }
  function tp(e) {
    var t = (e.touches && e.touches.length ? e.touches[0] : (e.changedTouches && e.changedTouches[0])) || e;
    return { x: t.clientX, y: t.clientY };
  }
  function begin(x, y) {
    remeasure(); down = true;
    var r = cv.getBoundingClientRect();
    last = { x: x - r.left, y: y - r.top };
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.3, 0, 6.3); ctx.fillStyle = '#000'; ctx.fill();
    drawn = true;
  }
  function seg(x, y) {
    var r = cv.getBoundingClientRect(), p = { x: x - r.left, y: y - r.top };
    if (!last) last = p;
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; drawn = true;
  }
  function stop() { down = false; last = null; }
  if (hasPE) {
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      begin(e.clientX, e.clientY);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!down) return; e.preventDefault();
      var a = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (a.length) { for (var i = 0; i < a.length; i++) seg(a[i].clientX, a[i].clientY); }
      else seg(e.clientX, e.clientY);
    });
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('lostpointercapture', stop);
  }
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); var p = tp(e); begin(p.x, p.y); }, { passive: false });
  W.addEventListener('touchmove', function (e) { if (!down) return; e.preventDefault(); var p = tp(e); seg(p.x, p.y); }, { passive: false });
  W.addEventListener('touchend', stop, { passive: false });
  W.addEventListener('touchcancel', stop, { passive: false });
  if (!hasPE) {
    cv.addEventListener('mousedown', function (e) { begin(e.clientX, e.clientY); });
    W.addEventListener('mousemove', function (e) { if (down) seg(e.clientX, e.clientY); });
    W.addEventListener('mouseup', stop);
  }
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  fit();
  return { clear: fit, isDrawn: function () { return drawn; }, toDataURL: function () { return cv.toDataURL('image/png'); }, remeasure: remeasure };
}
