// ==== CONFIG ====
// Your published sheet "d/e/..." id:
const PUBLISHED_ID = "2PACX-1vTpJ80LL0exuocYsfEmtIPyXIFaWSB6KgEvXhyj1fiTBKCq3NgYwmN89myHz_8XsAMB-mLc_XidopGc";
// The worksheet gid you shared:
const GID = "2090917812";

// Optional: if you want to exclude some columns from search, put their header names here:
// e.g., ["PrimaryKey", "InternalNotes"]
const EXCLUDE_FROM_SEARCH = [];

// ==== GOOGLE VIS QUERY ENDPOINT ====
// Uses the published id + gid and returns JSON wrapped in a function call.
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(PUBLISHED_ID)}/gviz/tq?gid=${encodeURIComponent(GID)}&tqx=out:json`;

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

function parseGvizResponse(text) {
  // Response looks like: google.visualization.Query.setResponse({...});
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GViz response format.");
  return JSON.parse(text.slice(start, end + 1));
}

function cellToString(cell) {
  if (!cell) return "";
  // Prefer formatted value
  if (typeof cell.f === "string") return cell.f;
  if (cell.v === null || cell.v === undefined) return "";
  return String(cell.v);
}

function buildTable(cols, rows) {
  // Header
  elThead.innerHTML = "";
  const trh = document.createElement("tr");
  const headers = cols.map(c => (c.label && c.label.trim()) ? c.label.trim() : "");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  elThead.appendChild(trh);

  // Body
  elTbody.innerHTML = "";
  rowSearchText = [];

  const excludedIdx = new Set(
    headers
      .map((h, i) => [h, i])
      .filter(([h]) => EXCLUDE_FROM_SEARCH.includes(h))
      .map(([, i]) => i)
  );

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const values = (r.c || []).map(cellToString);

    values.forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });

    // Precompute searchable text for this row (faster filtering)
    const searchable = values
      .filter((_, i) => !excludedIdx.has(i))
      .join(" ")
      .toLowerCase();

    rowSearchText.push(searchable);
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
    const res = await fetch(GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
    const text = await res.text();
    const json = parseGvizResponse(text);

    if (json.status !== "ok") {
      throw new Error(`GViz status not ok: ${JSON.stringify(json, null, 2)}`);
    }

    const table = json.table;
    buildTable(table.cols || [], table.rows || []);
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
