# <p align="center"><img src="frontend/src/app/icon.svg" width="64" height="64" alt="lexOS Logo" /><br/>lexOS</p>
<p align="center"><strong>The AI-Powered Operating System for Modern Law Practices</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.0.0--Stable-3b82f6?style=for-the-badge&logo=github" alt="Release Version" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-ef4444?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Stack-Next.js%20%7C%20Express%20%7C%20Supabase-8b5cf6?style=for-the-badge" alt="Stack" />
  <img src="https://img.shields.io/badge/Demo%20Mode-100%25%20Offline%20Ready-10b981?style=for-the-badge" alt="Demo Mode" />
</p>

---

## 📖 1. Executive Summary

**lexOS** is an open-source, persistent **AI Operating System for Law Firms** designed to transform how legal practices operate, collaborate, and deliver value. 

Unlike traditional legal tech tools that are stateless and disconnected, **lexOS** serves as a unified, intelligent system that remembers client preferences, matter history, and institutional precedents across the entire legal lifecycle.

> [!TIP]
> **Instant Tryout (Demo Mode)**
> lexOS features a fully functional, zero-configuration **Offline Demo Mode**! You can explore all capabilities (deadlines, hearings, client databases, templates, and conflict checks) client-side without spinning up a backend or database. Simply set `NEXT_PUBLIC_DEMO_MODE=true` in your environment.

---

## 🏗️ 2. Product Architecture

lexOS is structured as a robust 4-tier architecture designed for low-latency operations, state persistence, and modular AI integration.

```mermaid
graph TD
    subgraph Layer 1: Memory & Knowledge Graph [The Brain]
        M1[Matter Memory]
        M2[Client Memory]
        M3[Firm Precedent Library]
        M4[Conflict Checking Registry]
    end

    subgraph Layer 2: Intelligent AI Agents [The Staff]
        A1[Document Drafting Agent]
        A2[Case Law Research Agent]
        A3[Diligence & Checklist Agent]
        A4[Workflow Automation Agent]
    end

    subgraph Layer 3: Workspace & Collaboration [The Office]
        W1[Matter Dashboard]
        W2[Real-time Collaborative Editor]
        W3[Interactive Knowledge Search]
        W4[Timeline Aggregator]
    end

    subgraph Layer 4: Integration & Infrastructure [The Foundation]
        I1[DMS & Billing APIs]
        I2[Supabase DB / Auth]
        I3[Cloudflare R2 Storage]
        I4[Indian Kanoon Case Law API]
    end

    Layer 1 --> Layer 2
    Layer 2 --> Layer 3
    Layer 3 --> Layer 4
```

### 💻 2.1 Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19, Next.js, TypeScript, Tailwind CSS | Sleek, glassmorphic UI with responsive design |
| **Backend** | Node.js (Express), TypeScript | Fast API server and asynchronous document workers |
| **Database & Auth** | Supabase (PostgreSQL) | Secure relational database and identity provider |
| **Object Storage** | Cloudflare R2 / AWS S3 | Encrypted storage for client documents and briefs |
| **LLM Orchestration** | Gemini API, Anthropic, OpenAI | Multi-model agent coordination |
| **Indian Kanoon API** | Case Law Registry | Automated citation scanning and legal precedent checks |

---

## 📂 3. Repository Structure

```bash
├── frontend/               # Next.js client application & dashboard
├── backend/                # Express API & document processing workers
│   ├── schema.sql          # SQL schema for fresh database installation
│   └── oss-migrations/     # Incremental updates and feature patches
└── README.md               # Product documentation & instructions
```

---

## 🛠️ 4. Prerequisites

To host or run **lexOS** locally, ensure you have the following installed:

* **Runtime:** Node.js v20.x or newer & `npm`
* **Database:** A Supabase project instance (for live mode)
* **Object Storage:** A Cloudflare R2 bucket or S3-compatible API (for live document uploads)
* **LLM API Key:** At least one provider API key (Gemini, Anthropic, or OpenAI)
* **Legal Research:** An Indian Kanoon API token to enable Indian case law lookup and citation verification
* **Local Conversions:** LibreOffice installed locally if you require `.doc` / `.docx` file conversion to `.pdf`

---

## ⚙️ 5. Setup & Configuration

### 5.1 Environment Setup
Create local configuration files in both the `backend` and `frontend` directories:
```bash
touch backend/.env
touch frontend/.env.local
```

