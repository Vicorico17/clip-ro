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
const setupHeading = document.querySelector("#setupHeading");
const setupSummary = document.querySelector("#setupSummary");
const setupProgressBar = document.querySelector("#setupProgressBar");
const openOnboardingButton = document.querySelector("#openOnboardingButton");
const onboardingOverlay = document.querySelector("#onboardingOverlay");
const closeOnboardingButton = document.querySelector("#closeOnboardingButton");
const onboardingForm = document.querySelector("#onboardingForm");
const onboardingTitle = document.querySelector("#onboardingTitle");
const onboardingStepLabel = document.querySelector("#onboardingStepLabel");
const onboardingBackButton = document.querySelector("#onboardingBackButton");
const onboardingNextButton = document.querySelector("#onboardingNextButton");
const onboardingError = document.querySelector("#onboardingError");
const onboardingReview = document.querySelector("#onboardingReview");
const onboardingStepNodes = [...document.querySelectorAll(".onboarding-step")];
const onboardingDots = [...document.querySelectorAll(".step-dots span")];

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

const onboardingStorageKey = "clipro.creatorOnboarding.v1";
const onboardingSessionKey = "clipro.creatorOnboarding.seen";
const onboardingSteps = [
  { title: "Creator profile", label: "Step 1 of 4" },
  { title: "Content accounts", label: "Step 2 of 4" },
  { title: "Clip defaults", label: "Step 3 of 4" },
  { title: "Review setup", label: "Step 4 of 4" }
];

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
let onboardingStep = 0;
let clipDefaultsApplied = false;

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

function getCreatorProfile() {
  try {
    return JSON.parse(localStorage.getItem(onboardingStorageKey) || "null");
  } catch {
    return null;
  }
}

function saveCreatorProfile(profile) {
  localStorage.setItem(onboardingStorageKey, JSON.stringify(profile));
}

function getOnboardingData() {
  const formData = new FormData(onboardingForm);
  return {
    creatorName: String(formData.get("creatorName") || "").trim(),
    creatorCategory: formData.get("creatorCategory") || "General",
    goal: formData.get("goal") || "Grow audience",
    platforms: formData.getAll("platforms"),
    primaryPlatform: formData.get("primaryPlatform") || "youtube",
    defaultFormat: formData.get("defaultFormat") || "9:16",
    defaultClipCount: Number(formData.get("defaultClipCount") || 5),
    defaultMinDuration: Number(formData.get("defaultMinDuration") || 20),
    defaultMaxDuration: Number(formData.get("defaultMaxDuration") || 60),
    postingPace: formData.get("postingPace") || "Daily",
    defaultCaptions: formData.has("defaultCaptions"),
    autoSync: formData.has("autoSync")
  };
}

function setFormValue(name, value) {
  const field = onboardingForm.elements[name];
  if (!field || value === undefined || value === null) return;

  if (field instanceof RadioNodeList && field[0]?.type === "checkbox") {
    [...field].forEach((checkbox) => {
      checkbox.checked = Array.isArray(value) && value.includes(checkbox.value);
    });
    return;
  }

  if (field instanceof RadioNodeList) {
    field.value = value;
    return;
  }

  if (field.type === "checkbox") {
    field.checked = Boolean(value);
    return;
  }

  field.value = value;
}

function loadCreatorProfileIntoForm(profile) {
  if (!profile) return;

  Object.entries(profile).forEach(([key, value]) => {
    setFormValue(key, value);
  });
}

function applyCreatorDefaults(profile) {
  if (!profile) return;

  if (clipForm.elements.category) clipForm.elements.category.value = profile.creatorCategory || "General";
  if (clipForm.elements.format) clipForm.elements.format.value = profile.defaultFormat || "9:16";
  if (clipForm.elements.clipCount) clipForm.elements.clipCount.value = profile.defaultClipCount || 5;
  if (clipForm.elements.minDuration) clipForm.elements.minDuration.value = profile.defaultMinDuration || 20;
  if (clipForm.elements.maxDuration) clipForm.elements.maxDuration.value = profile.defaultMaxDuration || 60;
  if (clipForm.elements.captions) clipForm.elements.captions.checked = profile.defaultCaptions !== false;
}

