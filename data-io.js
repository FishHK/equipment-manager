"use strict";

// 入出力処理は画面・保存領域から独立させ、自動テスト可能にする。
globalThis.DataIO = (() => {
  const keys = ["employees", "items", "loans", "reservations"];
  const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const fail = text => { throw new Error(text); };
  function clean(data) {
    if (!data || !keys.every(key => Array.isArray(data[key]))) fail("社員・物品・貸出・予約の4種類のデータが必要です。");
    if (keys.some(key => data[key].length > 10000)) fail("各データは10,000件以内にしてください。");
    return {
      employees: data.employees.map(r => ({ id:r?.id, name:r?.name })),
      items: data.items.map(r => ({ id:r?.id, name:r?.name, model:r?.model ?? "" })),
      loans: data.loans.map(r => ({ id:r?.id, employeeId:r?.employeeId, itemId:r?.itemId, lendDate:r?.lendDate, dueDate:r?.dueDate, returnDate:r?.returnDate ?? null })),
      reservations: data.reservations.map(r => ({ id:r?.id, employeeId:r?.employeeId, itemId:r?.itemId, date:r?.date, dueDate:r?.dueDate, loanId:r?.loanId ?? null }))
    };
  }
  function validate(data, currentDate) {
    const ids = {};
    for (const key of keys) {
      ids[key] = new Set();
      for (const r of data[key]) {
        if (!Number.isSafeInteger(r.id) || r.id < 1 || ids[key].has(r.id)) fail("IDが不正、または重複しています：" + key);
        ids[key].add(r.id);
      }
    }
    for (const r of [...data.employees, ...data.items]) if (typeof r.name !== "string" || !r.name.trim()) fail("名前が未設定です。");
    for (const r of data.items) if (r.name.length > 100 || typeof r.model !== "string" || r.model.length > 100) fail("物品名・モデル番号は100文字以内にしてください。");
    for (const r of [...data.loans, ...data.reservations]) if (!ids.employees.has(r.employeeId) || !ids.items.has(r.itemId)) fail("社員または物品の参照先がありません。");
    for (const l of data.loans) {
      if (!date(l.lendDate) || !date(l.dueDate) || l.dueDate < l.lendDate || l.lendDate > currentDate) fail("貸出日・返却予定日の内容が不正です。");
      if (l.returnDate !== null && (!date(l.returnDate) || l.returnDate < l.lendDate || l.returnDate > currentDate)) fail("実際の返却日が不正です。");
    }
    const byItem=new Map(), byLoan=new Map(data.loans.map(l=>[l.id,l])), pendingByItem=new Map();
    for(const l of data.loans){if(!byItem.has(l.itemId))byItem.set(l.itemId,[]);byItem.get(l.itemId).push(l);}
    for(const r of data.reservations){if(r.loanId===null&&r.date>=currentDate){if(pendingByItem.has(r.itemId))fail("同じ物品に複数の有効な予約があります。");pendingByItem.set(r.itemId,r);}}
    for (const p of data.items) {
      const history = (byItem.get(p.id)||[]).sort((a,b) => a.lendDate.localeCompare(b.lendDate) || Number(!a.returnDate)-Number(!b.returnDate) || a.id-b.id);
      for (let i=1;i<history.length;i++) {
        const prior=history[i-1], next=history[i];
        if (!prior.returnDate || prior.returnDate > next.lendDate || prior.employeeId !== next.employeeId && prior.returnDate === next.lendDate) fail("貸出期間が重複、または返却当日に他の社員へ貸出しています。");
      }
      const active=history.find(l=>!l.returnDate), pending=pendingByItem.get(p.id);
      if(active&&pending&&active.dueDate>=pending.date)fail("予約日までに返却予定のない物品が予約されています。");
    }
    for (const r of data.reservations) {
      if (!date(r.date) || !date(r.dueDate) || r.dueDate < r.date) fail("予約日・返却予定日が不正です。");
      if (r.loanId !== null) {
        const l=byLoan.get(r.loanId);
        if (!l || l.itemId !== r.itemId || l.employeeId !== r.employeeId || l.lendDate !== r.date) fail("予約と貸出記録の対応が不正です。");
      }
    }
  }
  function exportJSON(data, mode, currentDate) {
    return JSON.stringify({ app:"equipment-manager", version:1, mode, exportedDate:currentDate, data:clean(data) },null,2);
  }
  function importJSON(text, currentDate) {
    let source;
    try { source=JSON.parse(text.replace(/^\uFEFF/,"")); } catch { fail("JSONを読み取れません。ファイルの形式を確認してください。"); }
    if (source?.app !== "equipment-manager" || source.version !== 1 || !["test","normal"].includes(source.mode)) fail("このアプリから出力したバージョン1のJSONを指定してください。");
    const data=clean(source.data); validate(data,currentDate);
    return { data, mode:source.mode };
  }
  function csvCell(value) {
    let text=String(value ?? "");
    // 表計算ソフトが値を数式として実行しないよう文字列として出力。
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text="'"+text;
    return /[",\r\n]/.test(text) ? '"'+text.replaceAll('"','""')+'"' : text;
  }
  function exportCSV(data, type) {
    const people=new Map(data.employees.map(p=>[p.id,p.name])), products=new Map(data.items.map(p=>[p.id,p]));
    const person=id => people.get(id) || "";
    const product=id => products.get(id) || {};
    const tables = {
      employees: [["社員ID","名前"],()=>data.employees.map(p=>[p.id,p.name])],
      items: [["物品ID","製品名","モデル番号"],()=>data.items.map(p=>[p.id,p.name,p.model])],
      loans: [["記録ID","社員ID","社員名","物品ID","製品名","モデル番号","貸出日","返却予定日","返却日"],()=>data.loans.map(l=>[l.id,l.employeeId,person(l.employeeId),l.itemId,product(l.itemId).name,product(l.itemId).model,l.lendDate,l.dueDate,l.returnDate])],
      reservations: [["予約ID","社員ID","社員名","物品ID","製品名","モデル番号","予約日","返却予定日","貸出記録ID"],()=>data.reservations.map(r=>[r.id,r.employeeId,person(r.employeeId),r.itemId,product(r.itemId).name,product(r.itemId).model,r.date,r.dueDate,r.loanId])]
    };
    if (!tables[type]) fail("CSVの出力対象が不正です。");
    const [header,rows]=tables[type];
    return "\uFEFF"+[header,...rows()].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
  }
  function parseCSV(text) {
    text=text.replace(/^\uFEFF/,"");
    const rows=[];let row=[],field="",quoted=false,closed=false;
    const push=()=>{row.push(field);field="";closed=false;};
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
        else if(c==='"'){quoted=false;closed=true;}
        else field+=c;
      } else if(c==='"') { if(field||closed) fail("CSVの引用符が不正です。");quoted=true; }
      else if(c===','){push();}
      else if(c==='\r'||c==='\n'){push();rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
      else { if(closed) fail("CSVの閉じ引用符の後に不正な文字があります。");field+=c; }
    }
    if(quoted) fail("CSVの引用符が閉じていません。");
    if(field||row.length||closed){push();rows.push(row);}
    return rows;
  }
  function importCSV(text, type, existing) {
    if(!["employees","items"].includes(type)) fail("CSVの取り込みは社員・物品のみです。");
    const rows=parseCSV(text);
    if(rows.length<2) fail("見出し行と1件以上のデータが必要です。");
    if(rows.length>10001) fail("CSVは10,000件以内にしてください。");
    const header=rows.shift().map(v=>v.trim());
    if(new Set(header).size!==header.length) fail("CSVの見出しが重複しています。");
    const aliases=type==="employees"?["名前","社員名","name"]:["製品名","name"];
    const names=header.map((v,i)=>aliases.includes(v)?i:-1).filter(i=>i>=0);
    if(names.length!==1) fail("名前の見出しを1つ指定してください："+aliases.join(" / "));
    const nameIndex=names[0],modelIndex=header.findIndex(v=>["モデル番号","model"].includes(v));
    const seen=new Set(existing.employees.map(p=>p.name));
    const added=[],errors=[];let skipped=0;
    rows.forEach((values,i)=>{
      if(values.every(v=>!v.trim()))return;
      if(values.length!==header.length){errors.push((i+2)+"行目：列数が見出しと一致しません。");return;}
      const name=values[nameIndex].trim(),model=modelIndex<0?"":values[modelIndex].trim();
      if(!name){errors.push((i+2)+"行目：名前が空欄です。");return;}
      if(type==="items"&&(name.length>100||model.length>100)){errors.push((i+2)+"行目：製品名・モデル番号は100文字以内です。");return;}
      if(type==="employees"&&seen.has(name)){skipped++;return;}
      if(type==="employees")seen.add(name);
      added.push(type==="employees"?{name}:{name,model});
    });
    if(errors.length)fail(errors.slice(0,10).join("\n")+(errors.length>10?"\nほか"+(errors.length-10)+"件":""));
    if(!added.length)fail(skipped?"すべて登録済みの社員です。追加するデータがありません。":"追加するデータがありません。");
    if(existing[type].length+added.length>10000)fail("取り込み後の件数が10,000件を超えます。");
    return { type, added, skipped };
  }
  return { exportJSON, importJSON, exportCSV, parseCSV, importCSV, validate };
})();
