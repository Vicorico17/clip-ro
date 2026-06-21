# Clipping Best Practices

This is the working source of truth for ClipRO's clipping strategy. Use it to collect raw notes, compare approaches, and turn proven practices into product rules that produce strong clips with controlled processing cost.

## Goal

Generate short clips from long-form videos, VODs, and streams that are:

- Likely to retain viewers in the first 3 seconds.
- Understandable without the full source context.
- Native to the target platform and format.
- Cheap enough to process at scale.
- Consistent with the creator's voice and channel goals.

## Working Principles

1. Start with low-cost signals before using expensive AI.
2. Score many candidate moments, but render only the best few.
3. Prefer clips with a complete mini-story: setup, payoff, and clean exit.
4. Optimize for platform fit, not just transcript excitement.
5. Keep every automated decision explainable so creators can trust or edit it.
6. Automate the boring work, but keep rights, platform rules, and posting safety explicit.

## Raw Notes Inbox

Add new clipping observations here before turning them into product rules.

| Topic | Note | Source | Confidence | Action |
| --- | --- | --- | --- | --- |
| Hook |  |  | Low / Medium / High |  |
| Retention |  |  | Low / Medium / High |  |
| Captions |  |  | Low / Medium / High |  |
| Platform |  |  | Low / Medium / High |  |
| Cost |  |  | Low / Medium / High |  |

## Clip Selection Pipeline

### 1. Ingest

- Import metadata: title, description, duration, publish date, platform, category.
- Reuse platform captions when available.
- Download or process only the media ranges needed for transcript and render previews.
- Store source-level metadata separately from generated clip attempts.

### 2. Transcript And Segments

- Use existing captions first because they are usually cheaper than transcription.
- Fall back to transcription only when captions are missing, low quality, or unavailable.
- Segment transcript into candidate windows with speaker turns, pauses, and sentence boundaries.
- Keep timestamps precise enough for frame-accurate rendering later.

### 3. Candidate Detection

Generate candidate moments from cheap signals first:

- Transcript keywords: conflict, surprise, strong opinion, clear takeaway, question, answer.
- Audio changes: laughter, volume spikes, silence before payoff, crowd or chat reaction.
- Visual changes: scene cuts, face closeups, screen changes, gameplay action, slides.
- Chat or engagement signals where available: spikes in messages, emotes, likes, comments.
- Source structure: intros, chapter markers, Q&A sections, highlight timestamps.

### 4. Scoring

Score each candidate with a weighted model:

| Signal | What To Reward | Cost |
| --- | --- | --- |
| Hook strength | Clear tension, question, bold claim, emotional line in first 3 seconds | Low |
| Standalone clarity | Clip makes sense without earlier context | Medium |
| Payoff | Joke, reveal, result, lesson, or strong conclusion | Medium |
| Pacing | Low dead air, tight sentence flow, minimal filler | Low |
| Platform fit | Good length, aspect ratio, topic, and tone for destination | Low |
| Creator fit | Matches saved creator category, goals, and defaults | Low |
| Safety | Avoids copyright risk, sensitive content, or brand mismatch | Medium |
| Editability | Clean cut points and room for captions | Low |

Default scoring formula:

```text
score =
  hook * 0.25 +
  clarity * 0.20 +
  payoff * 0.20 +
  pacing * 0.15 +
  platform_fit * 0.10 +
  creator_fit * 0.05 +
  editability * 0.05
```

Apply safety as a gate, not just a score. A clip that fails safety should not be rendered automatically.

### 5. AI Review

Use AI selectively:

- Run AI scoring only on the top transcript candidates from cheap heuristics.
- Ask for structured output: hook, context, payoff, risks, suggested title, and confidence.
- Avoid sending full videos or full transcripts when candidate windows are enough.
- Cache AI judgments by source ID, transcript hash, candidate timestamp, and scoring prompt version.

### 6. Render

