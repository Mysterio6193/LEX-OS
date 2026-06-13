# <p align="center"><img src="frontend/src/app/icon.svg" width="48" height="48" alt="lexOS Logo" /><br/>lexOS — AI Operating System for Law Firms</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.0--Draft-blue?style=for-the-badge&logo=github" alt="Release Version" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-red?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Stack-Next.js%20%7C%20Express%20%7C%20Supabase-purple?style=for-the-badge" alt="Stack" />
</p>

---

## 1. Executive Summary

**lexOS** is an open-source, persistent **AI Operating System for Law Firms** designed to transform how legal practices operate, collaborate, and deliver value. Unlike traditional legal tech tools that are stateless and disconnected, **lexOS** serves as a unified, intelligent system that remembers client preferences, matter history, and institutional precedents across the entire legal lifecycle.

---

## 2. Product Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         lexOS: AI OPERATING SYSTEM                            │
│                         FOR LAW FIRMS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: MEMORY & KNOWLEDGE GRAPH (The "Brain")                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Case Memory │  │Client Memory│  │ Firm Memory │  │ Market Mem  │ │   │
│  │  │ (Per Matter)│  │(Per Client) │  │(Institutional)│  │(External)   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │  Technology: Vector DB + Relational DB + RAG                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: INTELLIGENT AI AGENTS (The "Staff")                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Document │ │ Research │ │Diligence │ │ Workflow │ │  Client  │   │   │
│  │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │  Technology: LLM Orchestration + Automated Toolchains               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 3: WORKSPACE & COLLABORATION (The "Office")                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │  Matter  │ │  Real-   │ │ Knowledge│ │  Client  │ │  Admin   │   │   │
│  │  │Workspace │ │time Collab│ │  Sharing │ │  Portal  │ │  Panel   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │  Technology: React/Next.js + WebSockets + Real-time Sync            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 4: INTEGRATION & INFRASTRUCTURE (The "Foundation")            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │   DMS    │ │  Billing │ │ Calendar │ │  Email   │ │ Security │   │   │
│  │  │  APIs    │ │   APIs   │ │  APIs    │ │  APIs    │ │  Layer   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │  Technology: REST APIs + OAuth2 + Encryption + Object Storage       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Technology Stack
* **Frontend:** Next.js, React 19, TypeScript, Tailwind CSS, Lucide Icons
* **Backend:** Node.js (Express), TypeScript
* **Relational DB / Auth:** Supabase (PostgreSQL)
* **Object Storage:** Cloudflare R2 (or any S3-compatible storage)
* **LLM Engine:** Multi-model integration supporting Google Gemini, Anthropic Claude, and OpenAI GPT-4

---

