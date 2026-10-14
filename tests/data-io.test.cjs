const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({Date,structuredClone});
for(const file of ['test-data.js','data-io.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const io=ctx.DataIO,day='2030-04-04';
const db=vm.runInContext("(()=>{const d={employees:[],items:[],loans:[],reservations:[]};addTestData(d,'2030-04-04');return d;})()",ctx);
const json=io.exportJSON(db,'test',day),imported=io.importJSON(json,day);
for(const key of ['employees','items','loans','reservations'])assert.equal(JSON.stringify(imported.data[key]),JSON.stringify(db[key]));
assert.equal(imported.mode,'test');assert.ok(!('recordsArchiveV1' in imported.data));
assert.throws(()=>io.importJSON('{bad',day),/JSON/);
assert.throws(()=>io.importJSON('{"employees":[]}',day),/バージョン/);
for(const mutate of [
 d=>d.items[1].id=d.items[0].id,
 d=>d.loans[0].employeeId=99999,
 d=>d.loans[0].dueDate=null,
 d=>d.loans[0].returnDate='2020-01-01',
 d=>d.loans[0].lendDate='2099-01-01',
 d=>d.reservations[0].dueDate='2020-01-01',
 d=>d.reservations.push({...d.reservations[0],id:9999}),
 d=>d.reservations.find(r=>r.loanId).loanId=999999,
 d=>d.loans.push({...d.loans[0],id:99999})
]){const bad=structuredClone(db);mutate(bad);assert.throws(()=>io.importJSON(io.exportJSON(bad,'test',day),day));}
const multiline=[['名前','モデル番号'],['あ,い','A"B'],['改行\nあり','']];
const text='\uFEFF名前,モデル番号\r\n"あ,い","A""B"\r\n"改行\nあり",\r\n';
assert.equal(JSON.stringify(io.parseCSV(text)),JSON.stringify(multiline));
assert.throws(()=>io.parseCSV('名前\n"未終了'),/引用符/);
assert.throws(()=>io.parseCSV('名前\n"終端"x'),/引用符/);
const empty={employees:[],items:[],loans:[],reservations:[]};
let plan=io.importCSV('社員ID,名前\n99,新社員\n100,新社員\n','employees',empty);
assert.equal(plan.added.length,1);assert.equal(plan.skipped,1);assert.ok(!('id'in plan.added[0]));
assert.throws(()=>io.importCSV('名前\n既存\n','employees',{...empty,employees:[{id:1,name:'既存'}]}),/登録済み/);
plan=io.importCSV('物品ID,製品名,モデル番号\n999,同じ製品,M1\n1000,同じ製品,M1\n','items',empty);
assert.equal(plan.added.length,2);assert.ok(!('id'in plan.added[0]));
assert.equal(io.importCSV('name\n製品\n','items',empty).added[0].model,'');
assert.throws(()=>io.importCSV('製品名,モデル番号\n,M1\n','items',empty),/空欄/);
assert.throws(()=>io.importCSV('製品名,モデル番号\n品,M1,余分\n','items',empty),/列数/);
assert.throws(()=>io.importCSV('製品名,製品名\n品,品\n','items',empty),/見出し/);
assert.throws(()=>io.importCSV('製品名\n'+ '長'.repeat(101),'items',empty),/100文字/);
assert.throws(()=>io.importCSV('不明\n品\n','items',empty),/見出し/);
const formula={...empty,employees:[{id:1,name:'=SUM(1,2)'},{id:2,name:' @攻撃'}]};
const csv=io.exportCSV(formula,'employees');
assert.ok(csv.startsWith('\uFEFF'));assert.equal(io.parseCSV(csv)[1][1],"'=SUM(1,2)");assert.ok(io.parseCSV(csv)[2][1].startsWith("'"));
for(const type of ['employees','items','loans','reservations']){
 const rows=io.parseCSV(io.exportCSV(db,type));assert.equal(rows.length,db[type].length+1);
}
console.log('PASS: JSON roundtrip, corrupt data rejection, CSV BOM/quotes/newlines, duplicates, required fields, IDs, length and spreadsheet formula protection');
