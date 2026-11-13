/* PC拡大（2026-11-04 会長「ぜんぶ小さい」）: 幅960px以上で、全画面の小さい文字を一律に拡大し、狭い枠を広げる */
(function(){
  var mq=window.matchMedia('(min-width:960px)');
  // 元の値を覚えておき、狭くなったら戻す（2026-11-12 画面幅が変わったときの再読み込みをやめた。入力中のフォームが消えるため）
  var orig=new WeakMap();
  function put(e,p,v){var o=orig.get(e);if(!o){o=[];orig.set(e,o);}o.push([p,e.style.getPropertyValue(p),e.style.getPropertyPriority(p)]);e.style.setProperty(p,v,'important');}
  function undo(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-pcs]'),function(e){
      var o=orig.get(e);if(o){o.reverse().forEach(function(x){if(x[1])e.style.setProperty(x[0],x[1],x[2]);else e.style.removeProperty(x[0]);});orig.delete(e);}
      delete e.dataset.pcs;
    });
  }
  function fix(root){
    if(!mq.matches||!root||root.nodeType!==1)return;
    var els=[root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    els.forEach(function(e){
      if(e.dataset&&e.dataset.pcs)return;
      // 児童別表示と型表などの入力表（.sheet-scroll）は拡大しない。型表は全画面でも右端まで1画面に収める（2026-11-13）。児童別表示は印刷様式の大きさのまま（狭い画面でも10列が読めるように、ここでは拡大しない）
      if(e.closest&&e.closest('.jd,.sheet-scroll')){if(e.dataset)e.dataset.pcs='1';return;}
      var t=e.tagName;if(t==='SCRIPT'||t==='STYLE'||t==='SVG'||t==='svg'||t==='CANVAS'||t==='BR')return;
      var cs=getComputedStyle(e),fs=parseFloat(cs.fontSize);
      if(fs&&fs<30){var n=Math.max(30,Math.round(fs*2.2));if(n>48)n=48;put(e,'font-size',n+'px');}
      var mw=cs.maxWidth;if(mw&&/px$/.test(mw)){var w=parseFloat(mw);if(w>=400&&w<1100)put(e,'max-width','1200px');}
      if((t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||t==='BUTTON')&&e.type!=='checkbox'&&e.type!=='radio'){if(parseFloat(cs.height)<56)put(e,'min-height','60px');}
      if(e.dataset)e.dataset.pcs='1';
    });
  }
  function run(){fix(document.body);}
  var pend=false;
  new MutationObserver(function(ms){
    if(!mq.matches||pend)return;pend=true;
    requestAnimationFrame(function(){pend=false;ms.forEach(function(m){m.addedNodes.forEach(fix);});});
  }).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  mq.addEventListener&&mq.addEventListener('change',function(){if(mq.matches)run();else undo();});
})();
