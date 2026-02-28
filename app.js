/* ===== Client-side UI that uses server-side search + paging =====
 * Drop-in replacement for app.js
 * Requires index.html elements:
 *   #q, #clear, #count, #status, #err, #tbl thead/tbody
 * Creates Prev/Next + page info automatically.
 */

(() => {
  // ==== CONFIG ====
  const API_URL = "https://script.google.com/macros/s/AKfycbyeuwPih34ngsR-mqM4ntuv0tdkyi5wPNydnvnzCg7znH2AbdZXgDuUAs8fLM2_wkc/exec"; // <-- required

  const DEFAULT_PAGE_SIZE = 200;

  // ==== DOM ====
  const elQ = document.getElementById("q");
  const elClear = document.getElementById("clear");
  const elCount = document.getElementById("count");
  const elStatus = document.getElementById("status");
  const elErr = document.getElementById("err");
  const elThead = document.querySelector("#tbl thead");
  const elTbody = document.querySelector("#tbl tbody");

  if (!elQ || !elClear || !elCount || !elStatus || !elErr || !elThead || !elTbody) {
    console.error("Missing required elements in index.html");
    return;
  }

  // ==== Pager UI (auto) ====
  const pager = document.createElement("div");
  pager.style.display = "flex";
  pager.style.gap = "8px";
  pager.style.alignItems = "center";
  pager.style.flexWrap = "wrap";
  pager.style.marginTop = "10px";

  const btnPrev = document.createElement("button");
  btnPrev.type = "button";
  btnPrev.textContent = "Prev";

  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.textContent = "Next";

  const pageInfo = document.createElement("span");
  pageInfo.style.fontSize = "12px";
  pageInfo.style.opacity = "0.8";

  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = "Rows/page:";
  sizeLabel.style.fontSize = "12px";
  sizeLabel.style.opacity = "0.8";

  const selSize = document.createElement("select");
  [50, 100, 200, 500].forEach((n) => {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = String(n);
    if (n === DEFAULT_PAGE_SIZE) opt.selected = true;
    selSize.appendChild(opt);
  });

  pager.appendChild(btnPrev);
  pager.appendChild(btnNext);
  pager.appendChild(pageInfo);
  pager.appendChild(sizeLabel);
  pager.appendChild(selSize);

  // Insert pager after status
  elStatus.parentNode.insertBefore(pager, elStatus.nextSibling);

  // ==== State ====
  let query = "";
  let page = 1;
  let pageSize = DEFAULT_PAGE_SIZE;
  let totalMatches = 0;
  let headers = [];

  let debounceTimer = null;

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

  function buildHeader(cols) {
    elThead.innerHTML = "";
    const tr = document.createElement("tr");
    cols.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h || "";
      tr.appendChild(th);
    });
    elThead.appendChild(tr);
  }

  function renderRows(rows) {
    elTbody.innerHTML = "";
    const frag = document.createDocumentFragment();

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const values = (r || []).map((v) => (v ?? "").toString());
      while (values.length < headers.length) values.push("");

      values.forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });

      frag.appendChild(tr);
    });

    elTbody.appendChild(frag);
  }

  function updatePager() {
    const totalPages = Math.max(1, Math.ceil(totalMatches / pageSize));
    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= totalPages;

    const start = totalMatches === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalMatches);

    pageInfo.textContent = `Page ${page} / ${totalPages} • Showing ${start}–${end} of ${totalMatches} matches`;
    elCount.textContent = `${totalMatches.toLocaleString()} matched rows`;
  }

  async function loadPage() {
    hideError();
    setStatus("Loading…");

    const url =
      API_URL +
      `?q=${encodeURIComponent(query)}&page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Server returned ok=false");

    // First time, set headers
    if (!headers.length) {
      headers = data.headers || [];
      buildHeader(headers);
    }

    totalMatches = data.totalMatches || 0;

    renderRows(data.rows || []);
    updatePager();
    setStatus("Loaded.");
  }

  function runSearchDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      page = 1;
      loadPage().catch((e) => showError(String(e?.message || e)));
    }, 250);
  }

  // ==== Events ====
  elQ.addEventListener("input", () => {
    query = elQ.value.trim();
    runSearchDebounced();
  });

  elClear.addEventListener("click", () => {
    elQ.value = "";
    query = "";
    page = 1;
    loadPage().catch((e) => showError(String(e?.message || e)));
    elQ.focus();
  });

  btnPrev.addEventListener("click", () => {
    page -= 1;
    loadPage().catch((e) => showError(String(e?.message || e)));
  });

  btnNext.addEventListener("click", () => {
    page += 1;
    loadPage().catch((e) => showError(String(e?.message || e)));
  });

  selSize.addEventListener("change", () => {
    pageSize = Number(selSize.value) || DEFAULT_PAGE_SIZE;
    page = 1;
    loadPage().catch((e) => showError(String(e?.message || e)));
  });

  // ==== Initial load ====
  loadPage().catch((e) => showError(String(e?.message || e)));
})();