## 3. Contents
* [frontend/](file:///Users/mihirsachdev/Downloads/mike-main/frontend) — Next.js client application
* [backend/](file:///Users/mihirsachdev/Downloads/mike-main/backend) — Express API and document processing workers
* [backend/schema.sql](file:///Users/mihirsachdev/Downloads/mike-main/backend/schema.sql) — Postgres schema for fresh database deployment
* [backend/oss-migrations/](file:///Users/mihirsachdev/Downloads/mike-main/backend/oss-migrations) — Incremental SQL migrations for existing database shape changes

---

## 4. Prerequisites
* **Runtime:** Node.js 20 or newer, `npm`
* **Relational Database:** A Supabase project
* **Object Storage:** A Cloudflare R2 bucket (or other S3-compatible API)
* **LLM API Key:** At least one supported model provider (Gemini, Anthropic, or OpenAI)
* **Legal Research:** An Indian Kanoon API token to enable Indian case law lookup and citation verification
* **Local Conversions:** LibreOffice installed locally if you require `.doc` / `.docx` file conversion to `.pdf`

---

## 5. Setup & Configuration

### 5.1 Environment Setup
Create local env configurations in both directories:
```bash
touch backend/.env
touch frontend/.env.local
```

#### `backend/.env` Configuration:
```ini
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=replace-with-a-random-32-byte-hex-string
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key

# S3-compatible Object Storage (e.g. Cloudflare R2)
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=lexos-bucket

# LLM Providers
GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
RESEND_API_KEY=your-resend-key
USER_API_KEYS_ENCRYPTION_SECRET=your-long-random-secret

# Indian Kanoon Integration (Case Law Research)
INDIANKANOON_API_TOKEN=your-indiankanoon-token
```

#### `frontend/.env.local` Configuration:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

### 5.2 Database Setup
To initialize a fresh Supabase database instance, open the **Supabase SQL Editor** and execute the full content of:
* [backend/schema.sql](file:///Users/mihirsachdev/Downloads/mike-main/backend/schema.sql)

For updating existing deployments, run the incremental migration files sequentially from [backend/oss-migrations/](file:///Users/mihirsachdev/Downloads/mike-main/backend/oss-migrations).

---

## 6. Persistent Memory Layer

**lexOS** implements the PRD's Layer 1 memory architecture inside every project (matter) workspace:

1. **Matter Memory** — the assistant saves key decisions, facts, and preferences via its `save_memory` tool; entries persist across chat sessions, are injected into every project chat's context, and are curated in the project's **Memory** tab.
2. **Matter Deadlines** — date-bound obligations are captured via the `save_deadline` tool (or manually in the **Deadlines** tab), tracked with overdue flags, and surfaced to the assistant in every chat.
3. **Client Memory** — link a matter to a client from **Project Details**; the client's preference notes plus preference memories saved across *all* of that client's matters are applied in every linked chat.
4. **Precedent Library** — mark any document as a firm precedent (row menu → *Mark as precedent*); precedents from other matters become readable, citable drafting templates in every project chat.
5. **Conflict Checking** — matters record their parties (client, counterparty, opposing counsel, witness) via the **Parties** tab or the `save_party` tool; the `check_conflicts` tool and the *Run conflict check* button match a name against parties and clients across all your matters, flagging potential conflicts for lawyer review.
6. **Matter Timeline** — the **Timeline** tab shows a chronological, filterable feed of everything in a matter (documents, versions, chats, memories, deadlines, parties), aggregated on the fly with no extra storage.
7. **Checklists & Templates** — track work in the **Checklist** tab; seed it from built-in matter templates (M&A diligence, NDA review, litigation, lease analysis), add items manually, or let the assistant capture them via `save_task`.
8. **Matter Overview** — the default **Overview** tab summarises the client, parties, upcoming deadlines, open tasks, key decisions, and recent activity at a glance, with a *Draft status report* action that composes a client-ready update.
9. **Cloning & Archival** — clone a matter's memory/parties/tasks into a new matter, and archive closed matters out of the default lists while keeping them accessible.
10. **Firm Knowledge Search** — the `search_firm_knowledge` tool lets the assistant answer "how do we usually handle X" by searching memories, deadlines, tasks, parties, clients, and document names across all your matters, citing the matter each result came from.

For existing deployments, apply the corresponding migrations from [backend/oss-migrations/](backend/oss-migrations) — `20260612_project_memories.sql`, `20260612_project_deadlines.sql`, `20260612_clients.sql`, `20260612_precedents.sql`, `20260612_project_parties.sql`, `20260612_project_tasks.sql`, and `20260612_project_archive.sql`. Fresh databases get all of this from `schema.sql`.

---

## 7. Indian Kanoon Integration

**lexOS** features dedicated tools to research Indian case law, retrieve judgements, and verify citations natively using the Indian Kanoon API:
1. **Case Search:** Run semantic query searches against Indian judgements, tribunals, and laws.
2. **Document Retrieval:** Fetch full judgement texts and opinions.
3. **Citation Matching:** Verify citing precedents dynamically in the chat workspace.

Configure the provider key in `backend/.env` (using `INDIANKANOON_API_TOKEN`) or allow users to save their own token under **Account > Models & API Keys** to enable these features.

---

## 8. Installation & Running

### 8.1 Install Dependencies
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 8.2 Run Development Servers
Start backend:
```bash
npm run dev --prefix backend
```

Start frontend client:
```bash
npm run dev --prefix frontend
```

Open your browser at `http://localhost:3000`.

### 8.3 Build for Production
```bash
# Build backend TypeScript
npm run build --prefix backend

# Build frontend using Webpack
npm run build --prefix frontend
```
