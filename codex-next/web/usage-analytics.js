const state = {
  limit: 50,
  offset: 0,
  total: 0,
};

const form = document.getElementById("filters-form");
const kindSelect = document.getElementById("filter-kind");
const decisionSelect = document.getElementById("filter-decision");
const modelSelect = document.getElementById("filter-model");
const cwdInput = document.getElementById("filter-cwd");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const resetButton = document.getElementById("reset-button");
const pageLabel = document.getElementById("page-label");
const statusChip = document.getElementById("status-chip");
const errorBanner = document.getElementById("error-banner");

function setStatus(text) {
  statusChip.textContent = text;
}

function showError(text) {
  errorBanner.hidden = !text;
  errorBanner.textContent = text ?? "";
}

function toIso(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

function fillSelect(select, values) {
  const current = select.value;
  const nextOptions = ['<option value="">All</option>']
    .concat(values.map((value) => `<option value="${value}">${value}</option>`))
    .join("");
  select.innerHTML = nextOptions;
  if (values.includes(current)) {
    select.value = current;
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  const from = toIso(document.getElementById("filter-from").value);
  const to = toIso(document.getElementById("filter-to").value);
  const kind = kindSelect.value;
  const decision = decisionSelect.value;
  const model = modelSelect.value;
  const cwd = cwdInput.value.trim();

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (kind) params.set("kind", kind);
  if (decision) params.set("decision", decision);
  if (model) params.set("model", model);
  if (cwd) params.set("cwd", cwd);
  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));
  return params;
}

async function getJson(pathname, params = null) {
  const url = params ? `${pathname}?${params.toString()}` : pathname;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function renderMetric(id, value) {
  document.getElementById(id).textContent = String(value);
}

function renderCountList(containerId, counts) {
  const container = document.getElementById(containerId);
  container.replaceChildren();

  for (const [label, count] of Object.entries(counts)) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "count-label";
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = String(count);
    item.append(name, value);
    container.append(item);
  }
}

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function renderBadge(text, className, dataName, dataValue) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  span.dataset[dataName] = dataValue;
  return span;
}

function renderEvents(eventsPayload) {
  const tbody = document.getElementById("events-body");
  tbody.replaceChildren();

  for (const row of eventsPayload.rows) {
    const tr = document.createElement("tr");
    const attempts = `${row.attempts_kind_after}/${row.attempts_total_after}`;

    const cells = [
      formatTimestamp(row.occurred_at),
      renderBadge(row.matched_kind, "event-kind", "kind", row.matched_kind),
      renderBadge(row.decision, "event-decision", "decision", row.decision),
      row.model || "—",
      row.cwd || "—",
      row.turn_id || "—",
      attempts,
    ];

    for (const cellValue of cells) {
      const td = document.createElement("td");
      if (cellValue instanceof Node) {
        td.append(cellValue);
      } else {
        td.textContent = cellValue;
      }
      tr.append(td);
    }

    tbody.append(tr);
  }

  if (eventsPayload.rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No events in the current filter range.";
    tr.append(td);
    tbody.append(tr);
  }

  state.total = eventsPayload.total;
  const start = eventsPayload.total === 0 ? 0 : eventsPayload.offset + 1;
  const end = Math.min(eventsPayload.offset + eventsPayload.rows.length, eventsPayload.total);
  pageLabel.textContent = `${start}-${end} / ${eventsPayload.total}`;
  prevButton.disabled = eventsPayload.offset === 0;
  nextButton.disabled = eventsPayload.offset + eventsPayload.limit >= eventsPayload.total;
}

function renderSummary(summary) {
  renderMetric("metric-total", summary.total);
  renderMetric("metric-continue", summary.continueCount);
  renderMetric("metric-stopped", summary.stopCappedCount);
  renderMetric("metric-allowed", summary.allowStopCount);
  renderMetric("metric-skipped", summary.skipActiveHookCount + summary.skipDuplicateTurnCount);
  renderCountList("kind-breakdown", summary.kindCounts);
  renderCountList("decision-breakdown", summary.decisionCounts);
}

async function loadFacets() {
  const facets = await getJson("/api/facets");
  fillSelect(kindSelect, facets.kinds);
  fillSelect(decisionSelect, facets.decisions);
  fillSelect(modelSelect, facets.models);
}

async function refreshDashboard() {
  setStatus("Loading");
  showError("");
  const params = buildQuery();

  try {
    const [summary, events] = await Promise.all([
      getJson("/api/summary", params),
      getJson("/api/events", params),
    ]);
    renderSummary(summary);
    renderEvents(events);
    setStatus("Ready");
  } catch (error) {
    setStatus("Error");
    showError(error instanceof Error ? error.message : String(error));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.offset = 0;
  await refreshDashboard();
});

resetButton.addEventListener("click", async () => {
  form.reset();
  state.offset = 0;
  await refreshDashboard();
});

prevButton.addEventListener("click", async () => {
  state.offset = Math.max(state.offset - state.limit, 0);
  await refreshDashboard();
});

nextButton.addEventListener("click", async () => {
  if (state.offset + state.limit < state.total) {
    state.offset += state.limit;
    await refreshDashboard();
  }
});

await loadFacets();
await refreshDashboard();
