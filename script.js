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
  loans: []
});
let db;
let storageReady = true;
try {
  const saved = localStorage.getItem(KEY);
  db = saved ? JSON.parse(saved) : seed();
  if (!Array.isArray(db.employees) || !Array.isArray(db.items) || !Array.isArray(db.loans)) throw new Error();
  localStorage.setItem(KEY, JSON.stringify(db));
} catch {
  db = seed();
  storageReady = false;
}
let page = "lend", employeeId = null, itemId = null;
const activeLoan = (id) => db.loans.find((loan) => loan.itemId === id && !loan.returnDate);
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
}
function renderOperation() {
  const people = $("employees");
  people.replaceChildren();
  db.employees.filter((person) => matches($("employee-search").value, person.name)).forEach((person) => {
    choice(people, person.name, "", person.id === employeeId, () => {
      employeeId = person.id;
      $("employee-name").value = person.name;
      itemId = null;
      renderOperation();
    });
  });
  if (!people.childElementCount) empty(people, "該当する社員がいません。");
  $("item-heading").textContent = page === "lend" ? "倉庫にある物品" : "この社員が借りている物品";
  const products = $("available-items");
  products.replaceChildren();
  db.items.filter((product) => {
    const loan = activeLoan(product.id);
    return (page === "lend" ? !loan : loan && loan.employeeId === employeeId)
      && matches($("item-search").value, itemName(product), product.model);
  }).forEach((product) => {
    const loan = activeLoan(product.id);
    choice(products, itemName(product), `${product.model}${page === "return" ? ` ／ 貸出日 ${loan.lendDate}` : ""}`, product.id === itemId, () => {
      itemId = product.id;
      renderOperation();
    });
  });
  if (!products.childElementCount) empty(products, page === "return" && !employeeId ? "社員を選択してください。" : "該当する物品がありません。");
  $("selection").textContent = itemId ? `選択中：${itemName(item(itemId))}` : "物品を選択してください";
  $("submit").textContent = page === "lend" ? "借りる" : "返す";
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
      tableRow($("inventory"), [itemName(product), product.model, loan ? "貸出中" : "倉庫", name, loan?.lendDate || "—"], 2);
    }
  });
  $("records").replaceChildren();
  [...db.loans].reverse().forEach((loan) => {
    const product = item(loan.itemId);
    const name = employee(loan.employeeId).name;
    if (matches($("history-search").value, name, itemName(product), product.model)) {
      tableRow($("records"), [name, itemName(product), product.model, loan.lendDate, loan.returnDate || "—", loan.returnDate ? "返却済み" : "貸出中"], 5);
    }
  });
  for (const id of ["inventory", "records"]) {
    if (!$(id).childElementCount) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = id === "inventory" ? 5 : 6;
      td.textContent = "該当するデータがありません。";
      tr.append(td);
      $(id).append(tr);
    }
  }
}
document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => {
    page = button.dataset.page;
    itemId = null;
    document.querySelectorAll("nav button").forEach((tab) => {
      if (tab === button) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    $("operation").hidden = page !== "lend" && page !== "return";
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
$("submit").onclick = () => {
  if (!storageReady || !itemId) return;
  const name = $("employee-name").value.trim();
  if (!name) return;
  const product = item(itemId), loan = activeLoan(itemId);
  let personId = employeeId;
  if (page === "lend") {
    if (loan) return message("この物品はすでに貸出中です。", true);
    const same = db.employees.filter((person) => person.name === name);
    if (!personId && same.length > 1) return message("同名の社員がいます。一覧から選択してください。", true);
    personId = personId || same[0]?.id || nextId(db.employees);
    if (!save((data) => {
      if (!data.employees.some((person) => person.id === personId)) data.employees.push({ id: personId, name });
      data.loans.push({ id: nextId(data.loans), employeeId: personId, itemId, lendDate: today(), returnDate: null });
    })) return;
    message(`${name}さんに「${itemName(product)}」を貸し出しました。`);
  } else if (page === "return") {
    if (!loan || loan.employeeId !== personId) return message("選択した社員の貸出物品ではありません。", true);
    if (!save((data) => { data.loans.find((row) => row.id === loan.id).returnDate = today(); })) return;
    message(`${name}さんの「${itemName(product)}」を返却しました。`);
  } else return;
  employeeId = personId;
  itemId = null;
  renderOperation();
  renderTables();
};
if (!storageReady) message("保存データを読み書きできません。データ保護のため貸出・返却を停止しています。ブラウザの保存設定を確認してください。", true);
renderOperation();
renderTables();
