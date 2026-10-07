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
  const tabs = ['lend', 'return', 'reserve', 'pickup', 'register', 'items', 'history'].map((page) => {
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
