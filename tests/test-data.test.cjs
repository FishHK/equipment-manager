const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
class Element {
  constructor() {
    this.children = []; this.value = ''; this.dataset = {}; this.attrs = {}; this.classes = new Set();
    this.classList = { toggle() {}, add: (value) => this.classes.add(value) };
  }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  get childElementCount() { return this.children.length; }
  reset() {}
}
const storage = new Map();
function load() {
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const tabs = ['lend', 'return', 'reserve', 'pickup', 'register', 'items', 'history', 'reservations'].map((page) => {
    const button = new Element(); button.dataset.page = page; return button;
  });
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element(), querySelectorAll: () => tabs },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    structuredClone, Date, setInterval() {}
  });
  for (const file of ['test-data.js', 'script.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  return { get, tabs, run: (code) => vm.runInContext(code, context) };
}
let app = load();
const data = () => JSON.parse(storage.get('equipment-manager-v1'));
assert.equal(data().loans.length, 0);
assert.equal(data().reservations.length, 0);
assert.equal(data().recordsArchiveV1.loans.length, 16);
assert.equal(data().recordsArchiveV1.reservations.length, 10);
const archived = JSON.stringify(data().recordsArchiveV1);
app.run('save(d => d.loans.push({id:1,employeeId:1,itemId:1,lendDate:today(),dueDate:today(),returnDate:null}))');
app = load();
assert.equal(data().loans.length, 1);
assert.equal(JSON.stringify(data().recordsArchiveV1), archived);
assert.equal(data().employees.length, 55);
assert.equal(data().items.length, 67);
console.log('PASS: records archived and cleared once; new activity and backup survive reload');
// 以降は従来のシナリオを控えから戻した独立したテスト状態で検証。
app.run('save(d => { d.loans = structuredClone(d.recordsArchiveV1.loans); d.reservations = structuredClone(d.recordsArchiveV1.reservations); })');
app = load();
const initial = data();
assert.equal(initial.employees.length, 55);
assert.equal(initial.items.length, 67);
assert.equal(initial.loans.length, 16);
assert.equal(initial.reservations.length, 10);
assert.equal(app.get('due-date').value, app.run('today()'));
for (const key of ['employees', 'items', 'loans', 'reservations']) {
  assert.equal(new Set(initial[key].map((row) => row.id)).size, initial[key].length);
}
for (const row of [...initial.loans, ...initial.reservations]) {
  assert.ok(initial.employees.some((person) => person.id === row.employeeId));
  assert.ok(initial.items.some((item) => item.id === row.itemId));
}
assert.equal(app.run('db.employees.filter(p => overdue(p.id)).length'), 3);
assert.equal(app.run('itemName(db.items[60])'), 'テスト物品：同一製品 (1)');
assert.equal(app.run('itemName(db.items[62])'), 'テスト物品：同一製品 (3)');
assert.equal(app.run('itemName(db.items[63])'), 'テスト物品：同一製品');
// 既存データ・テスト操作を再読み込みしても保持し、追加を繰り返さない。
app.run('save(d => d.items.push({id:1000,name:"既存の登録物品",model:""}))');
app = load();
assert.equal(data().items.length, 68);
assert.equal(data().loans.length, 16);
assert.equal(data().items.at(-1).id, 1000);
// 貸出タブに戻ると今日に戻る。手入力中の描画では上書きしない。
app.get('due-date').value = '2099-01-01';
app.run('renderOperation()');
assert.equal(app.get('due-date').value, '2099-01-01');
app.tabs[1].onclick(); app.tabs[0].onclick();
assert.equal(app.get('due-date').value, app.run('today()'));
// 本日の予約一覧には未返却の予約品も含み、貸出は拒否する。
app.tabs[3].onclick();
assert.equal(app.get('available-items').children.length, 4);
const blocked = app.get('available-items').children.find((button) => button.textContent.includes('未返却'));
blocked.onclick(); app.get('submit').onclick();
assert.equal(data().loans.length, 16);
assert.ok(app.get('message').textContent.includes('貸出中'));
// 正常な予約品を物品側から選び、予約の返却予定日を引き継ぐ。
app.get('clear-selection').onclick();
app.get('available-items').children.find((button) => button.textContent.includes('本日予約B')).onclick();
assert.equal(app.get('due-date').value, app.run('reservation(itemId).dueDate'));
app.get('submit').onclick();
assert.equal(data().loans.length, 17);
console.log('PASS: sample integrity, date defaults, overdue, duplicate names, reload preservation, blocked and successful reservation pickup');

app.tabs[7].onclick();
assert.equal(app.get('reservations').hidden, false);
assert.equal(app.get('operation').hidden, true);
assert.equal(app.get('reservation-list').children.length, 6);
app.get('reservation-filter').value = 'all'; app.get('reservation-filter').onchange();
assert.equal(app.get('reservation-list').children.length, 10);
app.get('reservation-filter').value = 'today'; app.get('reservation-filter').onchange();
assert.equal(app.get('reservation-list').children.length, 4);
app.get('reservation-search').value = '本日予約・未返却'; app.get('reservation-search').oninput();
assert.equal(app.get('reservation-list').children.length, 1);
assert.equal(app.get('reservation-list').children[0].children[5].children[0].textContent, '本日予約・物品未返却');
app.get('reservation-search').value = '該当しない検索文字列'; app.get('reservation-search').oninput();
assert.equal(app.get('reservation-list').children[0].children[0].textContent, '該当する予約がありません。');
console.log('PASS: reservation tab, status filters, search, blocked status and empty state');
// 一覧の鉛筆から予約画面に遷移し、既存レコードを更新。
app.get('reservation-search').value = '';
app.get('reservation-filter').value = 'active';
app.run('renderReservations()');
const firstRow = app.get('reservation-list').children[0];
const pencil = firstRow.children[6].children[0];
assert.ok(pencil.attrs['aria-label'].includes('予約を編集'));
assert.ok(firstRow.children[6].children[1].attrs['aria-label'].includes('予約を削除'));
pencil.onclick();
const editableId = app.run('editingReservationId');
assert.equal(app.run('page'), 'reserve');
assert.equal(app.get('operation').hidden, false);
assert.equal(app.get('reservations').hidden, true);
assert.equal(app.get('submit').textContent, '変更を保存');
const original = data().reservations.find(r => r.id === editableId);
assert.equal(app.run('itemId'), original.itemId);
assert.equal(app.run('employeeId'), original.employeeId);
assert.equal(app.get('reservation-date').value, original.date);
assert.equal(app.get('due-date').value, original.dueDate);
const count = data().reservations.length;
// 自分自身の予約を重複扱いしない。
app.get('submit').onclick();
assert.equal(data().reservations.length, count);
assert.equal(app.run('page'), 'reservations');
app.run(`editReservation(${editableId})`);
const otherItem = app.run(`db.reservations.find(r => r.id !== ${editableId} && !r.loanId && r.date >= today()).itemId`);
app.run(`itemId = ${otherItem}`);
app.get('submit').onclick();
assert.equal(data().reservations.find(r => r.id === editableId).itemId, original.itemId);
assert.ok(app.get('message').textContent.includes('予約済み'));
// 予約画面の社員・物品選択から変更する。
app.get('employees').children[0].onclick();
app.get('reservation-date').value = '2099-01-01';
app.get('reservation-date').onchange();
app.get('available-items').children.find(button => button.textContent === 'ダミーアイテム001').onclick();
app.get('due-date').value = '2099-01-02';
app.get('submit').onclick();
assert.equal(data().reservations.length, count);
assert.equal(data().reservations.find(r => r.id === editableId).employeeId, 1);
assert.equal(data().reservations.find(r => r.id === editableId).itemId, 1);
assert.equal(data().reservations.find(r => r.id === editableId).date, '2099-01-01');
assert.equal(app.run('page'), 'reservations');
assert.equal(app.run('editingReservationId'), null);
// キャンセルは保存しない。
app.run(`editReservation(${editableId})`);
app.get('due-date').value = '2099-02-01';
app.get('edit-cancel').onclick();
assert.equal(data().reservations.find(r => r.id === editableId).dueDate, '2099-01-02');
assert.equal(app.run('page'), 'reservations');
// ゴミ箱は対応する予約を削除し、物品の予約制限を解除。
const targetRow = app.get('reservation-list').children.find(row => row.children[1].textContent === 'ダミーアイテム001');
targetRow.children[6].children[1].onclick();
assert.equal(data().reservations.length, count - 1);
assert.equal(app.run('reservation(1)'), undefined);
const consumedId = app.run('db.reservations.find(r => r.loanId).id');
app.run(`deleteReservation(${consumedId});editReservation(${consumedId})`);
assert.equal(data().reservations.length, count - 1);
assert.equal(app.run('editingReservationId'), null);
assert.equal(app.get('inventory').children[0].children.length, 6);
app = load();
assert.ok(!data().reservations.some(r => r.id === editableId));
console.log('PASS: pencil navigation and prefill, self-conflict exemption, editing via reservation controls, cancellation, trash deletion and persistence');
// 返却も社員・物品どちらからでも選択し、選択解除で全件へ戻す。
app.tabs[1].onclick();
const activeCount = app.run('db.loans.filter(l => !l.returnDate).length');
const borrowerCount = app.run('new Set(db.loans.filter(l => !l.returnDate).map(l => l.employeeId)).size');
assert.equal(app.get('available-items').children.length, activeCount);
assert.equal(app.get('employees').children.length, borrowerCount);
assert.equal(app.get('clear-selection').hidden, false);
assert.equal(app.get('item-search').hidden, true);
const firstLoan = app.run('({...db.loans.find(l => !l.returnDate)})');
app.get('available-items').children[0].onclick();
assert.equal(app.run('employeeId'), firstLoan.employeeId);
assert.equal(app.get('employees').children.length, 1);
const itemCount = app.get('available-items').children.length;
app.get('submit').onclick();
assert.ok(data().loans.find(l => l.id === firstLoan.id).returnDate);
assert.equal(app.get('available-items').children.length, itemCount - 1);
app.get('employees').children[0].onclick();
const selectedPerson = app.run('employeeId');
assert.equal(app.get('available-items').children.length, app.run(`db.loans.filter(l => !l.returnDate && l.employeeId === ${selectedPerson}).length`));
app.get('clear-selection').onclick();
assert.equal(app.run('employeeId'), null);
assert.equal(app.run('itemId'), null);
assert.equal(app.get('available-items').children.length, activeCount - 1);
console.log('PASS: return from item or employee, borrower auto-selection, filtering, clearing and actual return');
