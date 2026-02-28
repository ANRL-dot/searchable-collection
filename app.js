// ==== CONFIG ====
const PUBLISHED_ID = "2PACX-1vTpJ80LL0exuocYsfEmtIPyXIFaWSB6KgEvXhyj1fiTBKCq3NgYwmN89myHz_8XsAMB-mLc_XidopGc";
const GID = "2090917812";

// Published CSV endpoint (works with /d/e/.../pubhtml links)
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(PUBLISHED_ID)}/pub?gid=${encodeURIComponent(GID)}&single=true&output=csv`;

const elQ = document.getElementById("q");
const elClear = document.getElementById("clear");
const elCount = document.getElementById("count");
const elStatus = document.getElementById("status");
const elErr = document.getElementById("err");
const elThead = document.querySelector("#tbl thead");
const elTbody = document.querySelector("#tbl tbody");

let rowSearchText = []; // parallel array to <tr> rows

function showError(msg) {
  elErr.hidden = false;
  elErr.textContent = msg;
  elStatus.textContent = "Error.";
}

function setStatus(msg) {
  elStatus.textContent = msg;
}

// Basic CSV parser that handles quoted fields
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { // escaped quote
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      cur += ch;
    }
  }

  // last cell
  row.push(cur);
  rows.push(row);

  // trim possible empty trailing row
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }

  return rows;
}

function buildTable(headers, dataRows) {
  // Header
  elThead.innerHTML = "";
  const trh = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h || "";
    trh.appendChild(th);
  });
  elThead.appendChild(trh);

  // Body
  elTbody.innerHTML = "";
  rowSearchText = [];

  dataRows.forEach((r) => {
    const tr = document.createElement("tr");
    const values = r.map(v => (v ?? "").toString());

    // pad short rows so table stays aligned
    while (values.length < headers.length) values.push("");

    values.forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });

    rowSearchText.push(values.join(" ").toLowerCase());
    elTbody.appendChild(tr);
  });

  setStatus("Loaded.");
  updateCount();
}

function updateCount(visible = null, total = null) {
  const totalRows = total ?? elTbody.querySelectorAll("tr").length;
  const visibleRows = visible ?? Array.from(elTbody.querySelectorAll("tr")).filter(tr => !tr.classList.contains("hide")).length;
  elCount.textContent = `${visibleRows.toLocaleString()} / ${totalRows.toLocaleString()} rows`;
}

function applyFilter(q) {
  const query = (q || "").trim().toLowerCase();
  const trs = elTbody.querySelectorAll("tr");

  if (!query) {
    trs.forEach(tr => tr.classList.remove("hide"));
    updateCount(trs.length, trs.length);
    return;
  }

  let visible = 0;
  trs.forEach((tr, idx) => {
    const hit = rowSearchText[idx].includes(query);
    if (hit) {
      tr.classList.remove("hide");
      visible += 1;
    } else {
      tr.classList.add("hide");
    }
  });

  updateCount(visible, trs.length);
}

async function load() {
  try {
    setStatus("Loading from Google Sheets…");
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    const csvText = await res.text();

    const rows = parseCSV(csvText);
    if (!rows.length) throw new Error("CSV returned no rows.");

    const headers = rows[0];
    const dataRows = rows.slice(1);

    buildTable(headers, dataRows);
  } catch (e) {
    showError(String(e?.message || e));
  }
}

elQ.addEventListener("input", () => applyFilter(elQ.value));
elClear.addEventListener("click", () => {
  elQ.value = "";
  elQ.focus();
  applyFilter("");
});

load();
