// node tests/ht_manual_check.js — DOMなしで画面・保存payload・権限制御を確認
const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
const calls = [], alerts = [];
const ctx = vm.createContext({console, Date, esc:x=>String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), alert:x=>alerts.push(x), confirm:()=>true,
 sb:async(path,opt)=>{calls.push({path,opt});return [{id:'saved'}];}});
vm.runInContext(fs.readFileSync('ht.js','utf8') + '\nglobalThis.state=HT;globalThis.config=HT_EDIT;globalThis.htEditable=htEditable; htModal=(title,fields,save)=>{globalThis.form={title,fields,save}};htRefresh=async()=>{};',ctx);
const D = {isAll:true, me:'owner@example.test',off:[{id:'o1',name:'事業所',types:['全事業']}], allOff:[{id:'o1',name:'事業所',types:['全事業']}], editOffs:['o1'], tr:[{id:'t1',name:'研修',months:[4],active:true,target_types:['全事業']}],staff:[{id:'s1',name:'職員',email:null}],ev:[{id:'e1',name:'訓練'}],com:[{id:'c1',name:'委員会'}],plan:[],mat:[],qs:[],acc:[{email:'owner@example.test',office_id:null,can_edit:true}],rec:[{id:'r1',training_id:'t1',staff_id:'s1',staff_name:'職員',training_name:'研修',offices:['o1'],taken_at:'2026-11-07T03:00:00Z',fy:2026,passed:'参加',impression:'旧内容'}],evl:[{id:'e-log',event_id:'e1',office_id:'o1',done_on:'2026-11-07',result:'実施'}],cl:[{id:'c-log',committee_id:'c1',office_ids:['o1'],held_at:'2026-11-07T03:00:00Z',decisions:'決定'}]};
ctx.state.D=D;ctx.state.fy=2026;
const values=()=>Object.fromEntries(ctx.form.fields.map(f=>[f.k,f.val ?? (f.type==='checks'?[]:'')]));
(async()=>{
 assert.match(ctx.htMasterLists(),/研修マスタを管理/);
 for(const key of ['rec','evl','cl']) assert.match(ctx.htLogList(key),/編集/);
 for(const key of Object.keys(ctx.config)) {ctx.htEditForm(key, D[key].length?0:undefined);assert.ok(ctx.form.fields.length,key);}
 ctx.htEditForm('tr',0);assert.ok(!ctx.form.fields.some(f=>f.k==='id'));let v=values();v.months=['5','11'];v.name='変更';await ctx.form.save(v);let body=JSON.parse(calls.at(-1).opt.body);assert.deepEqual(body.months,[5,11]);assert.equal(body.active,true);
 ctx.htEditForm('rec',0);v=values();v.impression='訂正';await ctx.form.save(v);body=JSON.parse(calls.at(-1).opt.body);assert.equal(body.taken_at,'2026-11-07T12:00:00+09:00');assert.equal(body.impression,'訂正');assert.ok(!('evidence' in body));
 ctx.htEditForm('acc',0);v=values();v.can_edit='false';await assert.rejects(ctx.form.save(v),/自分/);
 assert.throws(()=>ctx.htAccessCheck({...D.acc[0],email:'other@example.test'},null),/最後/);
 D.isAll=false;assert.equal(ctx.htEditable('tr',D.tr[0]),false);assert.equal(ctx.htEditable('rec',D.rec[0]),true);assert.equal(ctx.htEditable('rec',D.rec[0],true),false);
 D.rec[0].confirmed_at='2026-11-07';assert.equal(ctx.htEditable('rec',D.rec[0]),false);assert.equal(ctx.htEditable('cl',{office_ids:['o1','o2']}),false);assert.equal(ctx.htEditable('evl',D.evl[0]),true);
 D.isAll=true;ctx.confirm=()=>false;const n=calls.length;await ctx.htDeleteRow('evl',0);assert.equal(calls.length,n);
 ctx.confirm=()=>true;await ctx.htDeleteRow('evl',0);assert.equal(calls.at(-1).opt.method,'DELETE');
 console.log('PASS: 手動編集、月、日時、権限、管理者保護、削除確認');
})().catch(e=>{console.error(e);process.exitCode=1});
