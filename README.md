# AnyTask.AI ⚡

Autonomous AI agent platform built for learning and executing browser automation tasks, such as intelligent web form filling, DOM inspection, and workflow execution.

---

## 🏗️ Architecture Overview

The repository is structured into two decoupled, full-stack TypeScript environments:

```text
AnyTask.Ai/
├── backend/                  # Node.js + Express + TypeScript + Prisma
│   ├── prisma/
│   │   └── schema.prisma     # PostgreSQL schema (Job & JobLog models)
│   ├── src/
│   │   ├── controllers/      # Express API route controllers (Zod validated)
│   │   ├── routes/           # REST endpoints (/api/jobs, /api/health)
│   │   ├── services/         # Job lifecycle service & Agent execution pipeline
│   │   ├── types/            # TypeScript domain interfaces
│   │   ├── db.ts             # Prisma client & connection manager
│   │   └── index.ts          # Express server entry point (Port 5001)
│   └── .env                  # Port, DATABASE_URL, and OPENAI_API_KEY
│
├── frontend/                 # Next.js (App Router) + TypeScript + Vanilla CSS
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx    # Root layout & SEO meta tags
│   │   │   ├── page.tsx      # Interactive Job Dispatcher & Terminal UI
│   │   │   └── globals.css   # Modern dark-mode styling & micro-animations
│   │   └── lib/
│   │       └── api.ts        # Client helper for backend communication
│   └── package.json
│
└── package.json              # Workspace scripts to run both environments
```

---

## 🚀 Quick Start (Running Locally)

### 1. Start the Express Backend

In your first terminal:

```bash
cd backend
npm install
npm run dev
```

* Backend runs on **`http://localhost:5001`**
* Health check: **`http://localhost:5001/api/health`**
* Includes built-in graceful fallback mode: runs and logs in memory immediately even if your local PostgreSQL database is not yet booted.

### 2. Start the Next.js Frontend

In your second terminal:

```bash
cd frontend
npm install
npm run dev
```

* Open **`http://localhost:3000`** in your browser.
* Try creating a job with the preset buttons (Contact Us, Registration, Application) or input your own target browser URL and custom field values.

---

## 🗄️ PostgreSQL Database Configuration

This project is configured with **Prisma ORM** pointing to PostgreSQL.

1. Open `backend/.env` and supply your database connection string (from local Postgres, [Supabase](https://supabase.com), [Neon](https://neon.tech), or Render):
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/anytask_ai?schema=public"
   ```
2. Generate the Prisma client and apply migrations:
   ```bash
   cd backend
   npm run prisma:generate
   npx prisma db push
   ```

---

## 🤖 Next Step: Connecting OpenAI Agent SDK & Playwright

The modular runner is prepared in [`backend/src/services/jobService.ts`](file:///Users/anshulgusain99/Documents/Portfolio-Projects/AnyTask.Ai/backend/src/services/jobService.ts):

1. **Install Browser Automation & OpenAI Agent SDK:**
   ```bash
   cd backend
   npm install playwright @openai/agents
   npx playwright install chromium
   ```
2. **Add your API Key in `backend/.env`:**
   ```env
   OPENAI_API_KEY="sk-..."
   ```
3. In [`backend/src/services/jobService.ts`](file:///Users/anshulgusain99/Documents/Portfolio-Projects/AnyTask.Ai/backend/src/services/jobService.ts#L220), swap the simulated DOM inspection with Playwright browser controls:
   ```typescript
   import { chromium } from 'playwright';
   
   const browser = await chromium.launch({ headless: false });
   const page = await browser.newPage();
   await page.goto(job.targetUrl);
   // Agent SDK inspects inputs & fills form values
   ```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `GET` | `/api/jobs` | Retrieve all jobs with logs |
| `POST` | `/api/jobs` | Enqueue a new browser task job |
| `GET` | `/api/jobs/:id` | Fetch details & live logs for a specific job |
| `POST` | `/api/jobs/:id/run` | Trigger asynchronous agent execution |
| `POST` | `/api/jobs/:id/cancel` | Cancel an ongoing job |
