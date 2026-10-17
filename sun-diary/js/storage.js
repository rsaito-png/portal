// 保存層(Supabase REST直叩き・依存なし)。all/get/set/replaceAll は従来どおり async。
// 形式: { "YYYY-MM-DD": {text, updated} }
(function(){
  const C=window.APP_CONFIG, SK='diary.session', LK='diary.v1';
  const H=(tok)=>({apikey:C.SUPABASE_ANON_KEY,Authorization:'Bearer '+(tok||C.SUPABASE_ANON_KEY),'Content-Type':'application/json'});
  let sess=null; try{sess=JSON.parse(localStorage.getItem(SK)||'null')}catch(e){}
  const saveSess=s=>{sess=s;s?localStorage.setItem(SK,JSON.stringify(s)):localStorage.removeItem(SK)};
  const pack=j=>({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Math.floor(Date.now()/1000)+(j.expires_in||3600)-30,user:j.user});
  async function auth(path,body){
    const r=await fetch(C.SUPABASE_URL+'/auth/v1/'+path,{method:'POST',headers:H(),body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.msg||j.error_description||j.message||('HTTP '+r.status));
    return j;
  }
  async function token(){
    if(!sess) throw new Error('未ログイン');
    if(Date.now()/1000>sess.expires_at){
      try{saveSess(pack(await auth('token?grant_type=refresh_token',{refresh_token:sess.refresh_token})))}
      catch(e){saveSess(null);throw new Error('ログインの期限が切れました')}
    }
    return sess.access_token;
  }
  async function rest(method,qs,body,extra){
    const r=await fetch(C.SUPABASE_URL+'/rest/v1/'+C.TABLE+qs,{method,headers:{...H(await token()),...(extra||{})},body:body?JSON.stringify(body):undefined});
    if(!r.ok) throw new Error('保存先エラー '+r.status+' '+(await r.text()).slice(0,200));
    return r.status===204?null:r.json().catch(()=>null);
  }
  async function trest(method,qs,body,extra){
    const r=await fetch(C.SUPABASE_URL+'/rest/v1/sun_diary_themes'+qs,{method,headers:{...H(await token()),...(extra||{})},body:body?JSON.stringify(body):undefined});
    if(!r.ok) throw new Error('保存先エラー '+r.status+' '+(await r.text()).slice(0,200));
    return r.status===204?null:r.json().catch(()=>null);
  }
  async function drest(method,qs,body,extra){
    const r=await fetch(C.SUPABASE_URL+'/rest/v1/sun_diary_dict'+qs,{method,headers:{...H(await token()),...(extra||{})},body:body?JSON.stringify(body):undefined});
    if(!r.ok) throw new Error('保存先エラー '+r.status+' '+(await r.text()).slice(0,200));
    return r.status===204?null:r.json().catch(()=>null);
  }
  const toObj=rows=>{const o={};rows.forEach(r=>o[r.entry_date]={text:r.body,updated:r.updated_at});return o};
  const SupabaseStore={
    name:'Supabase',
    // --- 認証 ---
    isLoggedIn:()=>!!sess,
    email:()=>sess&&sess.user&&sess.user.email,
    async signIn(email,password){saveSess(pack(await auth('token?grant_type=password',{email,password})))},
    async signUp(email,password){
      if(!C.ALLOW_SIGNUP) throw new Error('新規登録は無効です');
      const j=await auth('signup',{email,password});
      if(j.access_token) saveSess(pack(j)); else throw new Error('確認メールを送りました。メール内のリンクを開いてからログインしてください');
    },
    signOut(){saveSess(null)},
    // --- データ ---
    async all(){return toObj(await rest('GET','?select=entry_date,body,updated_at&order=entry_date&limit=10000'))},
    async get(d){const r=await rest('GET','?select=entry_date,body,updated_at&entry_date=eq.'+d);return r&&r[0]?toObj(r)[d]:null},
    async set(d,text){
      if(text) await rest('POST','?on_conflict=user_id,entry_date',[{entry_date:d,body:text,updated_at:new Date().toISOString()}],{Prefer:'resolution=merge-duplicates,return=minimal'});
      else await rest('DELETE','?entry_date=eq.'+d,null,{Prefer:'return=minimal'});
    },
    async replaceAll(obj){
      const keep=Object.keys(obj).filter(d=>obj[d]&&obj[d].text);
      if(keep.length) await rest('POST','?on_conflict=user_id,entry_date',keep.map(d=>({entry_date:d,body:obj[d].text,updated_at:new Date().toISOString()})),{Prefer:'resolution=merge-duplicates,return=minimal'});
      const cur=Object.keys(await this.all()).filter(d=>!keep.includes(d));
      for(const d of cur) await this.set(d,'');
    },
    // --- テーマ(当月テーマ kind=period / 火星テーマ kind=mars)。形式 {"kind|key":"本文"} ---
    async themes(){const o={};let rows=null,err=null;
      for(let i=0;i<3&&rows===null;i++){try{rows=await trest('GET','?select=kind,key,body&limit=10000')||[]}catch(e){err=e;await new Promise(r=>setTimeout(r,400*(i+1)))}}
      if(rows===null){window.__themesFailed=true;try{return JSON.parse(localStorage.getItem('diary.themes')||'{}')}catch(_){return {}}}
      window.__themesFailed=false;
      rows.forEach(r=>o[r.kind+'|'+r.key]=r.body);
      // 空の結果で既存キャッシュを上書きしない
      if(Object.keys(o).length){try{localStorage.setItem('diary.themes',JSON.stringify(o))}catch(_){}}
      return o},
    async setTheme(kind,key,text){
      const q='?kind=eq.'+encodeURIComponent(kind)+'&key=eq.'+encodeURIComponent(key);
      // 空文字も「意図的に空にした」値として保存(既定値に戻すときは resetTheme)
      await trest('POST','?on_conflict=user_id,kind,key',[{kind,key,body:text,updated_at:new Date().toISOString()}],{Prefer:'resolution=merge-duplicates,return=minimal'});
    },
    async resetTheme(kind,key){await trest('DELETE','?kind=eq.'+encodeURIComponent(kind)+'&key=eq.'+encodeURIComponent(key),null,{Prefer:'return=minimal'})},
    async replaceThemes(obj){
      const ks=Object.keys(obj||{}).filter(k=>/^(period|mars)\|.+/.test(k)&&typeof obj[k]==='string');
      if(ks.length) await trest('POST','?on_conflict=user_id,kind,key',ks.map(k=>{const i=k.indexOf('|');return{kind:k.slice(0,i),key:k.slice(i+1),body:obj[k],updated_at:new Date().toISOString()}}),{Prefer:'resolution=merge-duplicates,return=minimal'});
      const cur=await this.themes();
      for(const k of Object.keys(cur)) if(!ks.includes(k)){const i=k.indexOf('|');await this.resetTheme(k.slice(0,i),k.slice(i+1))}
    },
    // --- マイ辞書 {wrong:right}。取得成功時はlocalStorageにキャッシュ、失敗時はキャッシュを返す ---
    async dict(){
      try{const o={};(await drest('GET','?select=wrong,right&limit=10000')||[]).forEach(r=>o[r.wrong]=r.right);localStorage.setItem('diary.dict',JSON.stringify(o));return o}
      catch(e){try{return JSON.parse(localStorage.getItem('diary.dict')||'{}')}catch(_){return {}}}
    },
    async setDict(wrong,right){await drest('POST','?on_conflict=user_id,wrong',[{wrong,right,updated_at:new Date().toISOString()}],{Prefer:'resolution=merge-duplicates,return=minimal'})},
    async delDict(wrong){await drest('DELETE','?wrong=eq.'+encodeURIComponent(wrong),null,{Prefer:'return=minimal'})},
    async replaceDict(obj){
      const ks=Object.keys(obj||{}).filter(k=>k&&typeof obj[k]==='string');
      if(ks.length) await drest('POST','?on_conflict=user_id,wrong',ks.map(k=>({wrong:k,right:obj[k],updated_at:new Date().toISOString()})),{Prefer:'resolution=merge-duplicates,return=minimal'});
      const cur=await drest('GET','?select=wrong&limit=10000')||[];
      for(const r of cur) if(!ks.includes(r.wrong)) await this.delDict(r.wrong);
    },
    // 初回取り込み: クラウドが空のときだけ、端末内の日記+seedの日記を投入
    async importIfEmpty(seedDays){
      const cur=await this.all(); if(Object.keys(cur).length) return 0;
      let loc={}; try{loc=JSON.parse(localStorage.getItem(LK)||'{}')}catch(e){}
      const m={}; for(const [d,v] of Object.entries(seedDays||{})) if(v.diary) m[d]={text:v.diary};
      for(const [d,v] of Object.entries(loc)) if(v&&v.text) m[d]={text:v.text};
      await this.replaceAll(m); return Object.keys(m).length;
    }
  };
  window.Store=SupabaseStore;
})();
