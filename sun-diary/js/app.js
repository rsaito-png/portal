(async function(){
const $=id=>document.getElementById(id);
// ログインゲート: ログインするまで日記を読み込まない
async function gate(){
  if(Store.isLoggedIn()) return;
  const dl=$('login'); $('doSignup').style.display=APP_CONFIG.ALLOW_SIGNUP?'':'none';
  dl.addEventListener('cancel',e=>e.preventDefault()); dl.showModal();
  await new Promise(res=>{
    const go=async fn=>{ $('lstatus').textContent='処理中…';
      try{await fn($('em').value.trim(),$('pw').value); dl.close(); res()}catch(x){$('lstatus').textContent=x.message} };
    $('doLogin').onclick=()=>go((e,p)=>Store.signIn(e,p));
    $('doSignup').onclick=()=>go((e,p)=>Store.signUp(e,p));
  });
}
await gate();
$('logout').onclick=()=>{Store.signOut();location.reload()};
const M=SEED.months, DOW=['日','月','火','水','木','金','土'];
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayS=ymd(new Date());
let diary={}, mi=0, cur=null;
try{diary=await Store.all()}catch(e){Store.signOut();location.reload()}
const monthOf=d=>{const i=M.findIndex(m=>d>=m.start&&d<=m.end);return i<0?0:i};
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
let themes={}; try{themes=await Store.themes()}catch(e){console.error(e)}
let dict={}; try{dict=await Store.dict()}catch(e){console.error(e)}
window.__dict=()=>dict;
const dayText=d=>(diary[d]&&diary[d].text)||'';
try{ const n=await Store.importIfEmpty(Object.fromEntries(Object.entries(SEED.days).map(([d,v])=>[d,{diary:v.diary}]))); if(n) diary=await Store.all(); }catch(e){console.error(e)}
function marsPeriod(ref){ // ref日時点の火星期間 {key(開始日), text(seed由来)}
  let per=null,pk=null; for(const k of Object.keys(SEED.days).sort()){ if(k>ref) break; if((SEED.days[k].mars||'').indexOf('【')>=0){per=SEED.days[k].mars;pk=k} }
  return per?{key:pk,text:per}:null;
}
function refDate(){const m=M[mi];return cur&&cur>=m.start&&cur<=m.end?cur:(todayS>=m.start&&todayS<=m.end?todayS:m.start)}
const seedMarsTheme=per=>per.split('\n').map(x=>x.trim()).filter(Boolean).filter(x=>x.startsWith('テーマ:')).map(x=>x.replace(/^テーマ:\s*/,'')).join(' ');
const periodTheme=m=>('period|'+m.start) in themes?themes['period|'+m.start]:(m.theme||'');
const marsTheme=p=>('mars|'+p.key) in themes?themes['mars|'+p.key]:seedMarsTheme(p.text);
window.ThemeCtx={period:d=>periodTheme(M[monthOf(d)]),mars:d=>{const p=marsPeriod(d);return p?marsTheme(p):''}};
let marsOpen=false;
function renderMars(){
  const keys=Object.keys(SEED.days).sort(), m=M[mi];
  const ref=refDate(); const mp=marsPeriod(ref), per=mp&&mp.text;
  const el=$('marsbar'); if(!per){el.textContent='';return}
  const L=per.split('\n').map(x=>x.trim()).filter(Boolean);
  const mm=L[0].match(/【(.+?)】/); let name=mm?mm[1]:L[0]; const rest=L[0].replace(/【.+?】/,'').trim();
  let range=''; const rg=L.slice(1).find(x=>/^\(.*\)$/.test(x))||(rest&&/^\(.*\)$/.test(rest)?rest:'')||rest; range=rg;
  const th=marsTheme(mp); const hs=houseText((name.match(/(水瓶|魚|牡羊|牡牛|双子|蟹|獅子|乙女|天秤|蠍|射手|山羊)座/)||[''])[0]);
  let nx=''; for(const k of keys){ if(k<=ref) continue; const v=SEED.days[k]; if(v.marsIng){ const d=parse(k); nx=`${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]}) ${v.marsIng_t||''}`; nx=`${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]}) ${v.marsIng}`; break; } }
  const uth=('mars|'+mp.key) in themes?themes['mars|'+mp.key]:'';
  const hn=hs?hs.split(':')[0]:''; const warn=!!window.__themesFailed;
  const head=`<span class="mh"><span class="mt"><b>♂ 火星:</b> ${esc(name)}${esc(range)}${hn?'（'+esc(hn)+'）':''}${warn?' <span class="mw" title="保存テーマの読み込みに失敗">⚠</span>':''}</span><span class="mar">${marsOpen?'▲':'▼'}</span></span>`;
  el.classList.toggle('open',marsOpen);
  if(!marsOpen){el.innerHTML=head;return}
  el.innerHTML=head+(hs?`<span class="mhs">${esc(hs)}</span>`:'')+(uth?`<span class="mu">${esc(uth)}</span>`:'')+(warn?`<span class="nx">⚠ 保存テーマの読み込みに失敗しました(端末内の控えを表示中)。再読み込みしてください。</span>`:'')+(nx?`<span class="nx">次の火星イングレス: ${esc(nx)}（日本時間）</span>`:'')+`<button type="button" class="medit" id="marsedit">✏ 編集</button>`;
}
const HOUSES=['水瓶座','魚座','牡羊座','牡牛座','双子座','蟹座','獅子座','乙女座','天秤座','蠍座','射手座','山羊座'];
const HTHEME=['自己・身体・第一印象・始まり','お金・所有・才能・価値観','コミュニケーション・学習・兄弟・近距離移動','家・家族・ルーツ・不動産・心の基盤','創造・恋愛・娯楽・子ども・自己表現','仕事・健康・日課・奉仕','パートナーシップ・結婚・契約・対人関係','共有資産・遺産・深い絆・変容・性・死と再生','高等教育・哲学・宗教・海外・出版・長旅','キャリア・社会的地位・天職・評判','友人・仲間・コミュニティ・希望・未来のビジョン','潜在意識・隠れたこと・内省・孤独・スピリチュアル・癒し'];
function houseText(sign){const i=HOUSES.indexOf(sign);return i<0?'':(i+1)+'ハウス:'+HTHEME[i]}
function render(){
  const m=M[mi]; $('sign').innerHTML=esc(m.sign+'期')+'<span class="hs">（'+esc(houseText(m.sign))+'）</span>';
  $('range').textContent=m.start.replace(/-/g,'/')+' 〜 '+m.end.replace(/-/g,'/');
  {const t=periodTheme(m);$('theme').textContent=t?'当月のテーマ: '+t:'当月のテーマ: （タップして入力）'}
  renderMars();
  $('dows').innerHTML=DOW.map(d=>`<div class="dow">${d}</div>`).join('');
  const g=$('grid'); g.innerHTML='';
  const s=parse(m.start), e=parse(m.end);
  for(let i=0;i<s.getDay();i++) g.insertAdjacentHTML('beforeend','<div class="cell empty"></div>');
  for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)){
    const k=ymd(d), v=SEED.days[k]||{}, w=d.getDay();
    const b=document.createElement('button');
    b.className='cell'+(dayText(k)?' has':'')+(k===todayS?' today':'')+((v.moon||'').startsWith('🌑')?' nm':'')+(w==0?' sun':w==6?' sat':'');
    const ev=moonIcon((v.moon||'').split(' ')[0]);
    b.innerHTML=`<span class="n">${d.getMonth()+1}/${d.getDate()}</span><span class="m">${ev}</span>`+
      (v.ingress?`<span class="g">☽${v.ingress.replace(/\s*/,'')}</span>`:'')+(v.voidtime?`<span class="g">V ${v.voidtime}</span>`:'')+((v.marsIng||v.marsStn)?`<span class="g mi">♂${esc(v.marsIng||v.marsStn)}</span>`:'');
    b.onclick=()=>openDay(k); g.appendChild(b);
  }
  $('prev').disabled=mi==0; $('next').disabled=mi==M.length-1;
}
function moonIcon(t){return t==='🌑'?'<i class="newmoon"></i>':t==='🌕'?'<i class="fullmoon"></i>':t}
function moonLine(t){return esc(t).replace(/^🌑/,'<i class="newmoon"></i>').replace(/^🌕/,'<i class="fullmoon"></i>')}
// 月の滞在サイン: ingress欄(「HH:MM 星座」=その時刻に入る/「星座」=終日滞在)を日付順に追って導出
const MOONSIGN=(()=>{const o={};let prev='';Object.keys(SEED.days).sort().forEach(k=>{
  const g=String(SEED.days[k].ingress||'').match(/^(?:(\d{1,2}:\d{2})\s+)?(\S+座)/);if(!g){o[k]=null;return}
  o[k]=g[1]?{from:prev||null,to:g[2],at:g[1]}:{to:g[2]};prev=g[2]});return o})();
