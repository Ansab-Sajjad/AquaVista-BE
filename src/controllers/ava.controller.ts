import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { Chat } from "../models/Chat.model";
import { DataFile } from "../models/DataFile.model";
import { StartupQuestion } from "../models/StartupQuestion.model";
import { PinnedItem } from "../models/PinnedItem.model";
import { AppError } from "../middleware/errorHandler";
import logger from "../config/logger";
import { callAva, buildDataContext } from "../services/ava.service";
import { getProjectUsageToday, incrementUsage } from "../services/usage.service";

// GET /api/projects/:projectId/ava/chats
export async function listChats(req: AuthRequest, res: Response) {
  const filter =
    req.user!.role === "admin" && req.query.userId
      ? { project: req.params.projectId, user: req.query.userId }
      : { project: req.params.projectId, user: req.user!.id };

  const chats = await Chat.find(filter)
    .select("title createdAt updatedAt totalInputTokens totalOutputTokens")
    .sort({ updatedAt: -1 });

  res.json(chats);
}

// POST /api/projects/:projectId/ava/chats
export async function createChat(req: AuthRequest, res: Response) {
  const chat = await Chat.create({
    project: req.params.projectId,
    user: req.user!.id,
    title: req.body.title || "New conversation",
    messages: [],
  });

  res.status(201).json(chat);
}

// GET /api/projects/:projectId/ava/chats/:chatId
export async function getChat(req: AuthRequest, res: Response) {
  const filter =
    req.user!.role === "admin"
      ? { _id: req.params.chatId, project: req.params.projectId }
      : { _id: req.params.chatId, project: req.params.projectId, user: req.user!.id };

  const chat = await Chat.findOne(filter);
  if (!chat) throw new AppError("Chat not found", 404);

  res.json(chat);
}

// POST /api/projects/:projectId/ava/chats/:chatId/messages
export async function sendMessage(req: AuthRequest, res: Response) {
  const { projectId, chatId } = req.params;
  const { content, provider } = req.body;

  if (!content?.trim()) throw new AppError("Message content is required", 400);

  // Enforce usage limit
  const usage = await getProjectUsageToday(projectId);
  if (usage.limitReached) {
    return res.status(429).json({
      message:
        "This project has reached its Ask AVA usage limit for today. Please contact your Admin or try again later.",
      usage,
    });
  }

  const filter =
    req.user!.role === "admin"
      ? { _id: chatId, project: projectId }
      : { _id: chatId, project: projectId, user: req.user!.id };

  const chat = await Chat.findOne(filter);
  if (!chat) throw new AppError("Chat not found", 404);

  // Store original message count for auto-title logic
  const originalMessageCount = chat.messages.length;

  // Build data context from uploaded files (including extracted text content)
  const files = await DataFile.find({
    project: projectId,
    status: { $in: ["Completed", "completed"] },
  }).select("originalName fileType year extractedText");
  const dataContext = buildDataContext(
    files.map((f) => ({
      name: f.originalName,
      fileType: f.fileType,
      year: f.year,
      extractedText: f.extractedText || "",
    }))
  );

  // Build message history for Gemini
  const history = chat.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  history.push({ role: "user", content });

  // Call AVA
  let avaContent = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let avaCallSuccessful = false;

  try {
    const result = await callAva(history, dataContext, provider as "gemini" | "groq" | "ollama");
    avaContent = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    avaCallSuccessful = true;
  } catch (err) {
    logger.error("AVA call failed", {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      projectId,
      chatId,
      userId: req.user?.id,
    });
    // Set a fallback error message instead of throwing
    avaContent = "I apologize, but I'm currently unable to process your request. Please try again later.";
  }

  // Persist messages - always save both user and assistant messages
  chat.messages.push({ role: "user", content, createdAt: new Date() });
  chat.messages.push({
    role: "assistant",
    content: avaContent,
    type: "narrative",
    title: "AVA response",
    inputTokens,
    outputTokens,
    createdAt: new Date(),
  });
  chat.totalInputTokens += inputTokens;
  chat.totalOutputTokens += outputTokens;

  // Auto-title on first exchange (when chat was empty before this message)
  if (originalMessageCount === 0) {
    chat.title = content.slice(0, 60) + (content.length > 60 ? "…" : "");
  }

  await chat.save();
  
  // Only increment usage if AVA call was successful
  if (avaCallSuccessful) {
    await incrementUsage(projectId, req.user!.id, inputTokens, outputTokens);
  }

  const lastTwo = chat.messages.slice(-2);
  res.json({ messages: lastTwo, usage: await getProjectUsageToday(projectId) });
}

