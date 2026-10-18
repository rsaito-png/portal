// 書き出し。依存なし。seed(暦データ)+日記を結合して出力する。
window.Exporter=(function(){
  const dl=(name,mime,text)=>{const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\ufeff'+text],{type:mime+';charset=utf-8'}));
    a.download=name;document.body.appendChild(a);a.click();a.remove()};
  const rows=(diary)=>Object.keys(SEED.days).sort().map(d=>({date:d,...SEED.days[d],diary:(diary[d]&&diary[d].text)||''}));
  // 日記が暦に無い日付(将来の年)も失わないよう追加
  function allRows(diary){const r=rows(diary);Object.keys(diary).filter(d=>!SEED.days[d]).sort().forEach(d=>r.push({date:d,sign:'',dow:'',moon:'',ingress:'',voidtime:'',mars:'',diary:diary[d].text}));return r.sort((a,b)=>a.date<b.date?-1:1)}
  const csvq=s=>'"'+String(s||'').replace(/"/g,'""')+'"';
  return{
    csv(diary){const h=['date','sign','dow','moon','ingress','voidtime','mars','month_theme','mars_theme','diary'];
      dl('diary.csv','text/csv',[h.join(',')].concat(allRows(diary).map(r=>({...r,month_theme:(window.ThemeCtx?ThemeCtx.period(r.date):''),mars_theme:(window.ThemeCtx?ThemeCtx.mars(r.date):'')})).map(r=>h.map(k=>csvq(r[k])).join(','))).join('\r\n'))},
    md(diary,themes,dict){ // 1ファイルに日付ごと。日記のある日だけ。
      const out=['# 太陽カレンダー日記\n'];
      const pm=SEED.months.map(m=>`- ${m.sign}期 (${m.start}〜${m.end}): ${ThemeCtx.period(m.start)||'(未設定)'}`);
      out.push('## 当月のテーマ\n\n'+pm.join('\n')+'\n');
      const mk=Object.keys(SEED.days).sort().filter(k=>(SEED.days[k].mars||'').indexOf('【')>=0);
      out.push('## 火星テーマ\n\n'+mk.map(k=>`- ${k}〜 ${(SEED.days[k].mars.match(/【(.+?)】/)||[,''])[1]}: ${ThemeCtx.mars(k)||'(未設定)'}`).join('\n')+'\n');
      const dk=Object.keys(dict||{}).sort();if(dk.length)out.push('## マイ辞書\n\n'+dk.map(k=>`- ${k} → ${dict[k]}`).join('\n')+'\n');
      allRows(diary).filter(r=>r.diary).forEach(r=>{
        out.push(`## ${r.date}（${r.dow}）${r.sign}`);
        const meta=[r.moon&&`新月・満月: ${r.moon}`,r.ingress&&`月のイングレス: ${r.ingress}`,r.voidtime&&`ボイドタイム: ${r.voidtime}`].filter(Boolean);
        if(meta.length)out.push(meta.map(x=>'- '+x).join('\n'));
        out.push('\n'+r.diary+'\n')});
      dl('diary.md','text/markdown',out.join('\n'))},
    json(diary,themes,dict){dl('diary-backup.json','application/json',JSON.stringify({...diary,_themes:themes||{},_dict:dict||{}},null,1))},
    dict(dict){dl('dictionary.csv','text/csv',['wrong,right'].concat(Object.keys(dict||{}).sort().map(k=>csvq(k)+','+csvq(dict[k]))).join('\r\n'))}
  };
})();
