"use strict";

const KEY = "equipment-manager-v1";
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
  const saved = localStorage.getItem(KEY);
  db = saved ? JSON.parse(saved) : seed();
  if (!Array.isArray(db.employees) || !Array.isArray(db.items) || !Array.isArray(db.loans)) throw new Error();
  db.reservations ??= [];
  if (!Array.isArray(db.reservations)) throw new Error();
  addTestData(db, today());
  localStorage.setItem(KEY, JSON.stringify(db));
} catch {
  db = seed();
  storageReady = false;
}
let page = "lend", employeeId = null, itemId = null;
const activeLoan = (id) => db.loans.find((loan) => loan.itemId === id && !loan.returnDate);
const reservation = (id) => db.reservations.find((r) => r.itemId === id && !r.loanId && r.date >= today());
const overdue = (id) => db.loans.some((l) => l.employeeId === id && !l.returnDate && l.dueDate && l.dueDate < today());
let selectionSide = null;
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
  for (const id of ["employee-search", "item-search", "employee-search-label", "item-search-label"]) $(id).hidden = pickup;
  $("clear-selection").hidden = !pickup;
  $("employee-name").readOnly = pickup;
  $("reservation-date-field").hidden = !reserving;
  $("due-date-field").hidden = page === "return";
  $("reservation-date").min = today();
  $("due-date").min = reserving ? ($("reservation-date").value || today()) : today();
  const people = $("employees");
  people.replaceChildren();
  const reservations = db.reservations.filter((r) => !r.loanId && r.date === today());
  db.employees.filter((person) => {
    if (!pickup) return matches($("employee-search").value, person.name);
    return reservations.some((r) => r.employeeId === person.id && (selectionSide === "item" ? r.itemId === itemId : true));
  }).forEach((person) => {
    const button = choice(people, person.name, overdue(person.id) ? "返却期限超過あり" : "", person.id === employeeId, () => {
      if (pickup && selectionSide !== "item" && employeeId !== person.id) itemId = null;
      employeeId = person.id;
      $("employee-name").value = person.name;
      if (pickup) { selectionSide ||= "employee"; } else itemId = null;
      renderOperation();
    });
    if (overdue(person.id)) button.classList.add("overdue");
  });
  if (!people.childElementCount) empty(people, "該当する社員がいません。");
  $("item-heading").textContent = pickup ? "本日予約されている物品" : reserving ? "予約できる物品" : page === "return" ? "この社員が借りている物品" : "倉庫にある物品";
  const products = $("available-items");
  products.replaceChildren();
  db.items.filter((product) => {
    const loan = activeLoan(product.id), r = reservation(product.id);
    if (pickup) return reservations.some((row) => row.itemId === product.id && (selectionSide === "employee" ? row.employeeId === employeeId : true));
    if (!matches($("item-search").value, itemName(product), product.model)) return false;
    if (page === "return") return loan && loan.employeeId === employeeId;
    if (reserving) return !r && (!loan || (loan.dueDate && loan.dueDate < $("reservation-date").value));
    return !loan && (!r || r.date !== today() || r.employeeId === employeeId);
  }).forEach((product) => {
    const loan = activeLoan(product.id), r = reservation(product.id);
    let detail = product.model || "モデル番号なし";
    if (page === "return") detail += " ／ 貸出日 " + loan.lendDate + " ／ 返却予定 " + (loan.dueDate || "未設定");
    if (r) detail += " ／ 予約：" + employee(r.employeeId).name + " " + r.date;
    if (pickup && loan) detail += " ／ 現在貸出中（返却後に貸出可能）";
    choice(products, itemName(product), detail, product.id === itemId, () => {
      itemId = product.id;
      if (pickup) {
        selectionSide ||= "item";
        const selected = reservations.find((row) => row.itemId === itemId);
        $("due-date").value = selected.dueDate;
        employeeId = selected.employeeId;
        $("employee-name").value = employee(employeeId).name;
      }
      renderOperation();
    });
  });
  if (!products.childElementCount) empty(products, "該当する物品がありません。");
  $("selection").textContent = itemId ? "選択中：" + itemName(item(itemId)) : "物品を選択してください";
  $("submit").textContent = reserving ? "予約する" : page === "return" ? "返す" : "借りる";
  $("submit").disabled = !storageReady || !itemId || !$("employee-name").value.trim() || (page === "return" && !employeeId);
}
function tableRow(container, values, statusIndex) {
  const tr = document.createElement("tr");
  values.forEach((value, i) => {
    const td = document.createElement("td");
    if (i === statusIndex) {
      const badge = document.createElement("span");
      badge.className = `badge${value === "貸出中" ? " out" : ""}`;
      badge.textContent = value;
      td.append(badge);
    } else td.textContent = value;
    tr.append(td);
  });
  container.append(tr);
}
function renderTables() {
  $("inventory").replaceChildren();
  db.items.forEach((product) => {
    const loan = activeLoan(product.id);
    const name = loan ? employee(loan.employeeId).name : "—";
    if (matches($("inventory-search").value, itemName(product), product.model, name)) {
      tableRow($("inventory"), [itemName(product), product.model, loan ? "貸出中" : "倉庫", name, loan?.lendDate || "—", loan?.dueDate || "—", reservation(product.id) ? employee(reservation(product.id).employeeId).name + " ／ " + reservation(product.id).date : "—"], 2);
    }
  });
  $("records").replaceChildren();
  [...db.loans].reverse().forEach((loan) => {
    const product = item(loan.itemId);
    const name = employee(loan.employeeId).name;
    if (matches($("history-search").value, name, itemName(product), product.model)) {
      tableRow($("records"), [name, itemName(product), product.model, loan.lendDate, loan.dueDate || "未設定", loan.returnDate || "—", loan.returnDate ? "返却済み" : "貸出中"], 6);
    }
  });
  [...db.reservations].reverse().forEach((r) => {
    const product = item(r.itemId), name = employee(r.employeeId).name;
    if (matches($("history-search").value, name, itemName(product), product.model)) {
      tableRow($("records"), [name, itemName(product), product.model, r.date, r.dueDate, "—", r.loanId ? "予約から貸出済み" : r.date < today() ? "予約期限切れ" : "予約中"], 6);
    }
  });
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
document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => {
    page = button.dataset.page;
    clearSelection();
    if (page === "lend") $("due-date").value = today();
    document.querySelectorAll("nav button").forEach((tab) => {
      if (tab === button) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    $("operation").hidden = !["lend", "return", "reserve", "pickup"].includes(page);
    $("register").hidden = page !== "register";
    $("items").hidden = page !== "items";
    $("history").hidden = page !== "history";
    if (storageReady) message("");
    renderOperation();
    renderTables();
  };
});
$("employee-name").oninput = () => {
  const name = $("employee-name").value.trim();
  if (employee(employeeId)?.name !== name) {
    const found = db.employees.filter((person) => person.name === name);
    employeeId = found.length === 1 ? found[0].id : null;
    itemId = null;
  }
  renderOperation();
};
["employee-search", "item-search"].forEach((id) => $(id).oninput = renderOperation);
["inventory-search", "history-search"].forEach((id) => $(id).oninput = renderTables);
function clearSelection() {
  employeeId = null; itemId = null; selectionSide = null;
  for (const id of ["employee-name", "employee-search", "item-search"]) $(id).value = "";
}
$("clear-selection").onclick = () => { clearSelection(); renderOperation(); };
$("reservation-date").onchange = () => { itemId = null; renderOperation(); };
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
      if (r) return message("この物品は予約済みです。", true);
      if (loan && (!loan.dueDate || loan.dueDate >= date)) return message("予約日までに返却予定のない物品です。", true);
    } else {
      if (loan) return message("この物品は貸出中です。返却後に借りてください。", true);
      if (page === "pickup" && (!r || r.date !== today() || r.employeeId !== personId)) return message("本日の予約者と物品を選択してください。", true);
      if (r && r.date === today() && r.employeeId !== personId) return message("本日は他の社員が予約しています。", true);
      if (r && r.date > today() && dueDate >= r.date) return message("予約日前までの返却予定日を入力してください。", true);
    }
    if (!save((data) => {
      if (!data.employees.some((person) => person.id === personId)) data.employees.push({ id: personId, name });
      if (page === "reserve") {
        data.reservations.push({ id: nextId(data.reservations), employeeId: personId, itemId, date, dueDate, loanId: null });
      } else {
        const id = nextId(data.loans);
        data.loans.push({ id, employeeId: personId, itemId, lendDate: today(), dueDate, returnDate: null });
        if (r && r.date === today() && r.employeeId === personId) data.reservations.find((row) => row.id === r.id).loanId = id;
      }
    })) return;
    message(name + "さんの「" + itemName(product) + "」を" + (page === "reserve" ? "予約" : "貸出") + "しました。");
  } else return;
  clearSelection();
  renderOperation(); renderTables();
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
$("due-date").value = today();
$("register-submit").disabled = !storageReady;
if (!storageReady) message("保存データを読み書きできません。データ保護のため更新を停止しています。", true);
renderOperation(); renderTables();
// 日付が変わった場合も予約・期限超過の表示を更新します。
setInterval(() => { renderOperation(); renderTables(); }, 60000);