- Render only final selected clips and user-requested previews.
- Generate captions from transcript segments instead of re-transcribing rendered clips.
- Use preset render profiles for 9:16, 1:1, and 16:9.
- Keep source media cached for a short window, then expire it.
- Save render settings with each clip so outputs are reproducible.

### 7. Schedule And Learn

- Send only approved clips to the scheduler.
- Start with conservative posting frequency for new channels.
- Pull performance data after enough impressions exist.
- Compare new results against a saved baseline before changing strategy.
- Pause automation when quality, rights, or performance checks fail.

## Automation Architecture

The strongest pattern is a four-part agent system:

| Role | Responsibility | Cost Control |
| --- | --- | --- |
| Scout | Find promising source videos and candidate moments using metadata, transcript, comments, chat, and view velocity. | Prevents wasting transcription, rendering, or API credits on weak inputs. |
| Muscle | Cut, crop, caption, and render clips locally or through a paid clipping API. | Runs only after Scout approves candidates. |
| Soul | Write hooks, titles, descriptions, hashtags, and schedule-ready post copy. | Uses short candidate context instead of full source transcripts. |
| Analyst | Read performance data, compare experiments, and propose strategy changes. | Updates strategy only when results beat a baseline. |

The target is not blind autoposting. The target is a system that can run cheaply, explain its choices, and stop itself when it is unsure.

### Agent Harness Option

ClipRO can eventually expose the same pipeline through an agent harness so a creator can trigger work from chat.

Example command:

```text
Clip the latest approved source for this channel. Pick the 5 strongest moments, render them for Shorts/Reels/TikTok, and schedule approved drafts for the next 3 days.
```

Required agent tools:

| Tool | Responsibility |
| --- | --- |
| Source adapter | Find the latest approved source and confirm rights status. |
| Clip provider | Send a URL to a cloud clipper or dispatch a local render job. |
| Scheduler | Create drafts or scheduled posts through Postiz or another scheduler. |
| Analytics reader | Pull views, retention, saves, comments, follows, and posting status. |
| Strategy store | Read and update approved strategy files after review gates pass. |

Recommended third-party shape:

```text
Hermes/OpenClaw-style agent
  -> ClipRO API
  -> local worker or cloud clip API
  -> scheduler provider API
  -> analytics importer
  -> Analyst review
```

The agent should call ClipRO APIs rather than directly mutating local strategy files. That keeps permissions, logs, source rights, and approval gates inside the product.

### Chat Trigger And Cron Workflow

Manual chat trigger:

```text
Clip this approved YouTube URL. Create 5 vertical clips, draft captions, and send them to the configured scheduler for review.
```

Daily cron trigger:

```text
Every day at 8:00, check approved creator profiles for new uploads.
If a new source exists, run Scout.
If Scout approves it, render clips locally or send to the configured clipping provider.
Create scheduler drafts for the configured platforms and posting windows.
Send a summary back to Telegram or WhatsApp.
```

The cron job should create drafts by default. Autoposting should require `autopost_enabled: true`, a healthy account status, and a recent successful review history.

### Creator Profiles

Each creator or campaign should have its own profile so scaling does not mix rights, style, or posting rules.

```json
{
  "id": "creator_001",
  "source_channel": "youtube:channel_id",
  "rights_status": "approved",
  "processing_mode": "local",
  "platforms": ["youtube_shorts", "instagram_reels", "tiktok"],
  "daily_post_cap": 3,
  "posting_windows": ["09:00", "12:00", "18:00"],
  "caption_style": "default-bold-keywords",
  "autopost_enabled": false,
  "review_required_until": "baseline_quality_proven"
}
```

Use separate profiles for multiple creators, even when the same agent runs them. This keeps analytics, strategy, and permissions isolated.

## Processing Modes

### Local Mode

Use local processing when cost control and pixel-level control matter more than speed.

Recommended stack:

- `yt-dlp` for permitted source downloads.
- Whisper Small for transcription when platform captions are unavailable or unusable.
- `ffmpeg` for cuts, crops, captions, and final renders.
- Local folders for source files, raw cuts, final clips, and backups.