function moonHouseLine(k){const m=MOONSIGN[k];if(!m)return '';const h=s=>s+'('+houseText(s)+')';
  return m.at?(m.from?h(m.from)+'→':'')+m.to+' '+m.at+'〜'+'('+houseText(m.to)+')':h(m.to)}
// ポップアップタイトル用の月星座: 終日は滞在サイン、イングレス日は変更前→変更後
function moonSignLabel(k){const m=MOONSIGN[k];if(!m)return '';return m.at&&m.from?m.from+'→'+m.to:(m.to||'')}
function openDay(k){
  cur=k; const v=SEED.days[k]||{}, d=parse(k);
  $('dtitle').textContent=`${d.getMonth()+1}月${d.getDate()}日（${DOW[d.getDay()]}）${moonSignLabel(k)}`;
  const L=[['新月・満月',v.moon],['🌙 月のハウス',moonHouseLine(k)],['月のイングレス',v.ingress],['ボイドタイム',v.voidtime],['♂ 火星イングレス',v.marsIng&&'火星イングレス '+v.marsIng+'（日本時間）'],['♂ 火星の動き',v.marsStn],['火星テーマ',v.mars]].filter(x=>x[1]);
  $('dinfo').innerHTML=L.length?L.map(x=>`<span>${x[0]}</span> ${x[0]==='新月・満月'?moonLine(x[1]):esc(x[1])}`).join('\n'):'<span>この日の天体情報はありません</span>';
  $('ta').value=dayText(k); $('vstatus').textContent=''; stopMic();
  if(!$('dlg').open) $('dlg').showModal();
}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function save(){await Store.set(cur,$('ta').value.trim()); diary=await Store.all(); render();
  $('vstatus').textContent='保存しました '+new Date().toLocaleTimeString('ja-JP')}
