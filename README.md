# ClipRO

ClipRO is a local MVP for a creator platform that turns long-form YouTube videos and YouTube/Twitch/Kick streams into short clips.

## Run

```bash
npm run dev
```

Then open `http://localhost:3000`.

## What Works Now

- Simulated connected accounts for YouTube, Twitch, and Kick.
- First-run creator onboarding for channel profile, platforms, goals, clip defaults, and auto-sync preference.
- Source syncing that imports sample long-form videos, VODs, and stream replays.
- Manual URL import for a YouTube, Twitch, or Kick source.
- Source selection and clip-generation settings.
- In-memory processing jobs with import, transcription, scoring, and rendering states.
- Ranked generated clip cards with timestamps, scores, format, and copy/open actions.

This is intentionally dependency-light and runs with Node only. The account and processing flows are mocked, but the UI and API are shaped around the real product boundaries.

## API Shape

- `GET /api/dashboard`
- `POST /api/accounts/connect`
- `POST /api/accounts/disconnect`
- `POST /api/sources/sync`
- `POST /api/sources/manual`
- `POST /api/jobs`

## Real Integration Plan

1. Replace simulated account connect with OAuth callback routes.
2. Store encrypted provider tokens in `connected_accounts`.
3. Implement provider adapters:
   - YouTube: channel uploads playlist, completed live broadcasts, captions where permitted.
   - Twitch: broadcaster VOD sync and EventSub for stream lifecycle.
   - Kick: OAuth 2.1/PKCE and channel/video APIs.
4. Add durable storage for users, accounts, sources, jobs, transcripts, and clips.
5. Move processing to a worker queue.
6. Add media ingest, transcription, moment scoring, and `ffmpeg` rendering.
7. Add automatic rules such as “generate clips for every new VOD.”

## Product Notes

- [Clipping Best Practices](docs/clipping-best-practices.md) collects the current strategy for finding high-quality clips while keeping processing costs low.