Default flow:

```text
source URL
  -> metadata and rights check
  -> existing captions or local Whisper
  -> manifest.json
  -> raw timestamp cuts
  -> styled captions and format render
  -> final quality check
  -> scheduler
```

Whisper Small is the default local transcription model because it is a practical speed and accuracy tradeoff. Larger models should be reserved for sources where caption accuracy is visibly hurting clip quality.

### Cloud API Mode

Use cloud clipping APIs when speed and low local CPU usage matter more than per-clip cost.

Default flow:

```text
source URL
  -> metadata and rights check
  -> Scout approval
  -> clipping API request
  -> completed clip download
  -> final quality check
  -> scheduler
```

The Scout step still matters in cloud mode. Paid clipping APIs often have credit or monthly clip limits, so ClipRO should spend credits only on sources that pass trend, fit, and rights checks.

Cloud provider adapter requirements:

- `submit_source`: sends an approved URL or media file for clipping.
- `get_status`: polls provider job status.
- `download_clip`: downloads finished clips.
- `get_credits`: checks remaining monthly credits before submitting.
- `cancel_job`: stops work when rights, quality, or budget checks fail.

Provider adapters should normalize output into the same `manifest.json` contract used by local mode.

### Hybrid Recommendation

Default to local mode for owned channels, long back catalogs, and routine daily clipping. Use cloud mode for time-sensitive sources, overflow, or when local transcription/render queues are backed up.

## File Contract

Use `manifest.json` as the source of truth between scoring, rendering, captions, and scheduling.

Example:

```json
{
  "id": "clip_001",
  "source_id": "youtube:abc123",
  "start": 567.4,
  "end": 602.4,
  "title": "Westworld-like situation",
  "hook": "We're basically in a Westworld-like situation...",
  "tags": ["#Shorts", "#AI", "#Growth"],
  "format": "9:16",
  "caption_style": "default-bold-keywords",
  "local_path": "/workspace/clips/final/clip_001.mp4",
  "render_status": "ok",
  "rights_status": "owned_or_licensed",
  "review_status": "approved"
}
```

Expected local folders:

| Folder | Purpose |
| --- | --- |
| `/downloads` | Temporary landing zone for permitted source files. |
| `/raw` | Precision-cut clips before styling. |
| `/final` | Captioned and formatted clips ready for quality review. |
| `/backups` | Known-good strategy, prompt, and render settings for rollback. |

## Channel Warm-Up And Posting Controls

For new channels, avoid launching straight into heavy automation. Use a conservative warm-up so the account has normal human activity and the content direction is clear.

Suggested first two weeks:

| Period | Posting | Manual Activity | Notes |
| --- | --- | --- | --- |
| Days 1-3 | 0 automated posts | Watch niche content, like selectively, leave real comments. | Train taste and collect style references. |
| Days 4-7 | 0 automated posts | Follow relevant creators and search niche keywords. | Capture hooks, pacing, captions, and visual styles to emulate legally. |
| Day 8 | 1 post | Review first clip manually before scheduling. | Avoid external links on brand-new accounts. |
| Week 2 | 1 post/day | Continue light real engagement. | Increase only if quality and retention are acceptable. |
| Week 3+ | 2-3 posts/day | Review performance and comments. | Do not optimize for volume over quality. |

Hard limits:

- Never post clips without rights to the source material.
- Never use automation to fake engagement, impersonate users, or evade platform rules.
- Keep a manual approval option for new channels and new strategies.
- Cap new channels at low posting frequency until baseline quality is proven.

## 30-Day Operating Playbook

Use this as a measured validation plan, not a guarantee of revenue.

| Phase | Goal | Posting | Decision Rule |
| --- | --- | --- | --- |
| Week 1 | Test platform signal. | Up to 3 approved clips/day across 2-3 platforms. | Keep source, captions, and hook style stable so results are comparable. |
| Week 2 | Double down on the best signal. | Increase the winning platform first, not every platform at once. | Add a second account only if quality review remains manageable. |
| Week 3 | Add monetization paths. | Keep volume stable while adding campaign or payout-network tracking. | Track payout eligibility, rights terms, and attribution requirements per campaign. |
| Week 4 | Scale or pivot. | Scale only if views and retention improve without quality or account-health issues. | Pivot niche, hook style, or source pool if results are flat. |

