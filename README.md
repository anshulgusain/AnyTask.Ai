# AnyTask

Automated QA for web apps. Paste a URL and describe the app; an AI agent opens it in a real browser, signs up with a throwaway account, fills in forms and clicks through the main flows, then reports what works, what's broken, and what it couldn't reach.

When it needs something only you know (an SMS code, an invite link, which account type to pick) it pauses and asks you in the dashboard.

## How it works

```text
warm up ──▶ read home page ──▶ plan goals ──▶ for each goal: observe ─▶ decide ─▶ act ─┐
 (wake Render                    (LLM, from                    ▲                       │
  frontend + API)                 page + your                  └───────────────────────┘
                                  instructions)                 until pass / fail / blocked
```

- **Observe**: `pageObserver.ts` lists every visible interactive element with its real label and page region (`[10] input "IFSC Code" (in form)`). The model acts on those numbers, never on guessed CSS selectors.
- **Decide / act**: `agentLoop.ts` gives the model one tool call per turn: `click`, `fill`, `select_option`, `navigate`, `ask_user`, `report_bug`, `finish`, …
- **Verdicts**: every goal ends as **Pass**, **Fail** (a bug in your site), **Blocked** (captcha, OTP, a skipped question) or **Inconclusive** (the agent got stuck, not necessarily your bug).
- **Site health**: console errors, failed requests and broken links are collected passively during the run.
- **Safety**: a fresh fake identity per run, OTP sends to the fake phone are blocked, payments and deletes need your approval, guardrails stop loops and runaway step counts.

## Run locally

```bash
# backend (http://localhost:5001)
cd backend
cp .env.example .env        # set OPENAI_API_KEY, optionally DATABASE_URL
npm install
npx playwright install chromium
npm run db:push             # only if DATABASE_URL is set
npm run dev

# frontend (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Without `DATABASE_URL` the backend keeps runs in memory. Set `HEADLESS=false` in `backend/.env` (or tick "Show the browser window") to watch the agent work.

Useful scripts in `backend/`:

| Command | What it does |
|---|---|
| `npm run test:observer -- <url>` | Print exactly what the agent sees on a page |
| `npm run test:warmup -- <url>` | Check cold-start handling and backend-API detection for a site |
| `npm run test:guardrails` | Unit checks for loop / budget guardrails |

## Configuration

All settings live in `backend/.env`; see [`backend/.env.example`](backend/.env.example) for the full list. The important ones:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Required. Model used is `AGENT_MODEL` (default `gpt-4.1-mini`). |
| `ANYTASK_API_KEY` | Protects the API. The dashboard asks for it once and keeps it in the browser. |
| `ALLOW_PRIVATE_TARGETS` | Allow localhost / private-network targets. Off by default in production (SSRF protection). |
| `MAX_CONCURRENT_RUNS` | Browsers running at once (default 2); extra runs queue. |
| `SCREENSHOT_STORAGE=s3` + `S3_*` | Store screenshots in S3 / R2 instead of local disk. |
| `TEST_EMAIL_BASE`, `TEST_PHONE` | Route verification emails / OTP SMS to you so sign-up flows can finish. |

## Deploy on Render

[`render.yaml`](render.yaml) defines both services:

- **anytask-backend**: Docker ([`backend/Dockerfile`](backend/Dockerfile), based on the official Playwright image so Chromium works). Runs `prisma db push` on start. Use at least the Standard plan; Chromium doesn't fit in 512 MB next to Node.
- **anytask-frontend**: Node; set `NEXT_PUBLIC_API_URL` to the backend URL + `/api` before the first build.

Set `DATABASE_URL`, `OPENAI_API_KEY`, `ANYTASK_API_KEY`, `CORS_ORIGIN` (the frontend URL) and the `S3_*` variables in the Render dashboard. Render's disk is wiped on every deploy, so use S3/R2 for screenshots.

## API

All `/api/jobs` routes require the API key when `ANYTASK_API_KEY` is set (`Authorization: Bearer <key>` or `?key=<key>`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health, and whether an API key is required |
| `GET` | `/api/jobs` | Latest 50 runs (without logs) |
| `POST` | `/api/jobs` | Create a run: `{ targetUrl, payload: { instructions, fields, headless } }` |
| `GET` | `/api/jobs/:id` | One run with its full log |
| `GET` | `/api/jobs/:id/events` | Server-Sent Events: `snapshot`, then `log` and `job` updates |
| `POST` | `/api/jobs/:id/run` | Start (or queue) the run |
| `POST` | `/api/jobs/:id/cancel` | Cancel a running or queued run |
| `POST` | `/api/jobs/:id/notes` | Send the agent a note mid-run: `{ note }` |
| `POST` | `/api/jobs/:id/submit-field-input` | Answer the agent's question: `{ value }` (empty = skip) |
| `POST` | `/api/jobs/:id/approve-action` | Approve / reject a risky action: `{ approved }` |
| `GET` | `/api/screenshots/:file` | Screenshot image |

## Project layout

```text
backend/src/
  ai/browserAgent.ts   run orchestration: warm-up, identity, browser, goals
  ai/goalPlanner.ts    decides WHAT to test from the live home page
  ai/agentLoop.ts      observe → decide → act loop for one goal, tools, safety rules
  ai/pageObserver.ts   numbered element list the model acts on
  ai/siteMonitor.ts    console / network / broken-link collection
  ai/guardrails.ts     loop, step and error budgets
  services/jobService.ts  job lifecycle, queue, pauses, SSE events
  security.ts          API key + SSRF checks
  storage.ts           screenshot store (local or S3)
frontend/src/
  app/page.tsx         dashboard: new run, run list, live run view
  app/report/          shareable report with Markdown export
  lib/                 API client, SSE hook, report/run-view helpers
```

`frontend/src/app/demo-form` and `demo-store` are small local apps to point the agent at while developing.
