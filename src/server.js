import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = normalize(join(__dirname, "..", "public"));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const demoUserId = "demo-user";
const connectedAccounts = new Map();
const sources = new Map();
const jobs = new Map();

const providerDefinitions = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    handle: "@clipro-studio",
    status: "available",
    authModel: "OAuth 2.0",
    scopes: ["youtube.readonly"],
    syncMode: "Uploads playlist and completed live broadcasts",
    color: "#ff0033"
  },
  twitch: {
    id: "twitch",
    label: "Twitch",
    handle: "clipro_live",
    status: "available",
    authModel: "OAuth authorization code",
    scopes: ["user:read:email"],
    syncMode: "Broadcaster VODs and stream lifecycle events",
    color: "#9146ff"
  },
  kick: {
    id: "kick",
    label: "Kick",
    handle: "clipro",
    status: "preview",
    authModel: "OAuth 2.1 with PKCE",
    scopes: ["user:read", "channel:read"],
    syncMode: "Channel livestreams and videos when enabled",
    color: "#38d430"
  }
};

const sampleSources = {
  youtube: [
    {
      title: "Building the ranked grind from zero",
      type: "Video",
      durationSeconds: 5720,
      publishedAt: "2026-06-16T18:30:00.000Z",
      thumbnailTone: "coral",
      externalUrl: "https://www.youtube.com/watch?v=clipro-youtube-001",
      status: "ready"
    },
    {
      title: "Creator Q&A: what actually keeps viewers watching",
      type: "Live replay",
      durationSeconds: 7420,
      publishedAt: "2026-06-14T21:00:00.000Z",
      thumbnailTone: "teal",
      externalUrl: "https://www.youtube.com/live/clipro-youtube-002",
      status: "ready"
    },
    {
      title: "Full workshop: editing hooks for short-form",
      type: "Video",
      durationSeconds: 3895,
      publishedAt: "2026-06-09T15:15:00.000Z",
      thumbnailTone: "slate",
      externalUrl: "https://www.youtube.com/watch?v=clipro-youtube-003",
      status: "ready"
    }
  ],
  twitch: [
    {
      title: "Late night ranked stream with chat challenges",
      type: "VOD",
      durationSeconds: 10840,
      publishedAt: "2026-06-17T03:20:00.000Z",
      thumbnailTone: "violet",
      externalUrl: "https://www.twitch.tv/videos/clipro-twitch-001",
      status: "ready"
    },
    {
      title: "Tournament prep and review",
      type: "VOD",
      durationSeconds: 9044,
      publishedAt: "2026-06-12T00:10:00.000Z",
      thumbnailTone: "indigo",
      externalUrl: "https://www.twitch.tv/videos/clipro-twitch-002",
      status: "ready"
    }
  ],
  kick: [
    {
      title: "Community stream highlights candidate",
      type: "Stream replay",
      durationSeconds: 6830,
      publishedAt: "2026-06-15T22:45:00.000Z",
      thumbnailTone: "green",
      externalUrl: "https://kick.com/clipro/videos/clipro-kick-001",
      status: "ready"
    }
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function hashNumber(input, index = 0) {
  const digest = createHash("sha256").update(`${input}:${index}`).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16);
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getProvider(providerId) {
  const provider = providerDefinitions[providerId];
  if (!provider) {
    throw new Error("Unsupported provider.");
  }
  return provider;
}

function serializeAccount(account) {
  const provider = getProvider(account.provider);
  const providerSources = Array.from(sources.values()).filter(
    (source) => source.accountId === account.id
  );

  return {
    ...account,
    providerLabel: provider.label,
    providerColor: provider.color,
    syncMode: provider.syncMode,
    sourceCount: providerSources.length
  };
}

function serializeSource(source) {
  const account = connectedAccounts.get(source.accountId);
  const provider = getProvider(source.provider);

  return {
    ...source,
    providerLabel: provider.label,
    providerColor: provider.color,
    accountHandle: account?.handle || provider.handle,
    durationLabel: formatDuration(source.durationSeconds),
    jobCount: Array.from(jobs.values()).filter((job) => job.sourceId === source.id).length
  };
}

function serializeJob(job) {
  const source = sources.get(job.sourceId);
  return {
    ...job,
    source: source ? serializeSource(source) : null,
    ageSeconds: Math.max(0, Math.round((Date.now() - new Date(job.createdAt).getTime()) / 1000))
  };
}

function connectAccount(providerId) {
  const provider = getProvider(providerId);
  const existing = Array.from(connectedAccounts.values()).find(
    (account) => account.provider === providerId
  );

  if (existing) {
    existing.status = "connected";
    existing.updatedAt = new Date().toISOString();
    syncProviderSources(existing.id);
    return existing;
  }

  const now = new Date().toISOString();
  const account = {
    id: randomUUID(),
    userId: demoUserId,
    provider: provider.id,
    handle: provider.handle,
    status: "connected",
    authModel: provider.authModel,
    scopes: provider.scopes,
    connectedAt: now,
    updatedAt: now,
    lastSyncedAt: null
  };

  connectedAccounts.set(account.id, account);
  syncProviderSources(account.id);
  return account;
}

function disconnectAccount(accountId) {
  const account = connectedAccounts.get(accountId);
  if (!account) {
    throw new Error("Account not found.");
  }

  account.status = "disconnected";
  account.updatedAt = new Date().toISOString();
  return account;
}

function syncProviderSources(accountId) {
  const account = connectedAccounts.get(accountId);
  if (!account) {
    throw new Error("Account not found.");
  }

  const providerSamples = sampleSources[account.provider] || [];
  const existingSources = Array.from(sources.values()).filter((source) => source.accountId === accountId);
  const now = new Date().toISOString();

  providerSamples.forEach((sample, index) => {
    const externalId = `${account.provider}-${index + 1}`;
    const existing = existingSources.find((source) => source.externalId === externalId);

    if (existing) {
      existing.status = sample.status;
      existing.updatedAt = now;
      return;
    }

    const sourceId = randomUUID();
    sources.set(sourceId, {
      id: sourceId,
      accountId,
      provider: account.provider,
      externalId,
      title: sample.title,
      type: sample.type,
      durationSeconds: sample.durationSeconds,
      publishedAt: sample.publishedAt,
      thumbnailTone: sample.thumbnailTone,
      externalUrl: sample.externalUrl,
      status: sample.status,
      importStatus: "synced",
      createdAt: now,
      updatedAt: now
    });
  });

  account.lastSyncedAt = now;
  account.updatedAt = now;
  return providerSamples.length;
}

function createManualSource(payload) {
  if (typeof payload.sourceUrl !== "string" || !payload.sourceUrl.trim()) {
    throw new Error("A source URL is required.");
  }

  let url;
  try {
    url = new URL(payload.sourceUrl.trim());
  } catch {
    throw new Error("Enter a valid YouTube, Twitch, or Kick URL.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let provider = null;
  if (host === "youtu.be" || host.endsWith("youtube.com")) provider = "youtube";
  if (host.endsWith("twitch.tv")) provider = "twitch";
  if (host.endsWith("kick.com")) provider = "kick";
  if (!provider) {
    throw new Error("Supported sources are YouTube, Twitch, and Kick.");
  }

  const providerDefinition = getProvider(provider);
  let account = Array.from(connectedAccounts.values()).find((item) => item.provider === provider);
  if (!account) {
    account = connectAccount(provider);
  }

  const now = new Date().toISOString();
  const source = {
    id: randomUUID(),
    accountId: account.id,
    provider,
    externalId: `manual-${hashNumber(url.toString())}`,
    title: payload.title || `Manual ${providerDefinition.label} source`,
    type: url.pathname.includes("live") ? "Live replay" : "Video",
    durationSeconds: clampNumber(payload.durationSeconds, 600, 28800, 5400),
    publishedAt: now,
    thumbnailTone: provider === "youtube" ? "coral" : provider === "twitch" ? "violet" : "green",
    externalUrl: url.toString(),
    status: "ready",
    importStatus: "manual",
    createdAt: now,
    updatedAt: now
  };

  sources.set(source.id, source);
  return source;
}

function generateClips(job) {
  const source = sources.get(job.sourceId);
  const sourceTitle = source?.title || "Source";
  const titleSeeds = {
    Gaming: ["Clutch moment", "Chat goes off", "Fast reset", "Endgame swing"],
    Podcast: ["Sharp takeaway", "Best quote", "Contrarian point", "Story payoff"],
    Education: ["Clear breakdown", "Key lesson", "Simple framework", "Common mistake"],
    Stream: ["Peak reaction", "Chat spike", "Unexpected turn", "Instant replay"],
    General: ["Best moment", "High-retention clip", "Clean highlight", "Standout segment"]
  };
  const reasons = [
    "Strong hook within the first three seconds and a clean payoff.",
    "Dense transcript section with low dead air and a natural ending.",
    "Good short-form setup: context, tension, reaction, resolution.",
    "Likely retention spike based on pacing and topic change.",
    "Works well with captions and a vertical crop."
  ];

  const titles = titleSeeds[job.settings.category] || titleSeeds.General;
  const minDuration = job.settings.minDuration;
  const maxDuration = job.settings.maxDuration;
  const durationRange = Math.max(1, maxDuration - minDuration);
  const maxStart = Math.max(120, (source?.durationSeconds || 5400) - maxDuration - 60);

  return Array.from({ length: job.settings.clipCount }, (_, index) => {
    const hash = hashNumber(`${job.sourceId}-${sourceTitle}`, index);
    const start = 20 + (hash % maxStart);
    const duration = minDuration + (hash % durationRange);
    const score = 64 + (hash % 34);
    const title = titles[index % titles.length];

    return {
      id: randomUUID(),
      jobId: job.id,
      sourceId: job.sourceId,
      title,
      timestamp: `${formatDuration(start)}-${formatDuration(start + duration)}`,
      start,
      end: start + duration,
      duration,
      score,
      reason: reasons[index % reasons.length],
      format: job.settings.format,
      captions: job.settings.captions,
      downloadUrl: "#",
      status: "ready"
    };
  }).sort((a, b) => b.score - a.score);
}

function createJob(payload) {
  const sourceId = payload.sourceId;
  const source = sources.get(sourceId);
  if (!source) {
    throw new Error("Select a synced source first.");
  }

  const clipCount = clampNumber(payload.clipCount, 1, 12, 5);
  const minDuration = clampNumber(payload.minDuration, 10, 90, 20);
  const maxDuration = clampNumber(payload.maxDuration, minDuration + 5, 180, 60);
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    userId: demoUserId,
    sourceId,
    createdAt: now,
    updatedAt: now,
    status: "Queued",
    progress: 0,
    error: null,
    clips: [],
    settings: {
      clipCount,
      minDuration,
      maxDuration,
      category: typeof payload.category === "string" ? payload.category : "General",
      format: typeof payload.format === "string" ? payload.format : "9:16",
      captions: payload.captions !== false
    }
  };

  jobs.set(job.id, job);
  runMockPipeline(job.id);
  return job;
}

function runMockPipeline(jobId) {
  const steps = [
    { status: "Importing source", progress: 14, delay: 250 },
    { status: "Transcribing audio", progress: 42, delay: 700 },
    { status: "Scoring moments", progress: 68, delay: 1100 },
    { status: "Rendering clips", progress: 90, delay: 1450 },
    { status: "Ready", progress: 100, delay: 1850 }
  ];

  for (const step of steps) {
    setTimeout(() => {
      const job = jobs.get(jobId);
      if (!job) return;

      job.status = step.status;
      job.progress = step.progress;
      job.updatedAt = new Date().toISOString();

      if (step.status === "Ready") {
        job.clips = generateClips(job);
      }
    }, step.delay);
  }
}

function getDashboard() {
  const accountList = Array.from(connectedAccounts.values()).map(serializeAccount);
  const sourceList = Array.from(sources.values())
    .map(serializeSource)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const jobList = Array.from(jobs.values())
    .map(serializeJob)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const clips = jobList.flatMap((job) =>
    job.clips.map((clip) => ({
      ...clip,
      source: job.source,
      jobStatus: job.status
    }))
  );

  return {
    providers: Object.values(providerDefinitions),
    accounts: accountList,
    sources: sourceList,
    jobs: jobList,
    clips,
    metrics: {
      connectedAccounts: accountList.filter((account) => account.status === "connected").length,
      sources: sourceList.length,
      activeJobs: jobList.filter((job) => !["Ready", "Failed"].includes(job.status)).length,
      readyClips: clips.length
    }
  };
}

async function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requestedPath = normalize(join(publicDir, pathname));

  if (!requestedPath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(requestedPath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const fileStat = await stat(requestedPath);
  if (!fileStat.isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(requestedPath)] || "application/octet-stream"
  });
  createReadStream(requestedPath).pipe(response);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(response, 200, getDashboard());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/accounts/connect") {
    try {
      const payload = await readJsonBody(request);
      const account = connectAccount(payload.provider);
      sendJson(response, 201, { account: serializeAccount(account), dashboard: getDashboard() });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/accounts/disconnect") {
    try {
      const payload = await readJsonBody(request);
      const account = disconnectAccount(payload.accountId);
      sendJson(response, 200, { account: serializeAccount(account), dashboard: getDashboard() });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sources/sync") {
    try {
      const payload = await readJsonBody(request);
      if (payload.accountId) {
        syncProviderSources(payload.accountId);
      } else if (payload.provider) {
        const account = Array.from(connectedAccounts.values()).find(
          (item) => item.provider === payload.provider
        );
        if (!account) throw new Error("Connect this account before syncing.");
        syncProviderSources(account.id);
      } else {
        Array.from(connectedAccounts.values())
          .filter((account) => account.status === "connected")
          .forEach((account) => syncProviderSources(account.id));
      }
      sendJson(response, 200, getDashboard());
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sources/manual") {
    try {
      const payload = await readJsonBody(request);
      const source = createManualSource(payload);
      sendJson(response, 201, { source: serializeSource(source), dashboard: getDashboard() });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    try {
      const payload = await readJsonBody(request);
      const job = createJob(payload);
      sendJson(response, 201, { job: serializeJob(job), dashboard: getDashboard() });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "Route not found." });
}

connectAccount("youtube");

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Internal server error." });
    } else {
      response.end();
    }
  }
});

server.listen(port, host, () => {
  console.log(`ClipRO is running at http://${host}:${port}`);
});
