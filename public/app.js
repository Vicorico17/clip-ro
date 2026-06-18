const accountGrid = document.querySelector("#accountGrid");
const sourceList = document.querySelector("#sourceList");
const sourceSelect = document.querySelector("#sourceSelect");
const selectedSourceBadge = document.querySelector("#selectedSourceBadge");
const clipForm = document.querySelector("#clipForm");
const formError = document.querySelector("#formError");
const jobList = document.querySelector("#jobList");
const clipGrid = document.querySelector("#clipGrid");
const clipFilter = document.querySelector("#clipFilter");
const syncAllButton = document.querySelector("#syncAllButton");
const manualSourceToggle = document.querySelector("#manualSourceToggle");
const manualSourceForm = document.querySelector("#manualSourceForm");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");

const metricAccounts = document.querySelector("#metricAccounts");
const metricSources = document.querySelector("#metricSources");
const metricJobs = document.querySelector("#metricJobs");
const metricClips = document.querySelector("#metricClips");

const toneMap = {
  coral: "#cf263f",
  teal: "#0f766e",
  slate: "#334155",
  violet: "#6d4aff",
  indigo: "#2463eb",
  green: "#0f8f50"
};

let dashboard = {
  providers: [],
  accounts: [],
  sources: [],
  jobs: [],
  clips: [],
  metrics: {}
};
let selectedSourceId = "";
let pollTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function findAccount(provider) {
  return dashboard.accounts.find((account) => account.provider === provider);
}

function selectedSource() {
  return dashboard.sources.find((source) => source.id === selectedSourceId);
}

