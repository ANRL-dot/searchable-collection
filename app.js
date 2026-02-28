/* Client UI (JSONP) for Large Sheet Search + cursor paging
 * - Does NOT download entire sheet
 * - Uses Apps Script web app as the data source
 * - Search stays responsive (server scans until it finds a page of matches)
 * - Prev/Next uses cursor history
 */

(() => {
  // ==== CONFIG ====
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzB-8NNBvX9-KAqNzmOpPMPeJBPsrk6kA7cDEm-hFq5T_eiqp7AdviTTzeC53UwcrYh/exec";
  const DEFAULT_PAGE_SIZE = 200;

  // ==== DOM (required) ====
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

  elStatus.parentNode.insertBefore(pager, elStatus.nextSibling);

  // ==== State ====
  let headers = [];
  let q = "";
  let pageSize = DEFAULT_PAGE_SIZE;

  // Cursor paging
  // history[0] is cursor for page 1, etc. Cursor is sheet row number to start scanning at.
  let history = [2]; // start scanning from row 2 (row 1 is header)
  let pageIndex = 0;
  let done = false;

  let debounce = null;

  function setStatus(msg) {
    elStatus.textContent = msg;
  }

  function showError(msg) {
    elErr.hidden = false;
    elErr.textContent = msg;
    setStatus("Error.");
  }

  function clearError() {
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

  function updateUI(shownCount, nextCursor, serverDone) {
    btnPrev.disabled = pageIndex === 0;

    // If the server says done and we are on the last known page cursor, disable Next
    const lastKnown = pageIndex === history.length - 1;
    btnNext.disabled = !!serverDone && lastKnown;

    const humanPage = pageIndex + 1;
    const more = serverDone ? "End of results" : "More available";
    pageInfo.textContent = `Page ${humanPage} • ${more} • Showing ${shownCount} rows`;

    elCount.textContent = `${shownCount.toLocaleString()} rows shown`;
  }

  // JSONP request helper (avoids CORS)
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = `__cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const full = url + (url.includes("?") ? "&" : "?") + "callback=" + encodeURIComponent(cbName);

      const script = document.createElement("script");
      script.src = full;
      script.async = true;

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      function cleanup() {
        try {
          delete window[cbName];
        } catch (_) {
          window[cbName] = undefined;
        }
        script.remove();
      }

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP load failed"));
      };

      document.head.appendChild(script);
    });
  }

  async function loadPage() {
    clearError();
    setStatus("Loading…");

    const cursor = history[pageIndex];

    const url =
      API_URL +
      `?q=${encodeURIComponent(q)}&pageSize=${encodeURIComponent(pageSize)}&cursor=${encodeURIComponent(cursor)}`;

    const data = await jsonp(url);

    if (!data || !data.ok) throw new Error((data && data.error) ? data.error : "Server returned ok=false");

    if (!headers.length) {
      headers = data.headers || [];
      buildHeader(headers);
    }

    renderRows(data.rows || []);

    done = !!data.done;

    // Extend history with nextCursor when we are at the end of history
    if (pageIndex === history.length - 1 && data.nextCursor) {
      history.push(data.nextCursor);
    }

    updateUI((data.rows || []).length, data.nextCursor, done);
    setStatus("Loaded.");
  }

  function resetAndLoad() {
    headers = [];
    history = [2];
    pageIndex = 0;
    done = false;
    elThead.innerHTML = "";
    elTbody.innerHTML = "";
    loadPage().catch((e) => showError(String(e?.message || e)));
  }

  // ==== Events ====
  elQ.addEventListener("input", () => {
    q = elQ.value.trim();
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      resetAndLoad();
    }, 300);
  });

  elClear.addEventListener("click", () => {
    elQ.value = "";
    q = "";
    resetAndLoad();
    elQ.focus();
  });

  selSize.addEventListener("change", () => {
    pageSize = Number(selSize.value) || DEFAULT_PAGE_SIZE;
    resetAndLoad();
  });

  btnPrev.addEventListener("click", () => {
    if (pageIndex > 0) {
      pageIndex -= 1;
      loadPage().catch((e) => showError(String(e?.message || e)));
    }
  });

  btnNext.addEventListener("click", () => {
    // If next cursor already exists in history, move forward
    if (pageIndex < history.length - 1) {
      pageIndex += 1;
      loadPage().catch((e) => showError(String(e?.message || e)));
    } else {
      // Otherwise re-load current page; loadPage will append nextCursor if available
      loadPage().catch((e) => showError(String(e?.message || e)));
    }
  });

  // ==== Initial load ====
  loadPage().catch((e) => showError(String(e?.message || e)));
})();