// GET /api/projects/:projectId/ava/usage
export async function getUsage(req: AuthRequest, res: Response) {
  const usage = await getProjectUsageToday(req.params.projectId);
  res.json(usage);
}

// GET /api/projects/:projectId/ava/startup-questions
export async function listStartupQuestions(req: AuthRequest, res: Response) {
  const questions = await StartupQuestion.find({ project: req.params.projectId }).sort(
    "order"
  );
  res.json(questions);
}

// PUT /api/projects/:projectId/ava/startup-questions (admin only — full replace)
export async function saveStartupQuestions(req: AuthRequest, res: Response) {
  const { questions } = req.body as { questions: { text: string; order: number }[] };
  if (!Array.isArray(questions)) throw new AppError("questions must be an array", 400);

  // Full replace
  await StartupQuestion.deleteMany({ project: req.params.projectId });

  const docs = questions.map((q, i) => ({
    project: req.params.projectId,
    text: q.text,
    order: q.order ?? i,
    createdBy: req.user!.id,
  }));

  const saved = await StartupQuestion.insertMany(docs);
  res.json(saved);
}

// GET /api/projects/:projectId/ava/user-chats (admin only)
export async function listUserChats(req: AuthRequest, res: Response) {
  const chats = await Chat.find({ project: req.params.projectId })
    .populate("user", "name email")
    .select("title user createdAt updatedAt")
    .sort({ updatedAt: -1 });

  res.json(chats);
}

// POST /api/projects/:projectId/ava/chats/:chatId/messages/:messageId/pin
export async function pinMessage(req: AuthRequest, res: Response) {
  const { projectId, chatId, messageId } = req.params;
  const { content, type, title } = req.body;

  const filter =
    req.user!.role === "admin"
      ? { _id: chatId, project: projectId }
      : { _id: chatId, project: projectId, user: req.user!.id };

  const chat = await Chat.findOne(filter);
  if (!chat) throw new AppError("Chat not found", 404);

  // Find the message in the chat
  const message = (chat.messages as any).id?.(messageId) || chat.messages.find((m: any) => m._id?.toString() === messageId);
  if (!message) throw new AppError("Message not found", 404);

  // Check if already pinned
  const existingPin = await PinnedItem.findOne({
    project: projectId,
    sourceChat: chatId,
  });

  if (existingPin) {
    // Update existing pinned item
    existingPin.content = content || message.content;
    existingPin.type = type || message.type || "narrative";
    existingPin.title = title || message.title || "AVA response";
    existingPin.sourceQuestion = chat.title;
    await existingPin.save();
    res.json({ id: existingPin._id });
  } else {
    // Create new pinned item
    const pinned = await PinnedItem.create({
      project: projectId,
      pinnedBy: req.user!.id,
      sourceChat: chatId,
      title: title || message.title || "AVA response",
      type: type || message.type || "narrative",
      sourceQuestion: chat.title,
      content: content || message.content,
      tableData: message.tableData,
      chartData: message.chartData,
    });
    res.status(201).json({ id: pinned._id });
  }
}

// DELETE /api/projects/:projectId/ava/chats/:chatId/messages/:messageId/unpin
export async function unpinMessage(req: AuthRequest, res: Response) {
  const { projectId, chatId } = req.params;

  const filter =
    req.user!.role === "admin"
      ? { _id: chatId, project: projectId }
      : { _id: chatId, project: projectId, user: req.user!.id };

  const chat = await Chat.findOne(filter);
  if (!chat) throw new AppError("Chat not found", 404);

  await PinnedItem.deleteOne({
    project: projectId,
    sourceChat: chatId,
  });

  res.json({ message: "Message unpinned" });
}

// GET /api/projects/:projectId/ava/chats/:chatId/pinned-messages
export async function getPinnedMessages(req: AuthRequest, res: Response) {
  const { projectId, chatId } = req.params;

  const filter =
    req.user!.role === "admin"
      ? { _id: chatId, project: projectId }
      : { _id: chatId, project: projectId, user: req.user!.id };

  const chat = await Chat.findOne(filter);
  if (!chat) throw new AppError("Chat not found", 404);

  const pinnedItem = await PinnedItem.findOne({
    project: projectId,
    sourceChat: chatId,
  });

  // Return the message IDs that are pinned (in this case, we're using the chat-level pin)
  // Since the current model pins at chat level, we return the chat ID if pinned
  const pinnedMessageIds = pinnedItem ? [chatId] : [];

  res.json({ pinnedMessageIds });
}