function step(n){const d=parse(cur);d.setDate(d.getDate()+n);const k=ymd(d);if(!SEED.days[k])return;save().then(()=>{mi=monthOf(k);render();openDay(k)})}
// 音声入力 (Web Speech API)。日記とテーマ編集で共用するファクトリ
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
// マイ辞書: 誤表記→正表記を長い語から順に置換(確定文のみ)
function applyDict(x,d){const ks=Object.keys(d||{}).filter(Boolean).sort((p,q)=>q.length-p.length);for(const k of ks)x=x.split(k).join(d[k]);return x}
window.applyDict=applyDict;
function punct(x){return x&&!/[。．.、，,！？!?…」』）)]$/.test(x)?x+'。':x} // 文末に句点を自動付与(既に句読点等があれば付けない)
function makeMic(btn,ta,st){
  let rec=null, base='';
  function stop(){if(rec){try{rec.stop()}catch(e){}rec=null}btn.classList.remove('on');btn.textContent='🎤 音声入力'}
  btn.onclick=()=>{
    if(rec){stop();return}
    if(!SR){st.textContent='このブラウザは音声認識に未対応です（Chrome/Safariで開いてください。キーボードのマイクも使えます）';return}
    let want=true, lastFin=''; base=ta.value;
    const begin=()=>{
      const r0=new SR(); rec=r0; r0.lang='ja-JP'; r0.interimResults=true; r0.continuous=false; let sf='';
      r0.onresult=ev=>{let fin='',raw='',it='';
        for(let i=0;i<ev.results.length;i++){const r=ev.results[i];if(r.isFinal){const x=r[0].transcript.trim();raw+=x;fin+=punct(applyDict(x,dict))}else it=r[0].transcript}
        if(raw&&raw===lastFin){fin='';raw=''}
        sf=raw; const t=fin+it;
        ta.value=base+(t&&base&&!base.endsWith('\n')?'\n':'')+t};
      r0.onerror=ev=>{if(ev.error==='no-speech'||ev.error==='aborted')return;want=false;st.textContent='音声認識エラー: '+ev.error+(ev.error==='not-allowed'?'（マイクの許可が必要です）':'')};
      r0.onend=()=>{if(rec!==r0)return; base=ta.value; stop(); if(!st.textContent.startsWith('音声認識エラー'))st.textContent='音を鳴らさないにはスマホの音量(メディア/通知)を下げるか消音にしてください。続けて話すときは🎤を押し直してください。'};
    };
    begin();
    rec.start(); btn.classList.add('on'); btn.textContent='⏹ 停止'; st.textContent='聞いています…（音を鳴らさないにはスマホの音量(メディア/通知)を下げるか消音に）';
  };
  return stop;
}
const stopMic=makeMic($('mic'),$('ta'),$('vstatus'));
const stopTMic=makeMic($('tmic'),$('tta'),$('tstatus'));
// 辞書
function renderDict(){const ks=Object.keys(dict).sort();$('dlist').innerHTML=ks.length?ks.map(k=>`<div class="drow"><span>${esc(k)} → ${esc(dict[k])}</span><button class="b" data-k="${esc(k).replace(/"/g,'&quot;')}">削除</button></div>`).join(''):'<div class="info">まだ登録がありません</div>';
  $('dlist').querySelectorAll('button').forEach(b=>b.onclick=async()=>{const k=b.getAttribute('data-k');try{await Store.delDict(k);dict=await Store.dict();renderDict()}catch(x){$('dstatus').textContent=x.message}})}
