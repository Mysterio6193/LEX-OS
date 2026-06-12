import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import {
    buildProjectDocContext,
    buildMessages,
    buildWorkflowStore,
    enrichWithPriorEvents,
    AssistantStreamError,
    buildCancelledAssistantMessage,
    extractAnnotations,
    isAbortError,
    runLLMStream,
    stripTransientAssistantEvents,
    PROJECT_EXTRA_TOOLS,
    type ChatMessage,
} from "../lib/chatTools";
import {
    getUserModelSettings,
} from "../lib/userSettings";
import { checkProjectAccess } from "../lib/access";
import { buildMemoryPromptBlock } from "../lib/projectMemory";
import { buildDeadlinePromptBlock } from "../lib/projectDeadlines";
import { buildClientPromptBlock } from "../lib/clients";
import { safeErrorLog, safeErrorMessage } from "../lib/safeError";

const PROJECT_SYSTEM_PROMPT_EXTRA = `PROJECT CONTEXT:
You are operating within a project folder that contains a collection of legal documents the user has organised for a single matter. The user's questions will usually refer to one or more documents in this project — your job is to find the relevant files to work on. Use list_documents to see what is available and fetch_documents / read_document to pull in any documents you need before answering.

A document may currently be displayed in the user's side panel; when provided, treat it as context for the user's likely focus, but do NOT assume it is the only or definitive document the user is asking about. If the request could apply to other files in the project, identify and read those as well. Prefer coverage across the relevant project documents over an over-narrow reading of only the displayed one.

REPLICATING A DOCUMENT:
When the user wants to use an existing project document as a starting point for a new file (e.g. "use this NDA as a template", "make me a copy of the SOW so I can edit it", "duplicate this and adapt it for company X"), call the replicate_document tool with the source doc_id. This creates a byte-for-byte copy as a new project document, returns a fresh doc_id slug, and shows a download/open card in the UI. Then call edit_document on the returned slug to make the user's requested changes — do NOT call generate_docx for cases where the user clearly wants the existing document's structure and formatting preserved.

SAVING TO MATTER MEMORY:
This project has a persistent memory that every future chat in the project will see. When the user makes a clear decision (e.g. "we accept the 12-month liability cap"), states a durable fact about the matter (e.g. "the counterparty is governed by German law"), or expresses a lasting preference (e.g. "always draft indemnities aggressively for this client"), call save_memory to record it — once per distinct item, phrased as one or two self-contained sentences. Do not save transient context, speculation, document summaries, or anything already listed in MATTER MEMORY. Do not announce that you saved a memory; the UI shows it automatically.

PRECEDENT LIBRARY:
Documents listed with folder path "Precedent Library" are firm precedents from the user's other matters, not documents of this matter. Use them as reference material and drafting templates: read them for standard language, or call replicate_document to copy one into this project as a starting point (e.g. "draft an NDA based on our standard precedent"). Do not treat precedents as evidence about this matter's facts, and do not edit a precedent directly — always replicate first.

SAVING DEADLINES:
This project also has a deadline tracker that every future chat will see. When the user mentions a concrete date-bound obligation (e.g. "the filing is due 30 June", "closing is scheduled for 15 July", "respond by next Friday"), call save_deadline with the title and the resolved YYYY-MM-DD date. Resolve relative dates against TODAY'S DATE; if the date is genuinely ambiguous, ask the user instead of guessing. Do not save vague timeframes or deadlines already listed in MATTER DEADLINES. Do not announce that you saved a deadline; the UI shows it automatically.`;

export const projectChatRouter = Router({ mergeParams: true });