Do not use `60 posts/day` as a default product target. Treat high volume as an advanced mode that requires mature rights tracking, account health monitoring, duplicate-content checks, and strong quality scores.

## Scaling Model

Scale in this order:

1. One creator or niche.
2. One account.
3. One winning platform.
4. More clips on that platform.
5. More platforms.
6. More accounts.
7. More creators.

Every scaling step needs a rollback condition. If account health, clip quality, retention, or rights confidence drops, return to the previous stable level.

Suggested caps:

| Stage | Cap | Requirement To Increase |
| --- | --- | --- |
| New profile | 1-3 posts/day | Manual review and no account-health issues. |
| Proven profile | 3-5 posts/day | Consistent retention and no duplicate-content issues. |
| Advanced profile | 6-9 posts/day | Mature rights tracking, analytics loop, and strong quality scores. |

Do not optimize for the raw number of posts. Optimize for approved, differentiated clips with measurable retention.

## Monetization Paths

ClipRO should support multiple monetization models without assuming any single one will work.

| Model | How It Works | Product Requirement |
| --- | --- | --- |
| Creator-paid clipping | Creator or streamer pays per view, per clip, or per campaign. | Store campaign rules, allowed source channels, payout terms, and required tags. |
| Brand UGC rewards | Brand pays for approved clips under a campaign brief. | Validate campaign brief, disclosure text, deadline, and platform requirements. |
| Platform revenue share | Account earns from platform monetization. | Track platform eligibility and avoid reused-content or policy violations. |
| Owned-brand growth | Clips drive awareness, follows, email capture, or product traffic. | Attribute source clip to downstream goals, not only views. |

For payout networks, add campaign constraints before scheduling:

- Allowed source material.
- Required hashtags, mentions, or disclaimers.
- Payout metric and minimum thresholds.
- Platform list and posting window.
- Duplicate-content rules.
- Rights and takedown terms.

## Style DNA

Turn manual research into reusable creator preferences:

- Hook pattern: first sentence, text overlay, visual reveal, question, contradiction, or outcome.
- Visual style: clean, loud, minimalist, tactical, cinematic, educational, or raw.
- Pacing: calm explanation, tight cuts, reaction-heavy, tutorial rhythm, or high-energy montage.
- Caption style: font, highlight color, line length, placement, keyword emphasis, and safe zones.
- Content promise: entertainment, insight, founder story, news reaction, tutorial, or opinion.

These preferences should feed scoring and rendering. The system should not produce generic template clips when a creator has a clear style.

## Analyst Loop

The Analyst should treat every strategy change as an experiment.

Core files:

| File | Purpose |
| --- | --- |
| `baseline.json` | Current champion strategy, scoring weights, caption style, and posting defaults. |
| `experiments.json` | Proposed changes, test windows, expected impact, and status. |
| `/backups` | Previous known-good versions for rollback. |

Verdicts:

- `KEEP`: The experiment beats the champion baseline on defined metrics such as views, retention, saves, follows, or click-through.
- `KILL`: The experiment underperforms and should be reverted.
- `REVIEW`: Results are inconclusive or have safety/rights concerns.

Circuit breaker:

- Pause new experiment proposals after 3 consecutive `KILL` verdicts.
- Require human review before changing strategy again.
- Pause immediately if rights, account health, or platform safety checks fail.

Do not let an agent rewrite strategy directly from tiny samples. Require minimum impressions, minimum watch time, and enough posts per experiment to reduce noise.

### Metrics To Import