#### 📝 `backend/.env` Configuration (Live Production Mode):
```ini
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=your-random-32-byte-hex-string
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

#### 📝 `frontend/.env.local` Configuration:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# Toggle Demo Mode (true = client-side localStorage simulation, false = live backend api)
NEXT_PUBLIC_DEMO_MODE=true
```

> [!IMPORTANT]
> If `NEXT_PUBLIC_DEMO_MODE` is set to `true`, the frontend will bypass all API endpoints and authenticate using mock users, storing data dynamically inside the browser's `localStorage` under `lexos_*` keys.

### 5.2 Database Setup
To initialize a fresh Supabase database instance:
1. Open your **Supabase dashboard**.
2. Navigate to the **SQL Editor**.
3. Copy and run the entire contents of [backend/schema.sql](file:///Users/mihirsachdev/Downloads/mike-main/backend/schema.sql).

For updating existing deployments, run the incremental migration files sequentially from [backend/oss-migrations/](file:///Users/mihirsachdev/Downloads/mike-main/backend/oss-migrations).

---

## 🧠 6. Persistent Memory Layer (Litigation Mocks)

**lexOS** implements the PRD's Layer 1 memory architecture inside every project (matter) workspace:

1. **🧠 Matter Memory** — The assistant saves key decisions, facts, and preferences via its `save_memory` tool; entries persist across chat sessions, are injected into every project chat's context, and are curated in the project's **Memory** tab.
2. **📅 Matter Deadlines** — Date-bound obligations are captured via the `save_deadline` tool (or manually in the **Deadlines** tab), tracked with overdue flags, and surfaced to the assistant in every chat.
3. **💼 Client Memory** — Link a matter to a client from **Project Details**; the client's preference notes plus preference memories saved across *all* of that client's matters are applied in every linked chat.
4. **📄 Precedent Library** — Mark any document as a firm precedent (row menu → *Mark as precedent*); precedents from other matters become readable, citable drafting templates in every project chat.
5. **⚖️ Conflict Checking** — Matters record their parties (client, counterparty, opposing counsel, witness) via the **Parties** tab or the `save_party` tool; the `check_conflicts` tool and the *Run conflict check* button match a name against parties and clients across all your matters, flagging potential conflicts for lawyer review.
6. **⏳ Matter Timeline** — The **Timeline** tab shows a chronological, filterable feed of everything in a matter (documents, versions, chats, memories, deadlines, parties), aggregated on the fly with no extra storage.
7. **✅ Checklists & Templates** — Track work in the **Checklist** tab; seed it from built-in matter templates (M&A diligence, NDA review, litigation, lease analysis), add items manually, or let the assistant capture them via `save_task`.
8. **📊 Matter Overview** — The default **Overview** tab summarises the client, parties, upcoming deadlines, open tasks, key decisions, and recent activity at a glance, with a *Draft status report* action that composes a client-ready update.
9. **👥 Cloning & Archival** — Clone a matter's memory/parties/tasks into a new matter, and archive closed matters out of the default lists while keeping them accessible.
10. **🔍 Firm Knowledge Search** — The `search_firm_knowledge` tool lets the assistant answer "how do we usually handle X" by searching memories, deadlines, tasks, parties, clients, and document names across all your matters, citing the matter each result came from.

---

## 🇮🇳 7. Indian Kanoon Integration

**lexOS** features dedicated tools to research Indian case law, retrieve judgements, and verify citations natively using the Indian Kanoon API:
1. **🔍 Case Search:** Run semantic query searches against Indian judgements, tribunals, and laws.
2. **📄 Document Retrieval:** Fetch full judgement texts and opinions.
3. **🔗 Citation Matching:** Verify citing precedents dynamically in the chat workspace.

Configure the provider key in `backend/.env` (using `INDIANKANOON_API_TOKEN`) or allow users to save their own token under **Account > Models & API Keys** to enable these features.

---

## 🚀 8. Installation & Running

### 8.1 Install Dependencies
Run installation scripts for both modules:
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 8.2 Run Development Servers
Start backend service:
```bash
npm run dev --prefix backend
```

Start frontend client:
```bash
npm run dev --prefix frontend
```

Open your browser at [http://localhost:3000](http://localhost:3000) to access the lexOS dashboard.

### 8.3 Build for Production
```bash
# Build backend TypeScript
npm run build --prefix backend

# Build frontend using Webpack
npm run build --prefix frontend
```