// POST /projects/:projectId/chat — streaming
projectChatRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { messages, chat_id, model, displayed_doc, attached_documents } =
        req.body as {
            messages: ChatMessage[];
            chat_id?: string;
            model?: string;
            displayed_doc?: { filename: string; document_id: string };
            attached_documents?: { filename: string; document_id: string }[];
        };

    const db = createServerSupabase();

    // Verify the user has access to the project (owner or shared member).
    const projectAccess = await checkProjectAccess(
        projectId,
        userId,
        userEmail,
        db,
    );
    if (!projectAccess.ok)
        return void res.status(404).json({ detail: "Project not found" });

    let chatId = chat_id ?? null;
    let chatTitle: string | null = null;

    if (chatId) {
        const { data: existing } = await db
            .from("chats")
            .select("id, title, project_id")
            .eq("id", chatId)
            .single();
        const canUse = !!existing && existing.project_id === projectId;
        if (!canUse) chatId = null;
        else chatTitle = existing!.title;
    }

    if (!chatId) {
        const { data: newChat, error } = await db
            .from("chats")
            .insert({ user_id: userId, project_id: projectId })
            .select("id, title")
            .single();
        if (error || !newChat)
            return void res
                .status(500)
                .json({ detail: "Failed to create chat" });
        chatId = newChat.id as string;
        chatTitle = newChat.title;
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
        await db.from("chat_messages").insert({
            chat_id: chatId,
            role: "user",
            content: lastUser.content,
            files: lastUser.files ?? null,
            workflow: lastUser.workflow ?? null,
        });
    }

    const { docIndex, docStore, folderPaths } = await buildProjectDocContext(
        projectId,
        userId,
        db,
    );
    const docAvailability = Object.entries(docIndex).map(([doc_id, info]) => ({
        doc_id,
        filename: info.filename,
        folder_path: folderPaths.get(doc_id),
    }));

    const enrichedMessages = await enrichWithPriorEvents(
        messages,
        chatId,
        db,
        docIndex,
    );
    const messagesForLLM: ChatMessage[] = displayed_doc
        ? enrichedMessages.map((m, i) => {
              if (i !== enrichedMessages.length - 1 || m.role !== "user")
                  return m;
              return {
                  ...m,
                  content: `${m.content}\n\ndisplayed_doc: ${displayed_doc.filename}, displayed_doc_id: ${displayed_doc.document_id}`,
              };
          })
        : enrichedMessages;

    // The user-attached docs for this turn (dragged into / picked from
    // the chat input) come in as a request-level field. Surface them in
    // the system prompt with the current-turn doc_id slugs so the model
    // knows which docs the user is highlighting *now*, distinct from
    // the broader project doc list.
    let systemPromptExtra = `${PROJECT_SYSTEM_PROMPT_EXTRA}\n\nTODAY'S DATE: ${new Date().toISOString().slice(0, 10)}`;
    const [clientBlock, memoryBlock, deadlineBlock] = await Promise.all([
        buildClientPromptBlock(projectId, db),
        buildMemoryPromptBlock(projectId, db),
        buildDeadlinePromptBlock(projectId, db),
    ]);
    if (clientBlock) systemPromptExtra += `\n\n${clientBlock}`;
    if (memoryBlock) systemPromptExtra += `\n\n${memoryBlock}`;
    if (deadlineBlock) systemPromptExtra += `\n\n${deadlineBlock}`;
    if (attached_documents?.length) {
        const slugByDocumentId = new Map<string, string>();
        for (const [slug, info] of Object.entries(docIndex)) {
            if (info.document_id)
                slugByDocumentId.set(info.document_id, slug);
        }
        const lines = attached_documents.map((d) => {
            const slug = slugByDocumentId.get(d.document_id);
            return slug ? `- ${slug}: ${d.filename}` : `- ${d.filename}`;
        });
        systemPromptExtra += `\n\nUSER-ATTACHED DOCUMENTS FOR THIS TURN:\nThe user has attached the following document(s) directly to their latest message. Treat these as the primary focus of the request unless their message clearly says otherwise.\n${lines.join("\n")}`;
    }

    const {
        api_keys: apiKeys,
        legal_research_in: legalResearchIn,
    } = await getUserModelSettings(userId, db);
    const apiMessages = buildMessages(
        messagesForLLM,
        docAvailability,
        systemPromptExtra,
        undefined,
        legalResearchIn,
    );

    const workflowStore = await buildWorkflowStore(userId, userEmail, db);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const write = (line: string) => res.write(line);
    const streamAbort = new AbortController();
    let streamFinished = false;
    res.on("close", () => {
        if (!streamFinished) streamAbort.abort();
    });

    try {
        write(`data: ${JSON.stringify({ type: "chat_id", chatId })}\n\n`);

        const { events, annotations } = await runLLMStream({
            apiMessages,
            docStore,
            docIndex,
            userId,
            db,
            write,
            extraTools: PROJECT_EXTRA_TOOLS,
            workflowStore,
            includeResearchTools: legalResearchIn,
            model,
            apiKeys,
            signal: streamAbort.signal,
            projectId,
            chatId,
        });

        const persistedEvents = stripTransientAssistantEvents(events);
        await db.from("chat_messages").insert({
            chat_id: chatId,
            role: "assistant",
            content: persistedEvents.length ? persistedEvents : null,
            annotations: annotations.length ? annotations : null,
        });

        if (!chatTitle && lastUser?.content) {
            await db
                .from("chats")
                .update({ title: lastUser.content.slice(0, 120) })
                .eq("id", chatId);
        }
    } catch (err) {
        if (isAbortError(err)) {
            console.log("[project-chat/stream] client aborted stream", {
                chatId,
            });
            if (err instanceof AssistantStreamError) {
                const partial = buildCancelledAssistantMessage({
                    fullText: err.fullText,
                    events: err.events,
                    buildAnnotations: (fullText, events) =>
                        extractAnnotations(fullText, docIndex, events),
                });
                const { error: saveError } = await db.from("chat_messages").insert({
                    chat_id: chatId,
                    role: "assistant",
                    content: partial.events.length ? partial.events : null,
                    annotations: partial.annotations.length
                        ? partial.annotations
                        : null,
                });
                if (saveError) {
                    console.error(
                        "[project-chat/stream] failed to save aborted stream",
                        saveError,
                    );
                }
            }
            return;
        }
        console.error("[project-chat/stream] error:", safeErrorLog(err));
        const message = safeErrorMessage(err, "Stream error");
        const errorEvents = err instanceof AssistantStreamError
            ? stripTransientAssistantEvents(err.events)
            : [{ type: "error" as const, message }];
        const errorFullText =
            err instanceof AssistantStreamError ? err.fullText : "";
        try {
            const annotations = extractAnnotations(
                errorFullText,
                docIndex,
                errorEvents,
            );
            const { error: saveError } = await db.from("chat_messages").insert({
                chat_id: chatId,
                role: "assistant",
                content: errorEvents.length ? errorEvents : null,
                annotations: annotations.length ? annotations : null,
            });
            if (saveError)
                console.error("[project-chat/stream] failed to save error", saveError);
        } catch (saveErr) {
            console.error("[project-chat/stream] failed to save error", saveErr);
        }
        try {
            write(
                `data: ${JSON.stringify({ type: "error", message })}\n\n`,
            );
            write("data: [DONE]\n\n");
        } catch {
            /* ignore */
        }
    } finally {
        streamFinished = true;
        res.end();
    }
});
