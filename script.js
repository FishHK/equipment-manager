"use strict";

const NORMAL_KEY = "equipment-manager-v1";
const TEST_KEY = "equipment-manager-test-v1";
const MODE_KEY = "equipment-manager-mode-v1";
let testMode = true;
let KEY = TEST_KEY;
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(3, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const seed = () => ({
  employees: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `ダミーネーム${pad(i + 1)}` })),
  items: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `ダミーアイテム${pad(i + 1)}`, model: `MODEL-${pad(i + 1)}` })),
  loans: [], reservations: []
});
let db;
let storageReady = true;
try {
  if (!localStorage.getItem(MODE_KEY)) {
    const legacy = localStorage.getItem(NORMAL_KEY);
    const test = legacy ? JSON.parse(legacy) : seed();
    if (!Array.isArray(test.employees) || !Array.isArray(test.items) || !Array.isArray(test.loans)) throw new Error();
    test.reservations ??= [];
    if (!Array.isArray(test.reservations)) throw new Error();
    addTestData(test, today()); restoreArchivedRecords(test, today()); removeImpossibleTestData(test);
    validateDatabase(test);
    const normal = separateNormalData(test);
    if (legacy && !localStorage.getItem("equipment-manager-before-settings-v1")) localStorage.setItem("equipment-manager-before-settings-v1", legacy);
    localStorage.setItem(TEST_KEY, JSON.stringify(test));
    localStorage.setItem(NORMAL_KEY, JSON.stringify(normal));
    localStorage.setItem(MODE_KEY, "on");
  }
  testMode = localStorage.getItem(MODE_KEY) !== "off";
  KEY = testMode ? TEST_KEY : NORMAL_KEY;
  const saved = localStorage.getItem(KEY);
  db = saved ? JSON.parse(saved) : (testMode ? seed() : { employees: [], items: [], loans: [], reservations: [] });
  if (!Array.isArray(db.employees) || !Array.isArray(db.items) || !Array.isArray(db.loans)) throw new Error();
  db.reservations ??= [];
  if (!Array.isArray(db.reservations)) throw new Error();
  if (testMode) { addTestData(db, today()); restoreArchivedRecords(db, today()); removeImpossibleTestData(db); }
  validateDatabase(db);
  localStorage.setItem(KEY, JSON.stringify(db));
} catch {
  db = seed();
  storageReady = false;
}
let page = "lend", employeeId = null, itemId = null;
const activeLoan = (id) => db.loans.find((loan) => loan.itemId === id && !loan.returnDate);
const reservation = (id) => db.reservations.find((r) => r.itemId === id && !r.loanId && r.date >= today());
const returnedToday = (id) => db.loans.filter((loan) => loan.itemId === id && loan.returnDate === today());
const blockedByReturn = (id, personId) => returnedToday(id).some((loan) => loan.employeeId !== personId);
const reservationCompleted = (r) => !!r.loanId && !!db.loans.find((loan) => loan.id === r.loanId)?.returnDate;
const overdue = (id) => db.loans.some((l) => l.employeeId === id && !l.returnDate && l.dueDate && l.dueDate < today());
let selectionSide = null;
let deletedReservation = null;
const employee = (id) => db.employees.find((person) => person.id === id);
const item = (id) => db.items.find((product) => product.id === id);
const matches = (query, ...values) => values.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
const nextId = (rows) => Math.max(0, ...rows.map((row) => row.id)) + 1;
function itemName(product) {
  const same = db.items.filter((row) => row.name === product.name && row.model === product.model);
  return same.length > 1 ? `${product.name} (${same.findIndex((row) => row.id === product.id) + 1})` : product.name;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function save(change) {
  const updated = structuredClone(db);
  change(updated);
  try { localStorage.setItem(KEY, JSON.stringify(updated)); }
  catch { message("保存できませんでした。ブラウザの保存設定や空き容量を確認してください。", true); return false; }
  db = updated;
  return true;
}
function empty(container, text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  container.append(p);
}
function choice(container, label, detail, selected, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", selected);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    button.append(small);
  }
  button.onclick = onClick;
  container.append(button);
  return button;
}
function renderOperation() {
  const pickup = page === "pickup";
  const reserving = page === "reserve";
  const returning = page === "return";
  const bidirectional = pickup || returning;
  for (const id of ["employee-search", "item-search", "employee-search-label", "item-search-label"]) $(id).hidden = false;
  $("clear-selection").hidden = false;
  $("employee-name").readOnly = bidirectional;
  $("reservation-date-field").hidden = !reserving;
  $("due-date-field").hidden = page === "return";
  $("reservation-date").min = today();
  $("due-date").min = reserving ? ($("reservation-date").value || today()) : today();
  const people = $("employees");
  people.replaceChildren();
  const reservations = db.reservations.filter((r) => !r.loanId && r.date === today());
  const selectable = returning ? db.loans.filter((loan) => !loan.returnDate) : reservations;
  db.employees.filter((person) => {
    if (!bidirectional) return matches($("employee-search").value, person.name);
    return matches($("employee-search").value, person.name) && selectable.some((r) => r.employeeId === person.id && (selectionSide === "item" ? r.itemId === itemId : true));
  }).forEach((person) => {
    const button = choice(people, person.name, overdue(person.id) ? "返却期限超過あり" : "", person.id === employeeId, () => {
      if (bidirectional && selectionSide !== "item" && employeeId !== person.id) itemId = null;
      employeeId = person.id;
      $("employee-name").value = person.name;
      if (bidirectional) { selectionSide ||= "employee"; }
      renderOperation();
    });
    if (overdue(person.id)) button.classList.add("overdue");
  });
  $("employee-count").textContent = people.childElementCount + "名";
  if (!people.childElementCount) empty(people, bidirectional ? "対象の社員がいません。検索や選択をリセットしてください。" : "該当する社員がいません。新しい名前は下の欄から登録できます。");
  $("item-heading").textContent = pickup ? "本日予約されている物品" : reserving ? "予約できる物品" : returning ? (employeeId ? "この社員が借りている物品" : "貸出中の物品") : "倉庫にある物品";
  const products = $("available-items");
  products.replaceChildren();
  db.items.filter((product) => {
    const loan = activeLoan(product.id), r = reservation(product.id);
    if (!matches($("item-search").value, itemName(product), product.model)) return false;
    if (bidirectional) return selectable.some((row) => row.itemId === product.id && (selectionSide === "employee" ? row.employeeId === employeeId : true));
    if (!matches($("item-search").value, itemName(product), product.model)) return false;
    if (reserving) return (product.id === itemId && editingReservationId) ||
      (!db.reservations.some((row) => row.id !== editingReservationId && row.itemId === product.id && !row.loanId && row.date >= today()) &&
      (!loan || (loan.dueDate && loan.dueDate < $("reservation-date").value)));
    return !loan && (!r || r.date !== today() || r.employeeId === employeeId);
  }).forEach((product) => {
    const loan = activeLoan(product.id), r = reservation(product.id);
    let detail = product.model || "モデル番号なし";
    if (page === "return") detail += " ／ 貸出日 " + loan.lendDate + " ／ 返却予定 " + (loan.dueDate || "未設定");
    if (r) detail += " ／ 予約：" + employee(r.employeeId).name + " " + r.date;
    if (pickup && loan) detail += " ／ 現在貸出中";
    if (!returning && returnedToday(product.id).length) detail += " ／ 本日返却済み：返却者以外は翌日から貸出可能";
    const button = choice(products, itemName(product), detail, product.id === itemId, () => {
      itemId = product.id;
      if (bidirectional) {
        selectionSide ||= "item";
        const selected = selectable.find((row) => row.itemId === itemId);
        if (pickup) $("due-date").value = selected.dueDate;
        employeeId = selected.employeeId;
        $("employee-name").value = employee(employeeId).name;
      }
      renderOperation();
    });
    if (page === "lend" || pickup) {
      const borrower = pickup ? reservations.find((row) => row.itemId === product.id)?.employeeId : employeeId;
      button.disabled = blockedByReturn(product.id, borrower);
    }
  });
  $("item-count").textContent = products.childElementCount + "件";
  if (!products.childElementCount) empty(products, reserving ? "対象の物品がありません。予約日・検索条件を確認してください。" : "対象の物品がありません。検索や選択をリセットしてください。");
  $("selection").textContent = itemId ? itemName(item(itemId)) : "未選択";
  $("selected-person").textContent = $("employee-name").value.trim() || "未選択";
  $("employee-help").textContent = bidirectional ? "物品から選ぶと借りている人・予約者を自動選択します。" : "一覧にいない人は名前を入力すると、確定時に登録されます。";
  $("operation-guide").textContent = returning ? "社員・物品、どちらから選んでも返却できます。" : pickup ? "本日の予約から選択してください。物品を選ぶと予約者も入力されます。" : reserving ? "予約日を決めて、人と物品を選んでください。" : "人と物品はどちらからでも選べます。";
  $("editing-notice").hidden = !editingReservationId;
  $("edit-cancel").hidden = !editingReservationId;
  $("submit").textContent = reserving ? (editingReservationId ? "変更を保存" : "予約する") : page === "return" ? "返却を確定" : "貸出を確定";
  const problem = operationProblem();
  $("action-help").textContent = problem || (returning ? "今日の日付で返却を記録します。" : editingReservationId ? "この内容で元の予約を更新します。" : "選択した内容で確定できます。");
  $("submit").disabled = !!problem;

}
function validInputDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function operationProblem() {
  if (!storageReady) return "保存データを利用できません。設定やブラウザの保存状態を確認してください。";
  if (!["lend", "return", "reserve", "pickup"].includes(page)) return "";
  const name = $("employee-name").value.trim();
  if (!name) return "社員を選択するか、名前を入力してください。";
  if (!employeeId && db.employees.filter(person => person.name === name).length > 1) return "同名の社員がいます。一覧から選択してください。";
  if (!itemId) return "物品を選択してください。";
  const loan = activeLoan(itemId), r = reservation(itemId);
  const same = employeeId || db.employees.find(person => person.name === name)?.id;
  if (page === "return") return !loan || loan.employeeId !== same ? "この社員が借りている物品を選択してください。" : "";
  const date = page === "reserve" ? $("reservation-date").value : today();
  const due = $("due-date").value;
  if (!validInputDate(date) || date < today()) return "本日以降の予約日を入力してください。";
  if (!validInputDate(due) || due < date) return "貸出日・予約日以降の返却予定日を入力してください。";
  if (page === "reserve") {
    if (db.reservations.some(row => row.id !== editingReservationId && row.itemId === itemId && !row.loanId && row.date >= today())) return "この物品は予約済みです。別の物品を選択してください。";
    if (loan && (!loan.dueDate || loan.dueDate >= date)) return "この物品の返却予定日より後の予約日を指定してください。";
  } else {
    if (loan) return "この物品は貸出中です。返却されるまで借りられません。";
    if (blockedByReturn(itemId, same)) return "本日返却された物品です。返却者以外は翌日から借りられます。";
    if (page === "pickup" && (!r || r.date !== today() || r.employeeId !== same)) return "本日の予約者と物品を選択してください。";
    if (r && r.date === today() && r.employeeId !== same) return "本日は他の社員の予約があります。";
    if (r && r.date > today() && due >= r.date) return "予約日（" + r.date + "）より前の返却予定日を指定してください。";
  }
  return "";
}
function actionButton(container, text, handler) {
  const button = document.createElement("button");
  button.type = "button"; button.textContent = text; button.className = "row-action"; button.onclick = handler;
  container.append(button); return button;
}
function startItemOperation(productId, mode) {
  navigate(mode);
  itemId = productId;
  if (mode === "return") {
    const loan = activeLoan(productId);
    if (!loan) return;
    selectionSide = "item"; employeeId = loan.employeeId; $("employee-name").value = employee(employeeId).name;
  }
  renderOperation();
  if (mode === "lend") $("employee-search").focus?.();
}
function receiveReservation(id) {
  const r = db.reservations.find(row => row.id === id);
  if (!r || r.loanId || r.date !== today()) return;
  navigate("pickup");
  employeeId = r.employeeId; itemId = r.itemId; selectionSide = "item";
  $("employee-name").value = employee(employeeId).name; $("due-date").value = r.dueDate;
  renderOperation();
}
function renderOverview() {
  $("count-available").textContent = db.items.filter(product => !activeLoan(product.id)).length;
  $("count-loans").textContent = db.loans.filter(loan => !loan.returnDate).length;
  $("count-reservations").textContent = db.reservations.filter(r => !r.loanId && r.date === today()).length;
  $("count-overdue").textContent = db.loans.filter(loan => !loan.returnDate && loan.dueDate && loan.dueDate < today()).length;
  $("current-date").textContent = today().replaceAll("-", "/");
}
function tableRow(container, values, statusIndex) {
  const tr = document.createElement("tr");
  values.forEach((value, i) => {
    const td = document.createElement("td");
    if (i === statusIndex) {
      const badge = document.createElement("span");
      badge.className = "badge " + (/超過|不可|未返却/.test(value) ? "danger" : value === "貸出中" ? "out" : /期限切れ/.test(value) ? "neutral" : /予約/.test(value) ? "booked" : "");
      badge.textContent = value;
      td.append(badge);
    } else td.textContent = value;
    tr.append(td);
  });
  container.append(tr);
  return tr;
}
function renderTables() {
  renderOverview();
  $("inventory").replaceChildren();
  db.items.forEach((product) => {
    const loan = activeLoan(product.id);
    const name = loan ? employee(loan.employeeId).name : "—";
    const overdueLoan = loan && loan.dueDate && loan.dueDate < today();
    const filter = $("inventory-filter").value;
    if (filter === "available" && loan || filter === "out" && !loan || filter === "overdue" && !overdueLoan) return;
    if (matches($("inventory-search").value, itemName(product), product.model, name)) {
      const row = tableRow($("inventory"), [itemName(product), product.model, loan ? (overdueLoan ? "貸出中・期限超過" : "貸出中") : returnedToday(product.id).length ? "本日返却・他者貸出不可" : "倉庫", name, loan?.lendDate || "—", loan?.dueDate || "—"], 2);
      const cell = document.createElement("td");
      if (loan) actionButton(cell, "返却する", () => startItemOperation(product.id, "return"));
      else if (reservation(product.id)?.date === today()) actionButton(cell, "予約を確認", () => { navigate("reservations"); $("reservation-search").value = itemName(product); renderReservations(); });
      else actionButton(cell, "貸出する", () => startItemOperation(product.id, "lend"));
      row.append(cell);
    }
  });
  $("records").replaceChildren();
  const records = [
    ...db.loans.map(loan => ({ type: "loan", date: loan.lendDate, row: loan })),
    ...db.reservations.map(r => ({ type: "reservation", date: r.date, row: r }))
  ].sort((a,b) => b.date.localeCompare(a.date) || b.row.id - a.row.id);
  const historyFilter = $("history-filter").value;
  records.forEach(record => {
    const row = record.row, product = item(row.itemId), name = employee(row.employeeId).name;
    const late = record.type === "loan" && !row.returnDate && row.dueDate && row.dueDate < today();
    if (historyFilter === "reservation" && record.type !== "reservation" || historyFilter === "out" && (record.type !== "loan" || row.returnDate) || historyFilter === "returned" && (record.type !== "loan" || !row.returnDate) || historyFilter === "overdue" && !late) return;
    if (!matches($("history-search").value, name, itemName(product), product.model)) return;
    const status = record.type === "loan" ? (row.returnDate ? "返却済み" : late ? "貸出中・期限超過" : "貸出中")
      : row.loanId ? (reservationCompleted(row) ? "予約満了（返却済み）" : "予約から貸出済み") : row.date < today() ? "予約期限切れ" : "予約中";
    tableRow($("records"), [name, itemName(product), product.model || "—", record.date, row.dueDate || "未設定", row.returnDate || "—", status], 6);
  });
  renderReservations();
  for (const id of ["inventory", "records"]) {
    if (!$(id).childElementCount) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "該当するデータがありません。";
      tr.append(td);
      $(id).append(tr);
    }
  }
}
function renderReservations() {
  const body = $("reservation-list"), filter = $("reservation-filter").value;
  body.replaceChildren();
  [...db.reservations].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach((r) => {
    const product = item(r.itemId), name = employee(r.employeeId).name;
    if (filter === "active" && (r.loanId || r.date < today())) return;
    if (filter === "today" && r.date !== today()) return;
    if (!matches($("reservation-search").value, name, itemName(product), product.model, r.date)) return;
    const status = r.loanId ? (reservationCompleted(r) ? "予約満了（返却済み）" : "貸出済み") : r.date < today() ? "期限切れ" : r.date === today()
      ? (activeLoan(r.itemId) ? "本日予約・物品未返却" : blockedByReturn(r.itemId, r.employeeId) ? "本日返却・翌日まで貸出不可" : "本日予約・貸出可能") : "予約中";
    const row = tableRow(body, [name, itemName(product), product.model || "—", r.date, r.dueDate, status], 5);
    const actions = document.createElement("td");
    actions.className = "row-actions";
    if (!r.loanId) {
      for (const [label, handler] of [["予約を編集", () => editReservation(r.id)], ["予約を削除", () => deleteReservation(r.id)]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.title = label; button.setAttribute("aria-label", label + "：" + name + " ／ " + itemName(product));
        button.innerHTML = label === "予約を編集"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5L16 3Zm-2 2 5 5M3 21l5-1"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
        button.disabled = !storageReady; button.onclick = handler;
        actions.append(button);
      }
      if (r.date === today()) actionButton(actions, "受取", () => receiveReservation(r.id));
    } else actions.textContent = reservationCompleted(r) ? "完了" : "貸出済み";
    row.append(actions);
  });
  if (!body.childElementCount) {
    const tr = document.createElement("tr"), td = document.createElement("td");
    td.colSpan = 7; td.textContent = "該当する予約がありません。";
    tr.append(td); body.append(tr);
  }
}

let editingReservationId = null;
function closeReservationEditor() {
  editingReservationId = null;
  $("editing-notice").hidden = true;
  $("edit-cancel").hidden = true;
}
function editReservation(id) {
  const r = db.reservations.find((row) => row.id === id);
  if (!storageReady || !r || r.loanId) return;
  navigate("reserve");
  editingReservationId = id;
  employeeId = r.employeeId; itemId = r.itemId;
  $("employee-name").value = employee(r.employeeId).name;
  $("reservation-date").value = r.date;
  $("due-date").value = r.dueDate;
  message("予約内容を変更できます。");
  renderOperation();
}
function deleteReservation(id) {
  const r = db.reservations.find((row) => row.id === id);
  if (!storageReady || !r || r.loanId) return;
  if (!save((data) => { data.reservations = data.reservations.filter((row) => row.id !== id); })) return;
  deletedReservation = { row: structuredClone(r), key: KEY };
  $("undo-delete").hidden = false;
  if (editingReservationId === id) closeReservationEditor();
  message("予約を削除しました。");
  renderOperation(); renderTables();
}
$("edit-cancel").onclick = () => navigate("reservations");
function navigate(nextPage) {
  page = nextPage;
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  clearSelection(); closeReservationEditor();
  if (page === "lend") $("due-date").value = today();
  if (page === "reserve") { $("reservation-date").value = today(); $("due-date").value = today(); }
  updatePageHeading();
  document.querySelectorAll("nav button").forEach((tab) => {
    if (tab.dataset.page === page) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  $("operation").hidden = !["lend", "return", "reserve", "pickup"].includes(page);
  for (const id of ["register", "items", "reservations", "history", "settings"]) $(id).hidden = page !== id;
  if (storageReady) message("");
  renderOperation(); renderTables();
}
document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => navigate(button.dataset.page);
});
$("employee-name").oninput = () => {
  const name = $("employee-name").value.trim();
  if (employee(employeeId)?.name !== name) {
    const found = db.employees.filter((person) => person.name === name);
    employeeId = found.length === 1 ? found[0].id : null;
    if (page === "return" || page === "pickup") itemId = null;
  }
  renderOperation();
};
["employee-search", "item-search"].forEach((id) => $(id).oninput = renderOperation);
["inventory-search", "history-search"].forEach((id) => $(id).oninput = renderTables);
$("reservation-search").oninput = renderReservations;
$("reservation-filter").onchange = renderReservations;
$("inventory-filter").onchange = renderTables;
$("history-filter").onchange = renderTables;
$("due-date").oninput = renderOperation;
function clearSelection() {
  employeeId = null; itemId = null; selectionSide = null;
  for (const id of ["employee-name", "employee-search", "item-search"]) $(id).value = "";
}
$("clear-selection").onclick = () => { clearSelection(); renderOperation(); };
$("reservation-date").onchange = () => { if (!editingReservationId) itemId = null; if ($("due-date").value < $("reservation-date").value) $("due-date").value = $("reservation-date").value; renderOperation(); };
$("submit").onclick = () => {
  if (!storageReady || !itemId) return;
  const name = $("employee-name").value.trim();
  if (!name) return;
  const product = item(itemId), loan = activeLoan(itemId), r = reservation(itemId);
  let personId = employeeId;
  if (page === "return") {
    if (!loan || loan.employeeId !== personId) return message("選択した社員の貸出物品ではありません。", true);
    if (!save((data) => { data.loans.find((row) => row.id === loan.id).returnDate = today(); })) return;
    message(name + "さんの「" + itemName(product) + "」を返却しました。");
  } else if (["lend", "reserve", "pickup"].includes(page)) {
    const date = page === "reserve" ? $("reservation-date").value : today();
    const dueDate = $("due-date").value;
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(date) || date < today()) return message("本日以降の予約日を入力してください。", true);
    if (!validDate(dueDate) || dueDate < date) return message("貸出日・予約日以降の返却予定日を入力してください。", true);
    const same = db.employees.filter((person) => person.name === name);
    if (!personId && same.length > 1) return message("同名の社員がいます。一覧から選択してください。", true);
    personId = personId || same[0]?.id || nextId(db.employees);
    if (page === "reserve") {
      if (editingReservationId && !db.reservations.some((row) => row.id === editingReservationId && !row.loanId)) return message("編集対象の予約がありません。", true);
      if (db.reservations.some((row) => row.id !== editingReservationId && row.itemId === itemId && !row.loanId && row.date >= today())) return message("この物品は予約済みです。", true);
      if (loan && (!loan.dueDate || loan.dueDate >= date)) return message("予約日までに返却予定のない物品です。", true);
    } else {
      if (loan) return message("この物品は貸出中です。返却後に借りてください。", true);
      if (blockedByReturn(itemId, personId)) return message("本日返却された物品は、返却者以外は翌日から借りられます。", true);
      if (page === "pickup" && (!r || r.date !== today() || r.employeeId !== personId)) return message("本日の予約者と物品を選択してください。", true);
      if (r && r.date === today() && r.employeeId !== personId) return message("本日は他の社員が予約しています。", true);
      if (r && r.date > today() && dueDate >= r.date) return message("予約日前までの返却予定日を入力してください。", true);
    }
    if (!save((data) => {
      if (!data.employees.some((person) => person.id === personId)) data.employees.push({ id: personId, name });
      if (page === "reserve") {
        if (editingReservationId) {
          Object.assign(data.reservations.find((row) => row.id === editingReservationId), { employeeId: personId, itemId, date, dueDate });
        } else data.reservations.push({ id: nextId(data.reservations), employeeId: personId, itemId, date, dueDate, loanId: null });
      } else {
        const id = nextId(data.loans);
        data.loans.push({ id, employeeId: personId, itemId, lendDate: today(), dueDate, returnDate: null });
        if (r && r.date === today() && r.employeeId === personId) data.reservations.find((row) => row.id === r.id).loanId = id;
      }
    })) return;
    message(name + "さんの「" + itemName(product) + "」を" + (page === "reserve" ? "予約" : "貸出") + "しました。");
  } else return;
  if (editingReservationId) {
    navigate("reservations");
    message("予約を変更しました。");
  } else {
    clearSelection(); renderOperation(); renderTables();
  }
};
$("register-form").onsubmit = (event) => {
  event.preventDefault();
  const name = $("product-name").value.trim(), model = $("product-model").value.trim();
  if (!storageReady || !name) return message("製品名を入力してください。", true);
  if (!save((data) => data.items.push({ id: nextId(data.items), name, model }))) return;
  $("register-form").reset();
  message("「" + name + "」を登録しました。");
  renderOperation(); renderTables();
};
function renderSettings() {
  $("test-mode").checked = testMode;
  $("test-mode").disabled = !storageReady;
  $("mode-badge").textContent = testMode ? "テストモード" : "通常モード";
  $("mode-description").textContent = testMode ? "テストデータで操作しています。通常データには影響しません。" : "通常データで操作しています。ダミー社員・物品は表示しません。";
}
$("test-mode").onchange = () => {
  const nextMode = $("test-mode").checked;
  if (!storageReady) return;
  const key = nextMode ? TEST_KEY : NORMAL_KEY;
  try {
    const saved = localStorage.getItem(key);
    const next = saved ? JSON.parse(saved) : { employees: [], items: [], loans: [], reservations: [] };
    if (![next.employees, next.items, next.loans, next.reservations].every(Array.isArray)) throw new Error();
    if (nextMode) removeImpossibleTestData(next);
    validateDatabase(next);
    localStorage.setItem(key, JSON.stringify(next));
    localStorage.setItem(MODE_KEY, nextMode ? "on" : "off");
    db = next; testMode = nextMode; KEY = key;
    resetImport(); importUndo = null; $("undo-import").hidden = true;
    clearSelection(); closeReservationEditor(); deletedReservation = null; $("undo-delete").hidden = true;
    for (const id of ["inventory-search", "history-search", "reservation-search", "reservation-date", "product-name", "product-model"]) $(id).value = "";
    $("due-date").value = today();
    message(nextMode ? "テストデータに切り替えました。" : "通常データに切り替えました。");
    renderOperation(); renderTables();
  } catch { message("データを切り替えられませんでした。現在のデータは変更していません。", true); }
  renderSettings();
};
function updatePageHeading() {
  const text = {
    lend: ["貸出", "借りる人と物品を選び、返却予定日を確認してください。"],
    return: ["返却", "人・物品のどちらからでも選んで、返却できます。"],
    reserve: ["予約", "借りたい日を指定して、1回分の貸出を予約します。"],
    pickup: ["予約から貸出", "本日の予約を選んで、物品を受け渡します。"],
    reservations: ["予約状況", "予約の確認・編集・削除、当日の受け渡しを行えます。"],
    items: ["物品一覧", "保管状況や借りている人を確認し、そのまま操作へ進めます。"],
    history: ["記録", "貸出・返却・予約の履歴を、日付順に確認できます。"],
    register: ["物品登録", "管理する物品を1台ずつ登録します。モデル番号は任意です。"],
    settings: ["設定", "データの切り替え・バックアップ・取り込みを行います。"]
  }[page];
  $("page-title").textContent = text[0]; $("page-description").textContent = text[1];
}
for (const [id, offset] of [["due-today",0],["due-tomorrow",1],["due-week",7]]) {
  $(id).onclick = () => {
    const base = page === "reserve" && validInputDate($("reservation-date").value) ? $("reservation-date").value : today();
    const date = new Date(base + "T12:00:00"); date.setDate(date.getDate() + offset);
    $("due-date").value = date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
    renderOperation();
  };
}
$("stat-available").onclick = () => { navigate("items"); $("inventory-filter").value = "available"; renderTables(); };
$("stat-loans").onclick = () => navigate("return");
$("stat-reservations").onclick = () => navigate("pickup");
$("stat-overdue").onclick = () => { navigate("history"); $("history-filter").value = "overdue"; renderTables(); };
$("add-item-shortcut").onclick = () => navigate("register");
$("undo-delete").onclick = () => {
  if (!deletedReservation || deletedReservation.key !== KEY || !storageReady) return;
  const row = deletedReservation.row;
  if (row.date >= today() && (db.reservations.some(r => r.itemId === row.itemId && !r.loanId && r.date >= today()) || activeLoan(row.itemId) && (!activeLoan(row.itemId).dueDate || activeLoan(row.itemId).dueDate >= row.date))) return message("この物品に新しい貸出・予約があるため、削除を取り消せません。", true);
  if (!save(data => data.reservations.push({ ...row, id: data.reservations.some(r => r.id === row.id) ? nextId(data.reservations) : row.id }))) return;
  deletedReservation = null; $("undo-delete").hidden = true;
  message("予約の削除を取り消しました。"); renderOperation(); renderTables();
};
let importPending = null, importUndo = null, importEpoch = 0;
function downloadFile(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup(source = db) {
  try { downloadFile(DataIO.exportJSON(source, testMode ? "test" : "normal", today()), "equipment-" + (testMode ? "test-" : "normal-") + today() + ".json", "application/json;charset=utf-8"); }
  catch { message("バックアップを出力できませんでした。", true); }
}
function resetImport() {
  importEpoch++; importPending = null;
  $("import-file").value = "";
  $("import-preview").hidden = true; $("export-before-import").hidden = true;
  $("import-confirm").checked = false; $("import-apply").disabled = true;
  $("import-status").textContent = ""; $("import-status").classList.toggle("error", false);
  const type = $("import-type").value;
  $("import-format-help").textContent = type === "json" ? "このアプリで出力したJSONを使用します。現在のモードの社員・物品・履歴・予約を置き換えます。"
    : type === "employees" ? "見出しは「名前」（または name）。同名社員は追加せずスキップします。ファイル内のIDは使用しません。"
    : "見出しは「製品名」「モデル番号」（または name,model）。モデル番号は省略可能。1行を1個の物品として追加し、IDを自動採番します。";
}
function importStatus(text, error = false) {
  $("import-status").textContent = text; $("import-status").classList.toggle("error", error);
}
function showImportPreview(plan) {
  const body = $("import-preview-rows"); body.replaceChildren();
  const display = [];
  if (plan.type === "json") {
    const counts = ["employees", "items", "loans", "reservations"].map(key => plan.data[key].length);
    $("import-summary").textContent = "社員 " + counts[0] + "件 / 物品 " + counts[1] + "件 / 貸出 " + counts[2] + "件 / 予約 " + counts[3] + "件\n出力元：" + (plan.mode === "test" ? "テスト" : "通常") + " → 取り込み先：" + (testMode ? "テスト" : "通常") + "モード\n現在のデータ一式を置き換えます。操作前にJSON保存をおすすめします。";
    plan.data.employees.slice(0,5).forEach(row => display.push(["社員", row.name]));
    plan.data.items.slice(0,5).forEach(row => display.push(["物品", row.name + " ／ " + (row.model || "モデルなし")]));
    plan.data.loans.slice(0,5).forEach(row => display.push(["貸出", row.lendDate + " ／ " + plan.data.employees.find(p=>p.id===row.employeeId).name + " ／ " + plan.data.items.find(p=>p.id===row.itemId).name]));
    plan.data.reservations.slice(0,5).forEach(row => display.push(["予約", row.date + " ／ " + plan.data.employees.find(p=>p.id===row.employeeId).name + " ／ " + plan.data.items.find(p=>p.id===row.itemId).name]));
  } else {
    $("import-summary").textContent = (plan.type === "employees" ? "社員" : "物品") + " " + plan.added.length + "件を追加します。" + (plan.skipped ? " 同名の社員 " + plan.skipped + "件はスキップします。" : "") + "\n現在のデータは残ります。最初の10件を表示しています。";
    plan.added.slice(0,10).forEach(row=>display.push([plan.type === "employees" ? "社員" : "物品", row.name + (row.model ? " ／ " + row.model : "")]));
  }
  display.forEach(values=>tableRow(body, values, -1));
  $("import-preview").hidden = false; $("export-before-import").hidden = false;
  $("import-confirm-label").hidden = plan.type !== "json";
  $("import-confirm").checked = false;
  $("import-apply").disabled = plan.type === "json";
  importStatus("内容を確認してから実行してください。" + (plan.type === "json" ? "表示は各種類の先頭5件です。" : ""));
}
$("export-json").onclick = () => exportBackup();
$("export-before-import").onclick = () => exportBackup();
$("export-csv").onclick = () => {
  const type = $("export-csv-type").value;
  try { downloadFile(DataIO.exportCSV(db, type), "equipment-" + type + "-" + (testMode ? "test-" : "normal-") + today() + ".csv", "text/csv;charset=utf-8"); }
  catch { message("CSVを出力できませんでした。", true); }
};
$("import-type").onchange = resetImport;
$("import-cancel").onclick = resetImport;
$("import-confirm").onchange = () => { $("import-apply").disabled = !importPending || !storageReady || importPending.type === "json" && !$("import-confirm").checked; };
$("import-file").onchange = async () => {
  const file = $("import-file").files?.[0], token = ++importEpoch;
  importPending = null; $("import-preview").hidden = true; $("import-apply").disabled = true; $("export-before-import").hidden = true;
  if (!file || !storageReady) return;
  const key = KEY, type = $("import-type").value, snapshot = JSON.stringify(db);
  importStatus("ファイルを確認しています…");
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("ファイルは5MB以内にしてください。");
    const text = await file.text();
    if (token !== importEpoch || key !== KEY) return;
    if (text.includes("\uFFFD")) throw new Error("文字コードを読み取れません。UTF-8で保存してください。");
    const plan = type === "json" ? { type, ...DataIO.importJSON(text, today()) } : DataIO.importCSV(text, type, db);
    importPending = { ...plan, key, snapshot };
    showImportPreview(importPending);
  } catch (error) { if (token === importEpoch && key === KEY) importStatus(error.message || "ファイルを読み取れませんでした。", true); }
};
$("import-apply").onclick = () => {
  const plan = importPending;
  if (!storageReady || !plan || plan.key !== KEY || plan.type === "json" && !$("import-confirm").checked) return;
  if (plan.snapshot !== JSON.stringify(db)) return importStatus("確認後にデータが変わりました。ファイルを選び直してください。", true);
  const before = structuredClone(db);
  let updated;
  try {
    if (plan.type === "json") {
      DataIO.validate(plan.data, today());
      updated = structuredClone(plan.data);
      if (testMode) { updated.testDataVersion = 1; updated.recordsRestoredV1 = true; }
    } else {
      updated = structuredClone(db);
      let id = nextId(updated[plan.type]);
      for (const row of plan.added) updated[plan.type].push({ id: id++, ...row });
      validateDatabase(updated);
    }
    localStorage.setItem(KEY + "-before-import", JSON.stringify(before));
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch (error) { return importStatus("取り込みできませんでした。現在のデータは変更していません。 " + (error.message || ""), true); }
  db = updated;
  importUndo = { key: KEY, before, after: JSON.stringify(updated) };
  resetImport(); clearSelection(); closeReservationEditor(); deletedReservation = null; $("undo-delete").hidden = true;
  $("undo-import").hidden = false;
  importStatus("取り込みが完了しました。" + (plan.type === "json" ? "データを復元しました。" : plan.added.length + "件を追加しました。"));
  renderOperation(); renderTables();
};
$("undo-import").onclick = () => {
  if (!storageReady || !importUndo || importUndo.key !== KEY) return;
  if (importUndo.after !== JSON.stringify(db)) return importStatus("取り込み後に操作が行われたため、元に戻せません。取り込み前の控えは保持しています。", true);
  try { localStorage.setItem(KEY, JSON.stringify(importUndo.before)); }
  catch { return importStatus("元に戻せませんでした。現在のデータは変更していません。", true); }
  db = importUndo.before; importUndo = null;
  resetImport(); clearSelection(); closeReservationEditor(); $("undo-import").hidden = true;
  importStatus("直前の取り込みを取り消しました。"); renderOperation(); renderTables();
};
$("import-type").value = "json"; $("export-csv-type").value = "employees";
$("import-file").disabled = !storageReady;
$("export-json").disabled = !storageReady; $("export-csv").disabled = !storageReady;
resetImport();
renderSettings(); updatePageHeading();
$("inventory-filter").value = "all"; $("history-filter").value = "all";
$("reservation-filter").value = "active";
$("due-date").value = today();
$("register-submit").disabled = !storageReady;
if (!storageReady) message("保存データを読み書きできません。データ保護のため更新を停止しています。", true);
if (storageReady && db.recordsRestoreConflictsV1 &&
    db.recordsRestoreConflictsV1.loans.length + db.recordsRestoreConflictsV1.reservations.length > 0) {
  message("退避記録を復元しました。現在の貸出・予約と競合する記録は、元の控えに保持しています。", true);
}
renderOperation(); renderTables();
// 日付が変わった場合も予約・期限超過の表示を更新します。
setInterval(() => { renderOperation(); renderTables(); }, 60000);