| Metric | Why It Matters |
| --- | --- |
| Views | Top-level reach, but noisy by itself. |
| 3-second retention | Measures hook quality. |
| Average watch percentage | Measures pacing and payoff. |
| Rewatches | Indicates dense value, humor, or surprise. |
| Saves | Strong signal for utility or identity content. |
| Shares | Strong signal for resonance and controversy. |
| Comments | Useful for topic mining and follow-up hooks. |
| Follows per 1,000 views | Measures account growth quality. |
| Takedowns or restrictions | Hard safety/account-health signal. |

Use normalized metrics per platform. A clip that wins on TikTok may not win on YouTube Shorts or X.

## Cost Control Strategy

### Cheapest First

1. Platform metadata.
2. Existing captions.
3. Transcript heuristics.
4. Lightweight audio or visual analysis.
5. AI scoring on candidate windows.
6. Full media rendering.

### Avoid

- Transcribing videos that already have acceptable captions.
- Running AI over entire source transcripts by default.
- Rendering every candidate before ranking.
- Reprocessing unchanged sources.
- Storing large media files indefinitely.
- Sending every source to a paid clipping API before Scout has filtered it.
- Scaling accounts or platforms before the niche has proven signal.

### Cache Keys

Use stable cache keys so retries and setting changes do not waste work:

```text
source:{platform}:{external_id}
transcript:{source_id}:{caption_track_or_audio_hash}
candidate:{source_id}:{start_ms}:{end_ms}:{strategy_version}
ai_score:{candidate_id}:{prompt_version}:{model}
render:{candidate_id}:{format}:{caption_style}:{render_version}
```

## Platform Defaults

| Platform | Format | Target Length | Notes |
| --- | --- | --- | --- |
| TikTok | 9:16 | 20-45s | Fast hook, captions, minimal intro context. |
| Instagram Reels | 9:16 | 15-45s | Strong visual crop and clean caption styling. |
| YouTube Shorts | 9:16 | 20-60s | Clear topic and searchable title matter more. |
| X / Twitter | 16:9 or 1:1 | 30-90s | Works well for takes, reactions, and explainers. |
| LinkedIn | 1:1 or 16:9 | 30-90s | Prefer clear insight, professional framing, less hype. |

## Clip Quality Checklist

Before marking a generated clip as ready:

- The first 3 seconds create curiosity or context.
- The clip has no long dead air at the beginning or end.
- The viewer can understand who or what is being discussed.
- The ending feels intentional, not randomly cut.
- Captions are readable and do not cover important visuals.
- The crop keeps the main subject visible.
- The title matches the actual clip content.
- The clip respects creator defaults and target platform.
- The source is owned, licensed, or otherwise cleared for clipping.
- The post copy does not imply false endorsement, identity, or affiliation.

## Rights And Compliance Checklist

This is product safety, not optional polish.

- Only ingest sources from connected owned channels, licensed libraries, explicit creator permissions, or other approved sources.
- Do not ask the system to clip "the latest episode" from a creator unless that creator, campaign, or source is explicitly approved.
- Store proof of source permission where possible: account ownership, license ID, agreement link, or approval note.
- Respect platform API terms, rate limits, and automation rules.
- Do not design workflows to bypass detection, simulate fake engagement, or misrepresent account activity.
- Give creators a kill switch that pauses ingest, rendering, scheduling, and posting.
- Log every scheduled post with source, clip ID, render settings, copy, destination, and posting time.

## External Claims To Verify

Keep market claims out of product logic until they are sourced.

| Claim Type | How To Use It |
| --- | --- |
| Clipper payout screenshots | Treat as market research, not proof of repeatable revenue. |
| Named creator or platform payout numbers | Verify from primary sources before using in marketing. |
| API pricing or feature claims | Check vendor docs at integration time. |
| Platform automation advice | Check platform terms before encoding behavior. |
| CPM ranges by niche | Verify current campaign marketplaces and payout terms before forecasting revenue. |
| Views per page per month | Treat as scenario modeling, not a baseline expectation. |
| Hermes/Postiz integration claims | Verify current MCP, skill, and API docs before implementation. |

## Scheduler Candidates

