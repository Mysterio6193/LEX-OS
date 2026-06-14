import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { chatRouter } from "./routes/chat";
import { projectsRouter } from "./routes/projects";
import { projectChatRouter } from "./routes/projectChat";
import { projectMemoryRouter } from "./routes/projectMemory";
import { projectDeadlinesRouter } from "./routes/projectDeadlines";
import { projectHearingsRouter } from "./routes/projectHearings";
import { billingRouter, projectBillingRouter } from "./routes/billing";
import { projectPartiesRouter } from "./routes/projectParties";
import { projectTimelineRouter } from "./routes/projectTimeline";
import { vaultsRouter } from "./routes/vaults";
import { agentWorkflowsRouter } from "./routes/agentWorkflows";
import { projectTasksRouter } from "./routes/projectTasks";
import { matterTemplatesRouter } from "./routes/matterTemplates";
import { conflictsRouter } from "./routes/conflicts";
import { clientsRouter } from "./routes/clients";
import { documentsRouter } from "./routes/documents";
import { tabularRouter } from "./routes/tabular";
import { workflowsRouter } from "./routes/workflows";
import { userRouter } from "./routes/user";
import { downloadsRouter } from "./routes/downloads";
import { caseLawRouter } from "./routes/caseLaw";
import { safeErrorLog } from "./lib/safeError";

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minutes(value: number): number {
  return value * 60 * 1000;
}

function hours(value: number): number {
  return minutes(value * 60);
}

function makeLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: {
      detail:
        options.message ?? "Too many requests. Please try again later.",
    },
  });
}

const generalLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_GENERAL_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_GENERAL_MAX", 300),
});

const chatLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_CHAT_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_CHAT_MAX", 30),
  message: "Too many chat requests. Please try again later.",
});

const chatCreateLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_CHAT_CREATE_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_CHAT_CREATE_MAX", 60),
});

const uploadLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_UPLOAD_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_UPLOAD_MAX", 50),
  message: "Too many upload requests. Please try again later.",
});

const exportLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_EXPORT_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_EXPORT_MAX", 10),
  message: "Too many export requests. Please try again later.",
});

const dataDeleteLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_DATA_DELETE_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_DATA_DELETE_MAX", 20),
  message: "Too many data deletion requests. Please try again later.",
});

// Reindexing embeds every chunk of every document — bound it to protect
// embedding-provider spend and the database.
const reindexLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_REINDEX_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_REINDEX_MAX", 20),
  message: "Too many reindex requests. Please try again later.",
});

function jsonLimitForPath(path: string): string {
  return "50mb";
}

app.disable("x-powered-by");
app.set("trust proxy", envInt("TRUST_PROXY_HOPS", 1));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
        }
      : false,
    referrerPolicy: { policy: "no-referrer" },
  }),
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.use(generalLimiter);

app.post("/chat", chatLimiter);
app.post("/projects/:projectId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/generate", chatLimiter);
app.post("/chat/create", chatCreateLimiter);
app.post("/chat/:chatId/generate-title", chatCreateLimiter);
app.post("/single-documents", uploadLimiter);
app.post("/single-documents/:documentId/versions", uploadLimiter);
app.put(
  "/single-documents/:documentId/versions/:versionId/file",
  uploadLimiter,
);
app.post("/projects/:projectId/documents", uploadLimiter);
app.post("/projects/:projectId/reindex", reindexLimiter);
app.post("/projects/:projectId/vaults/:vaultId/reindex", reindexLimiter);
app.get("/user/export", exportLimiter);
app.get("/user/chats/export", exportLimiter);
app.get("/user/tabular-reviews/export", exportLimiter);
app.delete("/user/account", dataDeleteLimiter);
app.delete("/user/chats", dataDeleteLimiter);
app.delete("/user/projects", dataDeleteLimiter);
app.delete("/user/tabular-reviews", dataDeleteLimiter);

app.use((req, res, next) =>
  express.json({ limit: jsonLimitForPath(req.path) })(req, res, next),
);

app.use("/chat", chatRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:projectId/chat", projectChatRouter);
app.use("/projects/:projectId/memory", projectMemoryRouter);
app.use("/projects/:projectId/deadlines", projectDeadlinesRouter);
app.use("/projects/:projectId/hearings", projectHearingsRouter);
app.use("/projects/:projectId/billing", projectBillingRouter);
app.use("/billing", billingRouter);
app.use("/projects/:projectId/parties", projectPartiesRouter);
app.use("/projects/:projectId/timeline", projectTimelineRouter);
app.use("/projects/:projectId/vaults", vaultsRouter);
app.use("/agent-workflows", agentWorkflowsRouter);
app.use("/projects/:projectId/tasks", projectTasksRouter);
app.use("/matter-templates", matterTemplatesRouter);
app.use("/conflicts", conflictsRouter);
app.use("/clients", clientsRouter);
app.use("/single-documents", documentsRouter);
app.use("/tabular-review", tabularRouter);
app.use("/workflows", workflowsRouter);
app.use("/user", userRouter);
app.use("/users", userRouter);
app.use("/download", downloadsRouter);
app.use("/case-law", caseLawRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// 404 for unmatched API routes.
app.use((_req, res) => {
  res.status(404).json({ detail: "Not found" });
});

// Global error handler — async route throws and body-parser errors land here
// instead of crashing the process or hanging the request. Error text is
// scrubbed of secrets before logging; clients get a generic message.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : (err as { type?: string })?.type === "entity.too.large"
          ? 413
          : 500;
    console.error("[unhandled]", safeErrorLog(err));
    if (res.headersSent) return;
    res.status(status).json({
      detail:
        status === 413
          ? "Payload too large."
          : "Internal server error.",
    });
  },
);

const server =
  process.env.VERCEL !== "1"
    ? app.listen(PORT, () => {
        console.log(`lexOS backend running on port ${PORT}`);
      })
    : null;

// Crash-safety: log instead of dying on an unhandled async error, and shut
// down cleanly on a platform stop signal.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", safeErrorLog(reason));
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", safeErrorLog(err));
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[shutdown] received ${signal}`);
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
  });
}

export default app;