function platformLabel(platformId) {
  return dashboard.providers.find((provider) => provider.id === platformId)?.label || platformId;
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

function renderSetupSummary() {
  const profile = getCreatorProfile();
  const completedSteps = [
    Boolean(profile?.creatorCategory),
    Boolean(profile?.platforms?.length),
    Boolean(profile?.defaultFormat),
    Boolean(profile?.completedAt)
  ].filter(Boolean).length;
  const progress = profile?.completedAt ? 100 : Math.max(0, completedSteps * 25);

  setupProgressBar.style.width = `${progress}%`;

  if (!profile?.completedAt) {
    setupHeading.textContent = "Set up creator workspace";
    openOnboardingButton.textContent = "Start setup";
    setupSummary.innerHTML = `
      <span class="mini-pill">Creator profile</span>
      <span class="mini-pill">Platforms</span>
      <span class="mini-pill">Clip defaults</span>
    `;
    return;
  }

  const name = profile.creatorName || `${profile.creatorCategory} creator`;
  setupHeading.textContent = `${name} is ready`;
  openOnboardingButton.textContent = "Edit setup";
  setupSummary.innerHTML = `
    <span class="mini-pill is-ready">${escapeHtml(profile.goal)}</span>
    <span class="mini-pill">${escapeHtml(profile.creatorCategory)}</span>
    <span class="mini-pill">${escapeHtml(profile.defaultFormat)}</span>
    <span class="mini-pill">${escapeHtml(profile.defaultClipCount)} clips/source</span>
    <span class="mini-pill">${escapeHtml(profile.postingPace)}</span>
  `;
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
  renderSetupSummary();
  updateMetrics();
  renderAccounts();
  renderSources();
  renderSelectedSource();
  renderJobs();
  renderClipFilter();
  renderClips();
}

function validateOnboardingStep() {
  const data = getOnboardingData();

  if (onboardingStep === 1 && !data.platforms.length) {
    return "Choose at least one platform.";
  }

  if (onboardingStep === 2) {
    if (!Number.isFinite(data.defaultClipCount) || data.defaultClipCount < 1 || data.defaultClipCount > 12) {
      return "Clips per source must be between 1 and 12.";
    }
    if (data.defaultMaxDuration <= data.defaultMinDuration) {
      return "Max seconds must be greater than min seconds.";
    }
  }

  return "";
}

function renderOnboardingReview() {
  const data = getOnboardingData();
  const platforms = data.platforms.map(platformLabel).join(", ") || "None";
  const name = data.creatorName || "Creator";

  onboardingReview.innerHTML = `
    <div class="review-row">
      <span>Creator</span>
      <strong>${escapeHtml(name)}</strong>
    </div>
    <div class="review-row">
      <span>Content</span>
      <strong>${escapeHtml(data.creatorCategory)} · ${escapeHtml(data.goal)}</strong>
    </div>
    <div class="review-row">
      <span>Platforms</span>
      <strong>${escapeHtml(platforms)}</strong>
    </div>
    <div class="review-row">
      <span>Defaults</span>
      <strong>${escapeHtml(data.defaultClipCount)} clips · ${escapeHtml(data.defaultFormat)} · ${escapeHtml(data.defaultMinDuration)}-${escapeHtml(data.defaultMaxDuration)}s</strong>
    </div>
  `;
}

function renderOnboardingStep() {
  const step = onboardingSteps[onboardingStep];
  onboardingTitle.textContent = step.title;
  onboardingStepLabel.textContent = step.label;
  onboardingError.textContent = "";

  onboardingStepNodes.forEach((node, index) => {
    node.classList.toggle("is-hidden", index !== onboardingStep);
  });
  onboardingDots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === onboardingStep);
    dot.classList.toggle("is-complete", index < onboardingStep);
  });

  onboardingBackButton.disabled = onboardingStep === 0;
  onboardingNextButton.textContent = onboardingStep === onboardingSteps.length - 1 ? "Finish setup" : "Next";

  if (onboardingStep === onboardingSteps.length - 1) {
    renderOnboardingReview();
  }
}

function openOnboarding() {
  loadCreatorProfileIntoForm(getCreatorProfile());
  onboardingStep = 0;
  renderOnboardingStep();
  onboardingOverlay.classList.remove("is-hidden");
  document.body.classList.add("has-modal");
  onboardingForm.elements.creatorName?.focus();
}

function closeOnboarding() {
  onboardingOverlay.classList.add("is-hidden");
  document.body.classList.remove("has-modal");
  sessionStorage.setItem(onboardingSessionKey, "1");
}

async function finishOnboarding() {
  const data = getOnboardingData();
  const profile = {
    ...data,
    defaultClipCount: clampNumber(data.defaultClipCount, 1, 12, 5),
    defaultMinDuration: clampNumber(data.defaultMinDuration, 10, 90, 20),
    defaultMaxDuration: clampNumber(data.defaultMaxDuration, 15, 180, 60),
    completedAt: new Date().toISOString()
  };

  saveCreatorProfile(profile);
  applyCreatorDefaults(profile);
  clipDefaultsApplied = true;

  for (const provider of profile.platforms) {
    const account = findAccount(provider);
    if (account?.status === "connected") continue;
    await requestJson("/api/accounts/connect", {
      method: "POST",
      body: JSON.stringify({ provider })
    });
  }

  if (profile.autoSync) {
    await requestJson("/api/sources/sync", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  closeOnboarding();
  await loadDashboard();
}

function maybeOpenOnboarding() {
  const profile = getCreatorProfile();
  if (profile?.completedAt || sessionStorage.getItem(onboardingSessionKey)) return;
  openOnboarding();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

async function loadDashboard() {
  dashboard = await requestJson("/api/dashboard");
  if (!selectedSourceId && dashboard.sources[0]) {
    selectedSourceId = dashboard.sources[0].id;
  }
  if (!clipDefaultsApplied) {
    const profile = getCreatorProfile();
    if (profile?.completedAt) {
      applyCreatorDefaults(profile);
      clipDefaultsApplied = true;
    }
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

openOnboardingButton.addEventListener("click", openOnboarding);
closeOnboardingButton.addEventListener("click", closeOnboarding);
onboardingOverlay.addEventListener("click", (event) => {
  if (event.target === onboardingOverlay) closeOnboarding();
});

onboardingBackButton.addEventListener("click", () => {
  onboardingStep = Math.max(0, onboardingStep - 1);
  renderOnboardingStep();
});

onboardingNextButton.addEventListener("click", async () => {
  const error = validateOnboardingStep();
  if (error) {
    onboardingError.textContent = error;
    return;
  }

  if (onboardingStep < onboardingSteps.length - 1) {
    onboardingStep += 1;
    renderOnboardingStep();
    return;
  }

  onboardingNextButton.disabled = true;
  onboardingError.textContent = "";
  try {
    await finishOnboarding();
  } catch (error) {
    onboardingError.textContent = error.message;
  } finally {
    onboardingNextButton.disabled = false;
  }
});

onboardingForm.addEventListener("input", () => {
  if (onboardingStep === onboardingSteps.length - 1) {
    renderOnboardingReview();
  }
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

loadDashboard()
  .then(maybeOpenOnboarding)
  .finally(startPolling);
