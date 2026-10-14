const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ Date, structuredClone });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'test-data.js'), 'utf8'), context);
const db = vm.runInContext("(() => { const d={employees:[],items:[],loans:[],reservations:[]}; addTestData(d,'2030-04-04'); return d; })()", context);
vm.runInContext('validateDatabase', context)(db);
assert.equal(new Set(db.employees.map(p => p.name)).size, db.employees.length, '社員名は現行登録画面から追加できる一意な名前');
for (const p of db.items) {
  assert.ok(p.name.trim() && p.name.length <= 100, '製品名の必須・文字数');
  assert.ok(p.model.length <= 100, 'モデル番号の文字数');
}
for (const l of db.loans) {
  assert.ok(l.dueDate && l.dueDate >= l.lendDate, '返却予定日は必須で貸出日以降');
  assert.ok(l.lendDate <= '2030-04-04', '未来の貸出実績はない');
  if (l.returnDate) {
    assert.ok(l.returnDate >= l.lendDate && l.returnDate <= '2030-04-04', '実返却日の時系列');
  }
}
for (const p of db.items) {
  const history = db.loans.filter(l => l.itemId === p.id).sort((a,b) => a.lendDate.localeCompare(b.lendDate) || a.id-b.id);
  for (let i=1; i<history.length; i++) {
    const prior=history[i-1], current=history[i];
    assert.ok(prior.returnDate && prior.returnDate <= current.lendDate, '貸出期間が重複しない');
    if (prior.employeeId !== current.employeeId) assert.ok(prior.returnDate < current.lendDate, '他者への貸出は返却翌日以降');
  }
  const pending=db.reservations.filter(r => r.itemId === p.id && !r.loanId && r.date >= '2030-04-04');
  assert.ok(pending.length <= 1, '有効予約は物品ごとに1件');
  const active=db.loans.find(l => l.itemId === p.id && !l.returnDate);
  if (active && pending.length) assert.ok(active.dueDate < pending[0].date, '未返却物品の予約は返却予定日より後');
}
for (const r of db.reservations) {
  assert.ok(r.dueDate >= r.date, '予約の返却予定日は予約日以降');
  if (r.loanId) {
    const l=db.loans.find(l => l.id === r.loanId);
    assert.equal(l.lendDate,r.date,'予約からの貸出は予約当日');
  }
}
// 旧サンプルの改名はID・参照と既存の履歴を維持する。
const legacy=structuredClone(db);
const people=legacy.employees.filter(p=>p.name==='テスト社員：履歴確認A'||p.name==='テスト社員：履歴確認B');
people.forEach(p=>p.name='テスト社員：同姓同名');
const before=JSON.stringify(legacy.loans);
vm.runInContext('removeImpossibleTestData',context)(legacy);
assert.equal(JSON.stringify(legacy.loans),before);
assert.equal(legacy.employees.find(p=>p.id===people[0].id).name,'テスト社員：履歴確認A');
assert.equal(legacy.employees.find(p=>p.id===people[1].id).name,'テスト社員：履歴確認B');
console.log('PASS: current-input sample audit — date order, required fields, lending overlap, return-day restrictions, reservation links and unique employee names');