$('dictBtn').onclick=()=>{$('dstatus').textContent='';renderDict();$('ddlg').showModal()};
$('dadd').onclick=async()=>{const w=$('dw').value.trim(),r=$('dr').value.trim();if(!w||!r){$('dstatus').textContent='誤表記と正表記の両方を入れてください';return}
  try{await Store.setDict(w,r);dict=await Store.dict();$('dw').value='';$('dr').value='';$('dstatus').textContent='登録しました';renderDict()}catch(x){$('dstatus').textContent=x.message}};
$('dex').onclick=()=>Exporter.dict(dict);
$('dclose').onclick=()=>$('ddlg').close();
// テーマ編集
let tedit=null; // {kind,key,def}
function openTheme(kind,key,title,val,def){tedit={kind,key,def};$('ttitle').textContent=title;$('tta').value=val;$('tstatus').textContent='';stopTMic();if(!$('tdlg').open)$('tdlg').showModal()}
$('theme').onclick=()=>{const m=M[mi];openTheme('period',m.start,m.sign+'期 当月のテーマ',periodTheme(m),m.theme||'')};
function editMars(){const p=marsPeriod(refDate());if(!p)return;const L=p.text.split('\n').map(x=>x.trim()).filter(Boolean);
  openTheme('mars',p.key,'♂ 火星テーマ '+L[0].replace(/[【】]/g,''),(('mars|'+p.key) in themes?themes['mars|'+p.key]:''),'')}
$('marsbar').onclick=e=>{if(e.target.closest('#marsedit')){editMars();return}marsOpen=!marsOpen;renderMars()};
$('tsave').onclick=async()=>{try{$('tstatus').textContent='保存中…';await Store.setTheme(tedit.kind,tedit.key,$('tta').value.trim());themes=await Store.themes();stopTMic();$('tdlg').close();render()}catch(x){$('tstatus').textContent=x.message}};
$('treset').onclick=async()=>{try{await Store.resetTheme(tedit.kind,tedit.key);themes=await Store.themes();stopTMic();$('tdlg').close();render()}catch(x){$('tstatus').textContent=x.message}};
$('tcancel').onclick=()=>{stopTMic();$('tdlg').close()};
$('save').onclick=save; $('close').onclick=()=>{stopMic();$('dlg').close()};
$('dprev').onclick=()=>step(-1); $('dnext').onclick=()=>step(1);
$('prev').onclick=()=>{mi--;render()}; $('next').onclick=()=>{mi++;render()};
$('today').onclick=()=>{mi=monthOf(todayS);render()};
$('exMd').onclick=()=>Exporter.md(diary,themes,dict); $('exCsv').onclick=()=>Exporter.csv(diary); $('exJson').onclick=()=>Exporter.json(diary,themes,dict);
$('imp').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{const o=JSON.parse((await f.text()).replace(/^\ufeff/,''));if(!confirm('現在の日記をこのファイルの内容で置き換えます。よろしいですか？'))return;
    const th=o._themes,dc=o._dict;delete o._themes;delete o._dict;await Store.replaceAll(o);if(th)await Store.replaceThemes(th);if(dc)await Store.replaceDict(dc);diary=await Store.all();themes=await Store.themes();dict=await Store.dict();render();$('gstatus').textContent='読み込みました'}catch(x){$('gstatus').textContent='読み込み失敗: '+x.message}};
$('gstatus').textContent='保存先: '+Store.name+'（'+Store.email()+'）';
mi=monthOf(todayS); render();
})();
