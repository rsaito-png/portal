/* PC拡大（2026-11-04 会長「ぜんぶ小さい」）: 幅960px以上で、全画面の小さい文字を一律に拡大し、狭い枠を広げる */
(function(){
  var mq=window.matchMedia('(min-width:960px)');
  function fix(root){
    if(!mq.matches||!root||root.nodeType!==1)return;
    var els=[root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    els.forEach(function(e){
      if(e.dataset&&e.dataset.pcs)return;
      var t=e.tagName;if(t==='SCRIPT'||t==='STYLE'||t==='SVG'||t==='svg'||t==='CANVAS'||t==='BR')return;
      var cs=getComputedStyle(e),fs=parseFloat(cs.fontSize);
      if(fs&&fs<30){var n=Math.max(30,Math.round(fs*2.2));if(n>48)n=48;e.style.setProperty('font-size',n+'px','important');}
      var mw=cs.maxWidth;if(mw&&/px$/.test(mw)){var w=parseFloat(mw);if(w>=400&&w<1100)e.style.setProperty('max-width','1200px','important');}
      if((t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||t==='BUTTON')&&e.type!=='checkbox'&&e.type!=='radio'){if(parseFloat(cs.height)<56)e.style.setProperty('min-height','60px','important');}
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
  mq.addEventListener&&mq.addEventListener('change',function(){location.reload();});
})();