ClipRO should use a scheduler adapter so Postiz, Zernio, or future providers can be swapped without changing the clipping pipeline.

| Scheduler | Status | Notes |
| --- | --- | --- |
| Postiz | Candidate | Known reference from current research. Verify hosted/self-hosted API, MCP, supported platforms, analytics, and write permissions before implementation. |
| Zernio | User-suggested candidate | Need official docs or API details before estimating integration complexity. Track whether it supports drafts, scheduled posts, analytics, account health, and multi-profile workflows. |

## Reference Implementations

Use these as implementation references, not as direct product requirements.

| Resource | What It Does | Useful Ideas For ClipRO | Caveats |
| --- | --- | --- | --- |
| [SaarD00/AI-Youtube-Shorts-Generator](https://github.com/SaarD00/AI-Youtube-Shorts-Generator) | Generates faceless Shorts from a topic using Gemini, Bark/Colab voice generation, Pexels stock footage, and FFmpeg composition. | Modular pipeline shape, FFmpeg composer, silence removal, 9:16 render settings, stock/scene asset management, final output folder conventions. | It creates new videos rather than clipping existing creator footage, so source ingest, rights checks, transcript timestamps, and clip scoring still need ClipRO-specific design. |

Reusable patterns from the faceless-video generator:

- Keep generation modules separate: writer, audio, asset manager, composer, orchestrator.
- Use JSON scene or clip plans as the contract between AI planning and FFmpeg rendering.
- Normalize final MP4 exports with H.264, `yuv420p`, and `faststart` for broad platform compatibility.
- Trim silence before composition so pacing improves without expensive AI review.
- Keep intermediate assets in predictable folders so failed renders can be inspected and retried.

## Product Rules To Implement

Move notes here once they are ready to become code.

| Rule | Why It Matters | Implementation Area | Status |
| --- | --- | --- | --- |
| Prefer source captions before transcription | Reduces cost and latency | Ingest / transcript adapter | Proposed |
| Score candidates before rendering | Avoids expensive throwaway renders | Job worker | Proposed |
| Require a hook score for all candidates | Keeps ranking focused on viewer retention | Scoring | Proposed |
| Cache AI scores by prompt version | Prevents duplicate model calls | Processing cache | Proposed |
| Treat safety as a gate | Avoids publishing risky clips | Moderation / review | Proposed |
| Support local and cloud processing modes | Balances cost, speed, and CPU usage | Worker / provider adapters | Proposed |
| Require `manifest.json` for render handoff | Keeps clipping, captions, and scheduling reproducible | Processing contract | Proposed |
| Add analyst circuit breaker | Prevents bad strategy loops from compounding | Experiment system | Proposed |
| Store source rights status | Prevents unauthorized clipping workflows | Ingest / source model | Proposed |
| Add scheduler provider adapter | Allows Postiz or future schedulers behind one interface | Scheduler adapter | Proposed |
| Add cloud clip provider adapter | Allows Vugola/Opus/Wayin-style services without changing pipeline | Provider adapter | Proposed |
| Track campaign constraints | Enables payout-network workflows without violating briefs | Monetization / campaign model | Proposed |
| Import normalized analytics | Lets Analyst compare platforms and experiments fairly | Analytics importer | Proposed |

## Open Questions

- Which creator categories should get different scoring weights?
- What is the minimum acceptable caption quality before retranscription?
- Should streams use chat spikes as a primary candidate signal?
- How many clips should be generated automatically per source by default?
- Which render presets should be free, paid, or delayed batch jobs?
- What source-rights proof should be required before autoposting?
- What minimum sample size is needed before the Analyst can keep or kill an experiment?
- Which scheduler should ClipRO integrate with first?
- Which cloud clipping provider should be the first adapter?
- What daily posting caps should apply by account age, platform, and account health?
- Which monetization model should ClipRO optimize for first: owned creators, clipping campaigns, or brand UGC?

## Experiment Log

Track real tests here so decisions are based on outcomes.

| Date | Source Type | Strategy Tested | Result | Decision |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
