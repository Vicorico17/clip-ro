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
  coral: "#d83f52",
  teal: "#0f766e",
  slate: "#475569",
  violet: "#7657f4",
  indigo: "#2563eb",
  green: "#13964f"
};

const stageLabels = {
  Queued: "Waiting for ingest",
  "Importing source": "Importing metadata",
  "Transcribing audio": "Building transcript",
  "Scoring moments": "Scoring candidates",
  "Rendering clips": "Rendering approved",
  Ready: "Ready"
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
      const action = connected ? "Disconnect" : provider.status === "preview" ? "Enable" : "Connect";

      return `
        <article class="account-card" style="--provider-color: ${escapeHtml(provider.color)}">
          <div class="account-topline">
            <span class="provider-dot" aria-hidden="true"></span>
            <span class="status-pill ${connected ? "is-ready" : ""}">
              ${connected ? "Connected" : provider.status === "preview" ? "Preview" : "Available"}
            </span>
          </div>
          <div>
            <h3>${escapeHtml(provider.label)}</h3>
            <p>${escapeHtml(provider.syncMode)}</p>
          </div>
          <div class="account-meta">
            <span>${escapeHtml(provider.authModel)}</span>
            <span>${sourceCount} sources</span>
          </div>
          <div class="button-row">
            <button class="primary-button" type="button" data-action="connect" data-provider="${provider.id}">
              ${action}
            </button>
            <button class="secondary-button" type="button" data-action="sync" data-provider="${provider.id}">
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
    sourceList.append(emptyState("No approved sources", "Connect an account or paste an approved source URL."));
    sourceSelect.innerHTML = '<option value="">Choose a source</option>';
    selectedSourceId = "";
    return;
  }

  sourceList.innerHTML = dashboard.sources
    .map((source) => {
      const selected = source.id === selectedSourceId;
      const tone = toneMap[source.thumbnailTone] || source.providerColor;
      return `
        <article class="source-card ${selected ? "is-selected" : ""}" data-source-id="${source.id}">
          <div class="source-media" style="--tone: ${escapeHtml(tone)}">
            <span>${escapeHtml(source.providerLabel.slice(0, 2).toUpperCase())}</span>
          </div>
          <div class="source-content">
            <div class="source-card-header">
              <strong title="${escapeHtml(source.title)}">${escapeHtml(source.title)}</strong>
              <span>${escapeHtml(source.type)}</span>
            </div>
            <p>${escapeHtml(source.providerLabel)} / ${escapeHtml(source.accountHandle)}</p>
            <div class="meta-row">
              <span>${escapeHtml(source.durationLabel)}</span>
              <span>${formatDate(source.publishedAt)}</span>
              <span>${source.jobCount} scout runs</span>
              <span>${escapeHtml(source.importStatus)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  sourceSelect.innerHTML = ['<option value="">Choose a source</option>']
    .concat(
      dashboard.sources.map((source) => {
        return `<option value="${source.id}">${escapeHtml(source.providerLabel)} / ${escapeHtml(source.title)}</option>`;
      })
    )
    .join("");

  if (dashboard.sources.some((source) => source.id === selectedSourceId)) {
    sourceSelect.value = selectedSourceId;
    return;
  }

  selectedSourceId = dashboard.sources[0].id;
  sourceSelect.value = selectedSourceId;
}

function renderSelectedSource() {
  const source = selectedSource();
  selectedSourceBadge.textContent = source
    ? `${source.providerLabel} / ${source.durationLabel}`
    : "No source";
}

function renderJobs() {
  if (!dashboard.jobs.length) {
    jobList.innerHTML = "";
    jobList.append(emptyState("No Scout runs", "Choose a source and score candidate moments."));
    return;
  }

  jobList.innerHTML = dashboard.jobs
    .map((job) => {
      const progress = Math.max(0, Math.min(100, job.progress));
      const ready = job.status === "Ready";
      const clipLabel = job.clips.length === 1 ? "1 approved clip" : `${job.clips.length} approved clips`;

      return `
        <article class="job-card">
          <div class="job-header">
            <div>
              <strong>${escapeHtml(job.source?.title || "Unknown source")}</strong>
              <p>${escapeHtml(job.source?.providerLabel || "")} / ${escapeHtml(job.settings.category)} / ${escapeHtml(job.settings.format)}</p>
            </div>
            <span class="status-pill ${ready ? "is-ready" : ""}">${escapeHtml(stageLabels[job.status] || job.status)}</span>
          </div>
          <div class="progress-track" aria-label="${progress}% complete">
            <span style="width: ${progress}%"></span>
          </div>
          <div class="meta-row">
            <span>${clipLabel}</span>
            <span>${job.settings.minDuration}-${job.settings.maxDuration}s</span>
            <span>${job.settings.captions ? "captions on" : "captions off"}</span>
            <span>${job.ageSeconds}s old</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderClipFilter() {
  const previousValue = clipFilter.value || "all";
  const sourcesWithClips = dashboard.sources.filter((source) =>
    dashboard.clips.some((clip) => clip.sourceId === source.id)
  );

  clipFilter.innerHTML = ['<option value="all">All sources</option>']
    .concat(
      sourcesWithClips.map(
        (source) => `<option value="${source.id}">${escapeHtml(source.providerLabel)} / ${escapeHtml(source.title)}</option>`
      )
    )
    .join("");

  if ([...clipFilter.options].some((option) => option.value === previousValue)) {
    clipFilter.value = previousValue;
  }
}

function scoreTone(score) {
  if (score >= 90) return "High";
  if (score >= 78) return "Good";
  return "Review";
}

function renderClips() {
  const filterValue = clipFilter.value || "all";
  const clips = dashboard.clips
    .filter((clip) => filterValue === "all" || clip.sourceId === filterValue)
    .sort((a, b) => b.score - a.score);

  if (!clips.length) {
    clipGrid.innerHTML = "";
    clipGrid.append(emptyState("No approved clips", "Completed Scout runs will appear here after render."));
    return;
  }

  clipGrid.innerHTML = clips
    .map((clip) => {
      const source = clip.source;
      return `
        <article class="clip-card">
          <div class="clip-preview">
            <div class="phone-frame">
              <span>${escapeHtml(clip.format)}</span>
              <strong>${clip.score}</strong>
            </div>
            <span class="score-label">${scoreTone(clip.score)}</span>
          </div>
          <div class="clip-body">
            <div>
              <h3>${escapeHtml(clip.title)}</h3>
              <div class="meta-row">
                <span>${escapeHtml(source?.providerLabel || "")}</span>
                <span>${escapeHtml(clip.timestamp)}</span>
                <span>${clip.duration}s</span>
              </div>
            </div>
            <p>${escapeHtml(clip.reason)}</p>
            <div class="clip-checks">
              <span>Hook</span>
              <span>Payoff</span>
              <span>Captions</span>
            </div>
            <div class="button-row">
              <button class="secondary-button" type="button" data-action="open" data-url="${escapeHtml(source?.externalUrl || "#")}">
                Open source
              </button>
              <button class="secondary-button" type="button" data-action="copy" data-value="${escapeHtml(clip.timestamp)}">
                Copy time
              </button>
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
    formError.textContent = "";
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
    formError.textContent = "";
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
