# AI Agent Workflow Builder — Nhost + Hasura + PostgreSQL + GraphQL

A full-stack, enterprise-grade mini-n8n workflow automation engine built for chaining AI agent steps with dual-layer permission security, live GraphQL subscriptions, retries, and quota management.

---

## Tech Stack & Core Technologies

- **PostgreSQL**: Relational database with multi-tenant schema, composite constraints, JSONB step configs, and usage aggregation views.
- **Hasura GraphQL Engine / Nhost**: GraphQL API layer with Row-Level Security (RLS) permissions and Hasura Actions.
- **Node.js Execution Engine**: Express backend executing step pipelines (`llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, `approval_gate`), handling retries, template interpolation, and approval gating.
- **LLM Integration**: Real Google Gemini API calls (`gemini-1.5-flash`) with intelligent fallback execution and disclosed delay.
- **Next.js (React)**: Modern dashboard featuring visual workflow canvas, live GraphQL subscription feed, approval modal UI, quota gauge, and cross-org security sandbox.

---

## Directory Structure

```
├── backend/
│   ├── engine/
│   │   ├── executor.js        # Step executor & retry handler
│   │   └── llm.js             # LLM API client (Gemini + fallback)
│   ├── db.js                  # PostgreSQL pool connection
│   ├── server.js              # Hasura Actions & Webhook backend
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   └── components/        # WorkflowBuilder, LiveExecutionConsole, QuotaBar, CrossOrgSecurityTester
│   ├── tailwind.config.js
│   └── package.json
├── hasura/
│   ├── migrations/
│   │   └── 01_init_schema.sql # DDL table definitions & views
│   ├── seeds/
│   │   └── 01_seed_data.sql   # Seed data for Org A & Org B
│   └── metadata/              # Hasura table & action metadata
├── scripts/
│   └── init_db.sh             # PostgreSQL initialization automation script
├── writeup.md                 # 1-page architectural writeup
└── README.md                  # System documentation
```

---

## Quick Start (Local Setup)

### 1. Prerequisites
- Node.js (v18+) & npm
- PostgreSQL 16 (`brew install postgresql@16`)

### 2. Database Initialization
Start PostgreSQL and populate database schema & seeds:
```bash
./scripts/init_db.sh
```
Or manually run:
```bash
psql postgres -c "CREATE DATABASE vocalls_db;"
psql vocalls_db -f hasura/migrations/01_init_schema.sql
psql vocalls_db -f hasura/seeds/01_seed_data.sql
```

### 3. Start Backend Action Server
```bash
cd backend
npm install
# Optional: export GEMINI_API_KEY="your_api_key"
npm start
```
*Backend runs on `http://localhost:4000`*

### 4. Start Next.js Frontend
```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:3000` in browser.*

---

## Dual-Layer Security Verification

1. **Layer 1 (Row-Level Security / Org Scoping)**:
   All queries and mutations check caller's `org_id`. Switch to **Org B (Beta Enterprise)** in top session toolbar and attempt to query or trigger Org A's workflow. Hasura RLS blocks the request with HTTP 403 / zero rows.

2. **Layer 2 (Step-Level Gating & Mid-Execution Action Authorization)**:
   - Adding `db_write` or `notify` steps requires `role == 'owner'`. Editors or Viewers attempting to add these nodes will see a Layer 2 Security Block warning.
   - Clearing an `approval_gate` paused step verifies the approver's role in `org_members` backend table. Viewers cannot approve steps.

---

## Final Task Verification Flow

1. Open  
Deployed Link -
https://vocallabs-aiagent.vercel.app/
2. Select **Org A (Acme AI) — Alice (OWNER)**.
3. Observe workflow containing `llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `notify`, `db_write`.
4. Click **Run Workflow** (or send HTTP POST to `http://localhost:4000/api/webhooks/trigger/wf-acme-0001-0000-0000-000000000001`).
5. Watch live stream execution pulse through steps until hitting `approval_gate` step, transitioning to **PAUSED**.
6. Click **Approve & Resume Execution** — execution resumes and completes remaining steps!
7. Switch session context to **Org B (Beta Enterprise)** and open **Cross-Org Security Sandbox** tab.
8. Click **Attempt Unauthorized Trigger** and **Attempt Unauthorized Approval** — verify 100% security block success response.

9. 