function emptyState(title, body) {
  const node = emptyStateTemplate.content.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("span").textContent = body;
  return node;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function updateMetrics() {
  metricAccounts.textContent = dashboard.metrics.connectedAccounts ?? 0;
  metricSources.textContent = dashboard.metrics.sources ?? 0;
  metricJobs.textContent = dashboard.metrics.activeJobs ?? 0;
  metricClips.textContent = dashboard.metrics.readyClips ?? 0;
}

function renderAccounts() {
  accountGrid.innerHTML = dashboard.providers
    .map((provider) => {
      const account = findAccount(provider.id);
      const connected = account?.status === "connected";
      const sourceCount = account?.sourceCount || 0;
      const statusLabel = connected ? "Connected" : provider.status === "preview" ? "Preview" : "Not connected";
      const action = connected ? "Disconnect" : provider.status === "preview" ? "Enable preview" : "Connect";

      return `
        <article class="account-card" style="--provider-color: ${escapeHtml(provider.color)}">
          <div class="card-header">
            <div class="provider-mark" aria-hidden="true"></div>
            <span class="status-pill ${connected ? "is-connected" : ""}">${statusLabel}</span>
          </div>
          <div>
            <h3>${escapeHtml(provider.label)}</h3>
            <p>${escapeHtml(provider.syncMode)}</p>
          </div>
          <div class="meta-row">
            <span>${escapeHtml(provider.authModel)}</span>
            <span>${sourceCount} sources</span>
          </div>
          <div class="account-actions">
            <button class="primary-button" type="button" data-action="connect" data-provider="${provider.id}">
              ${action}
            </button>
            <button class="text-button" type="button" data-action="sync" data-provider="${provider.id}">
              Sync
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSources() {
  if (!dashboard.sources.length) {
    sourceList.innerHTML = "";
    sourceList.append(emptyState("No sources synced", "Connect an account to import videos and VODs."));
    sourceSelect.innerHTML = '<option value="">Choose a source</option>';
    return;
  }

  sourceList.innerHTML = dashboard.sources
    .map((source) => {
      const selected = source.id === selectedSourceId;
      return `
        <article class="source-card ${selected ? "is-selected" : ""}" data-source-id="${source.id}">
          <div class="thumbnail-strip" style="--tone: ${toneMap[source.thumbnailTone] || source.providerColor}"></div>
          <div class="source-card-header">
            <div class="source-title">
              <strong title="${escapeHtml(source.title)}">${escapeHtml(source.title)}</strong>
              <p>${escapeHtml(source.providerLabel)} · ${escapeHtml(source.accountHandle)}</p>
            </div>
            <span class="source-badge">${escapeHtml(source.type)}</span>
          </div>
          <div class="meta-row">
            <span>${escapeHtml(source.durationLabel)}</span>
            <span>${formatDate(source.publishedAt)}</span>
            <span>${source.jobCount} jobs</span>
            <span>${escapeHtml(source.importStatus)}</span>
          </div>
        </article>
      `;
    })
    .join("");

  const options = ['<option value="">Choose a source</option>'].concat(
    dashboard.sources.map((source) => {
      return `<option value="${source.id}">${escapeHtml(source.providerLabel)} · ${escapeHtml(source.title)}</option>`;
    })
  );
  sourceSelect.innerHTML = options.join("");
  if (dashboard.sources.some((source) => source.id === selectedSourceId)) {
    sourceSelect.value = selectedSourceId;
  } else {
    selectedSourceId = "";
  }
}

function renderSelectedSource() {
  const source = selectedSource();
  if (!source) {
    selectedSourceBadge.textContent = "No source";
    return;
  }

  selectedSourceBadge.textContent = `${source.providerLabel} · ${source.durationLabel}`;
}

function renderJobs() {
  if (!dashboard.jobs.length) {
    jobList.innerHTML = "";
    jobList.append(emptyState("No jobs yet", "Choose a source and generate clips."));
    return;
  }

  jobList.innerHTML = dashboard.jobs
    .map((job) => {
      const progress = Math.max(0, Math.min(100, job.progress));
      const clipLabel = job.clips.length === 1 ? "1 clip" : `${job.clips.length} clips`;

      return `
        <article class="job-card">
          <div class="job-card-header">
            <div>
              <strong>${escapeHtml(job.source?.title || "Unknown source")}</strong>
              <p>${escapeHtml(job.source?.providerLabel || "")} · ${escapeHtml(job.settings.category)} · ${escapeHtml(job.settings.format)}</p>
            </div>
            <span class="status-pill ${job.status === "Ready" ? "is-connected" : ""}">${escapeHtml(job.status)}</span>
          </div>
          <div class="meta-row">
            <span>${clipLabel}</span>
            <span>${job.settings.minDuration}-${job.settings.maxDuration}s</span>
            <span>${job.settings.captions ? "captions" : "no captions"}</span>
          </div>
          <div class="progress-track" aria-label="${progress}% complete">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderClipFilter() {
  const previousValue = clipFilter.value;
  const sourcesWithClips = dashboard.sources.filter((source) =>
    dashboard.clips.some((clip) => clip.sourceId === source.id)
  );

  clipFilter.innerHTML = ['<option value="all">All sources</option>']
    .concat(
      sourcesWithClips.map(
        (source) => `<option value="${source.id}">${escapeHtml(source.providerLabel)} · ${escapeHtml(source.title)}</option>`
      )
    )
    .join("");

  if ([...clipFilter.options].some((option) => option.value === previousValue)) {
    clipFilter.value = previousValue;
  }
}

function renderClips() {
  const filterValue = clipFilter.value || "all";
  const clips = dashboard.clips
    .filter((clip) => filterValue === "all" || clip.sourceId === filterValue)
    .sort((a, b) => b.score - a.score);

  if (!clips.length) {
    clipGrid.innerHTML = "";
    clipGrid.append(emptyState("No clips yet", "Finished jobs will appear here."));
    return;
  }

  clipGrid.innerHTML = clips
    .map((clip) => {
      return `
        <article class="clip-card">
          <div class="clip-preview">
            <span class="clip-score">${clip.score}</span>
            <strong>${escapeHtml(clip.format)}</strong>
          </div>
          <div class="clip-body">
            <div>
              <h3>${escapeHtml(clip.title)}</h3>
              <div class="meta-row">
                <span>${escapeHtml(clip.source?.providerLabel || "")}</span>
                <span>${escapeHtml(clip.timestamp)}</span>
                <span>${clip.duration}s</span>
              </div>
            </div>
            <p>${escapeHtml(clip.reason)}</p>
            <div class="clip-actions">
              <button class="text-button" type="button" data-action="open" data-url="${escapeHtml(clip.source?.externalUrl || "#")}">Open source</button>
              <button class="text-button" type="button" data-action="copy" data-value="${escapeHtml(clip.timestamp)}">Copy time</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function render() {
  updateMetrics();
  renderAccounts();
  renderSources();
  renderSelectedSource();
  renderJobs();
  renderClipFilter();
  renderClips();
}

async function loadDashboard() {
  dashboard = await requestJson("/api/dashboard");
  if (!selectedSourceId && dashboard.sources[0]) {
    selectedSourceId = dashboard.sources[0].id;
  }
  render();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    loadDashboard().catch(() => {});
  }, 1200);
}

accountGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const provider = button.dataset.provider;
  const account = findAccount(provider);

  try {
    if (button.dataset.action === "connect") {
      if (account?.status === "connected") {
        await requestJson("/api/accounts/disconnect", {
          method: "POST",
          body: JSON.stringify({ accountId: account.id })
        });
      } else {
        await requestJson("/api/accounts/connect", {
          method: "POST",
          body: JSON.stringify({ provider })
        });
      }
    }

    if (button.dataset.action === "sync") {
      await requestJson("/api/sources/sync", {
        method: "POST",
        body: JSON.stringify({ provider })
      });
    }

    await loadDashboard();
  } catch (error) {
    formError.textContent = error.message;
  }
});

sourceList.addEventListener("click", (event) => {
  const card = event.target.closest(".source-card");
  if (!card) return;
  selectedSourceId = card.dataset.sourceId;
  sourceSelect.value = selectedSourceId;
  renderSources();
  renderSelectedSource();
});

sourceSelect.addEventListener("change", () => {
  selectedSourceId = sourceSelect.value;
  renderSources();
  renderSelectedSource();
});

syncAllButton.addEventListener("click", async () => {
  try {
    await requestJson("/api/sources/sync", {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadDashboard();
  } catch (error) {
    formError.textContent = error.message;
  }
});

manualSourceToggle.addEventListener("click", () => {
  manualSourceForm.classList.toggle("is-hidden");
});

manualSourceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  const payload = Object.fromEntries(new FormData(manualSourceForm).entries());

  try {
    const result = await requestJson("/api/sources/manual", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    selectedSourceId = result.source.id;
    manualSourceForm.reset();
    manualSourceForm.classList.add("is-hidden");
    await loadDashboard();
  } catch (error) {
    formError.textContent = error.message;
  }
});

clipForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  const formData = new FormData(clipForm);
  const payload = Object.fromEntries(formData.entries());
  payload.sourceId = selectedSourceId || payload.sourceId;
  payload.captions = formData.has("captions");

  try {
    await requestJson("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadDashboard();
  } catch (error) {
    formError.textContent = error.message;
  }
});

clipFilter.addEventListener("change", renderClips);

clipGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.action === "open") {
    window.open(button.dataset.url, "_blank", "noopener,noreferrer");
  }

  if (button.dataset.action === "copy") {
    await navigator.clipboard.writeText(button.dataset.value);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy time";
    }, 900);
  }
});

loadDashboard().finally(startPolling);
