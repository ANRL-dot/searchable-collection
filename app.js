/* ===== Searchable Sheet (CSV) + Pagination + Fast Render =====
 * Drop-in replacement for app.js
 *
 * Features:
 * - Loads your published Google Sheet tab as CSV
 * - Instant scrolling via pagination (default 200 rows/page)
 * - Search box filters across ALL rows (not just current page)
 * - Next/Prev + page indicator + optional page-size selector
 *
 * Requires in index.html (recommended):
 *   - Existing elements: #q, #clear, #count, #status, #err, #tbl thead/tbody
 *   - OPTIONAL pagination elements:
 *       <button id="prevPage">Prev</button>
 *       <button id="nextPage">Next</button>
 *       <span id="pageInfo"></span>
 *       <select id="pageSize"></select>
 *
 * If optional elements are missing, this script will create a simple pager bar automatically.
 */

(() => {
  // ==== CONFIG ====
  const PUBLISHED_ID =
    "2PACX-1vTpJ80LL0exuocYsfEmtIPyXIFaWSB6KgEvXhyj1fiTBKCq3NgYwmN89myHz_8XsAMB-mLc_XidopGc";
  const GID = "2090917812";

  // Published CSV endpoint for "Publish to web" sheets
  const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(
    PUBLISHED_ID
  )}/pub?gid=${encodeURIComponent(GID)}&single=true&output=csv`;

  // Pagination defaults
  const PAGE_SIZES = [50, 100, 200, 500, 1000];
  const DEFAULT_PAGE_SIZE = 50;

  // Optional: exclude columns from search by header name
  const EXCLUDE_FROM_SEARCH = []; // e.g. ["PrimaryKey", "InternalNotes"]

  // ==== DOM (required) ====
  const elQ = document.getElementById("q");
  const elClear = document.getElementById("clear");
  const elCount = document.getElementById("count");
  const elStatus = document.getElementById("status");
  const elErr = document.getElementById("err");
  const elThead = document.querySelector("#tbl thead");
  const elTbody = document.querySelector("#tbl tbody");

  if (!elQ || !elClear || !elCount || !elStatus || !elErr || !elThead || !elTbody) {
    console.error(
      "Required elements not found. Ensure index.html has #q, #clear, #count, #status, #err, #tbl with thead/tbody."
    );
    return;
  }

  // ==== DOM (pager optional) ====
  let elPrev = document.getElementById("prevPage");
  let elNext = document.getElementById("nextPage");
  let elPageInfo = document.getElementById("pageInfo");
  let elPageSize = document.getElementById("pageSize");

  // Create pager UI if missing
  function ensurePagerUI() {
    if (elPrev && elNext && elPageInfo && elPageSize) return;

    const bar = document.createElement("div");
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.style.alignItems = "center";
    bar.style.flexWrap = "wrap";
    bar.style.marginTop = "10px";

    elPrev = document.createElement("button");
    elPrev.id = "prevPage";
    elPrev.type = "button";
    elPrev.textContent = "Prev";

    elNext = document.createElement("button");
    elNext.id = "nextPage";
    elNext.type = "button";
    elNext.textContent = "Next";

    elPageInfo = document.createElement("span");
    elPageInfo.id = "pageInfo";
    elPageInfo.style.fontSize = "12px";
    elPageInfo.style.opacity = "0.8";

    elPageSize = document.createElement("select");
    elPageSize.id = "pageSize";

    bar.appendChild(elPrev);
    bar.appendChild(elNext);
    bar.appendChild(elPageInfo);

    const label = document.createElement("span");
    label.textContent = "Rows/page:";
    label.style.fontSize = "12px";
    label.style.opacity = "0.8";
    bar.appendChild(label);

    bar.appendChild(elPageSize);

    // Insert pager after status line if possible, else at end of body
    const statusEl = document.getElementById("status");
    if (statusEl && statusEl.parentNode) {
      statusEl.parentNode.insertBefore(bar, statusEl.nextSibling);
    } else {
      document.body.appendChild(bar);
    }
  }

  // ==== STATE ====
  let headers = [];
  let allRows = []; // raw data rows (array of arrays of strings)
  let excludedIdx = new Set();

  // Search + pagination state
  let query = "";
  let filteredIndices = []; // indices into allRows that match query
  let pageSize = DEFAULT_PAGE_SIZE;
  let page = 1; // 1-based

  // ==== HELPERS ====
  function setStatus(msg) {
    elStatus.textContent = msg;
  }

  function showError(msg) {
    elErr.hidden = false;
    elErr.textContent = msg;
    setStatus("Error.");
  }

  function hideError() {
    elErr.hidden = true;
    elErr.textContent = "";
  }

  // Basic CSV parser with quoted fields support
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
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

    row.push(cur);
    rows.push(row);

    // Trim trailing empty row if present
    if (
      rows.length &&
      rows[rows.length - 1].length === 1 &&
      rows[rows.length - 1][0] === ""
    ) {
      rows.pop();
    }
    return rows;
  }

  function computeExcludedIdx() {
    excludedIdx = new Set();
    if (!EXCLUDE_FROM_SEARCH.length) return;

    const lower = EXCLUDE_FROM_SEARCH.map((s) => String(s).toLowerCase());
    headers.forEach((h, i) => {
      if (lower.includes(String(h || "").toLowerCase())) excludedIdx.add(i);
    });
  }

  function buildHeader() {
    elThead.innerHTML = "";
    const trh = document.createElement("tr");
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h || "";
      trh.appendChild(th);
    });
    elThead.appendChild(trh);
  }

  function rowToSearchText(row) {
    const values = row.map((v) => (v ?? "").toString());
    while (values.length < headers.length) values.push("");
    return values
      .filter((_, idx) => !excludedIdx.has(idx))
      .join(" ")
      .toLowerCase();
  }

  function rebuildFilteredIndices() {
    const q = (query || "").trim().toLowerCase();

    if (!q) {
      filteredIndices = Array.from({ length: allRows.length }, (_, i) => i);
      return;
    }

    filteredIndices = [];
    for (let i = 0; i < allRows.length; i++) {
      const txt = rowToSearchText(allRows[i]);
      if (txt.includes(q)) filteredIndices.push(i);
    }
  }

  function totalPages() {
    return Math.max(1, Math.ceil(filteredIndices.length / pageSize));
  }

  function clampPage() {
    const tp = totalPages();
    if (page < 1) page = 1;
    if (page > tp) page = tp;
  }

  function updatePagerUI() {
    const tp = totalPages();
    const start = filteredIndices.length === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, filteredIndices.length);

    elPrev.disabled = page <= 1;
    elNext.disabled = page >= tp;

    elPageInfo.textContent = `Page ${page.toLocaleString()} / ${tp.toLocaleString()} • Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${filteredIndices.length.toLocaleString()} matched rows`;

    elCount.textContent = `${filteredIndices.length.toLocaleString()} matched rows`;
  }

  function renderPage() {
    clampPage();

    elTbody.innerHTML = "";

    if (filteredIndices.length === 0) {
      updatePagerUI();
      setStatus("Loaded.");
      return;
    }

    const startIdx = (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filteredIndices.length);

    const frag = document.createDocumentFragment();

    for (let i = startIdx; i < endIdx; i++) {
      const rowIndex = filteredIndices[i];
      const r = allRows[rowIndex] || [];

      const tr = document.createElement("tr");
      const values = r.map((v) => (v ?? "").toString());
      while (values.length < headers.length) values.push("");

      for (const v of values) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      }

      frag.appendChild(tr);
    }

    elTbody.appendChild(frag);
    updatePagerUI();
    setStatus("Loaded.");
  }

  function applyQuery(newQuery) {
    query = newQuery || "";
    page = 1; // reset to first page on new search
    setStatus("Filtering…");
    // Filtering can be expensive; yield to UI once
    setTimeout(() => {
      rebuildFilteredIndices();
      renderPage();
    }, 0);
  }

  function setupPageSizeSelector() {
    elPageSize.innerHTML = "";
    for (const s of PAGE_SIZES) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = String(s);
      if (s === pageSize) opt.selected = true;
      elPageSize.appendChild(opt);
    }

    elPageSize.addEventListener("change", () => {
      const v = Number(elPageSize.value);
      if (!Number.isFinite(v) || v <= 0) return;
      pageSize = v;
      page = 1;
      renderPage();
    });
  }

  async function load() {
    try {
      hideError();
      setStatus("Loading from Google Sheets…");

      const res = await fetch(CSV_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

      const csvText = await res.text();
      const rows = parseCSV(csvText);
      if (!rows.length) throw new Error("CSV returned no rows.");

      headers = rows[0] || [];
      allRows = rows.slice(1);

      computeExcludedIdx();
      buildHeader();

      // Initial filter state = all rows
      filteredIndices = Array.from({ length: allRows.length }, (_, i) => i);

      ensurePagerUI();
      setupPageSizeSelector();
      renderPage();
    } catch (e) {
      showError(String(e?.message || e));
    }
  }

  // ==== EVENTS ====
  elQ.addEventListener("input", () => applyQuery(elQ.value));
  elClear.addEventListener("click", () => {
    elQ.value = "";
    elQ.focus();
    applyQuery("");
  });

  ensurePagerUI();
  setupPageSizeSelector();

  elPrev.addEventListener("click", () => {
    page -= 1;
    renderPage();
  });

  elNext.addEventListener("click", () => {
    page += 1;
    renderPage();
  });

  // ==== GO ====
  load();
})();
