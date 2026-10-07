"use strict";

// 既存データには触れず、テスト用の社員・物品・履歴を一度だけ追加します。
function addTestData(data, baseDate) {
  if (data.testDataVersion >= 1) return;
  const next = (rows) => Math.max(0, ...rows.map((row) => row.id)) + 1;
  const date = (offset) => {
    const d = new Date(baseDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const people = ["未貸出", "本日返却", "明日返却", "期限超過1日", "期限超過30日", "複数貸出・一部超過", "本日予約2件", "本日予約1件", "将来予約", "予約物品が未返却", "返却済み", "旧データ期限なし", "同姓同名", "同姓同名", "検索 <確認> & テスト"];
  const personIds = people.map((label) => {
    const id = next(data.employees);
    data.employees.push({ id, name: "テスト社員：" + label });
    return id;
  });
  const names = ["倉庫・未使用", "本日返却予定", "明日返却予定", "1日超過", "30日超過", "複数貸出A・超過", "複数貸出B・期限内", "本日予約A", "本日予約B", "本日予約C", "明日予約", "7日後予約", "本日予約・未返却", "正常返却済み", "遅延返却済み", "予約期限切れ", "予約から貸出中", "予約から返却済み", "期限未設定", "繰り返し貸出履歴", "同一製品", "同一製品", "同一製品", "同一製品", "モデルなし", "検索 <物品> & テスト", "貸出中・将来予約"];
  const itemIds = names.map((label, i) => {
    const id = next(data.items);
    const model = i === 24 ? "" : i >= 20 && i <= 22 ? "SAME-001" : i === 23 ? "SAME-002" : "TEST-" + String(i + 1).padStart(3, "0");
    data.items.push({ id, name: "テスト物品：" + label, model });
    return id;
  });
  function loan(person, product, lent, due, returned = null) {
    const id = next(data.loans);
    data.loans.push({ id, employeeId: personIds[person], itemId: itemIds[product], lendDate: date(lent), dueDate: due === null ? null : date(due), returnDate: returned === null ? null : date(returned) });
    return id;
  }
  function reserve(person, product, day, due, loanId = null) {
    data.reservations.push({ id: next(data.reservations), employeeId: personIds[person], itemId: itemIds[product], date: date(day), dueDate: date(due), loanId });
  }
  loan(1, 1, -2, 0);
  loan(2, 2, -1, 1);
  loan(3, 3, -3, -1);
  loan(4, 4, -40, -30);
  loan(5, 5, -5, -2);
  loan(5, 6, -1, 3);
  reserve(6, 7, 0, 0);
  reserve(6, 8, 0, 2);
  reserve(7, 9, 0, 1);
  reserve(8, 10, 1, 2);
  reserve(8, 11, 7, 10);
  loan(3, 12, -4, -1);
  reserve(9, 12, 0, 2);
  loan(10, 13, -7, -3, -4);
  loan(10, 14, -10, -7, -5);
  reserve(8, 15, -1, 0);
  reserve(7, 16, -1, 2, loan(7, 16, -1, 2));
  reserve(10, 17, -4, -2, loan(10, 17, -4, -2, -2));
  loan(11, 18, -15, null);
  loan(12, 19, -20, -18, -18);
  loan(13, 19, -10, -8, -8);
  loan(14, 19, -2, 1);
  loan(2, 26, -1, 1);
  reserve(8, 26, 3, 5);
  data.testDataVersion = 1;
  data.testDataBaseDate = baseDate;
}

// 退避記録を一度だけ復元。現在の記録を優先し、競合分は控えに残します。
function restoreArchivedRecords(data, currentDate) {
  if (data.recordsRestoredV1 || !data.recordsArchiveV1) return;
  const archive = data.recordsArchiveV1;
  data.recordsBeforeRestoreV1 = structuredClone({ loans: data.loans, reservations: data.reservations });
  const currentLoans = [...data.loans], currentReservations = [...data.reservations];
  const pending = (r) => !r.loanId && r.date >= currentDate;
  const next = (rows) => Math.max(0, ...rows.map((row) => row.id)) + 1;
  const loanIds = new Map();
  const conflicts = { loans: [], reservations: [] };
  for (const loan of archive.loans) {
    const blocked = !loan.returnDate && (
      currentLoans.some((row) => row.itemId === loan.itemId && !row.returnDate) ||
      currentReservations.some((row) => row.itemId === loan.itemId && pending(row))
    );
    if (blocked) { conflicts.loans.push(loan); continue; }
    const id = next(data.loans);
    loanIds.set(loan.id, id);
    data.loans.push({ ...loan, id });
  }
  for (const r of archive.reservations) {
    const blocked = (r.loanId && !loanIds.has(r.loanId)) || (pending(r) && (
      currentReservations.some((row) => row.itemId === r.itemId && pending(row)) ||
      currentLoans.some((row) => row.itemId === r.itemId && !row.returnDate && (!row.dueDate || row.dueDate >= r.date))
    ));
    if (blocked) { conflicts.reservations.push(r); continue; }
    data.reservations.push({ ...r, id: next(data.reservations), loanId: r.loanId ? loanIds.get(r.loanId) : null });
  }
  data.recordsRestoreConflictsV1 = conflicts;
  data.recordsRestoredV1 = true;
}
