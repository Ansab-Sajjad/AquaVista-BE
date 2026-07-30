import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { Chat } from "../models/Chat.model";
import { DataFile } from "../models/DataFile.model";
import { StartupQuestion } from "../models/StartupQuestion.model";
import { AppError } from "../middleware/errorHandler";
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
  const { content } = req.body;

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

  const chat = await Chat.findOne({
    _id: chatId,
    project: projectId,
    user: req.user!.id,
  });
  if (!chat) throw new AppError("Chat not found", 404);

  // Build data context from uploaded files
  const files = await DataFile.find({ project: projectId, status: "completed" }).select(
    "originalName fileType year"
  );
  const fileDescriptions = files.map(
    (f) => `${f.fileType}${f.year ? ` (${f.year})` : ""}: ${f.originalName}`
  );
  const dataContext = buildDataContext(fileDescriptions);

  // Build message history for Anthropic
  const history = chat.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  history.push({ role: "user", content });

  // Call AVA
  let avaContent = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await callAva(history, dataContext);
    avaContent = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    // Store the user message even if AVA fails
    chat.messages.push({ role: "user", content, createdAt: new Date() });
    await chat.save();
    throw new AppError("AVA is temporarily unavailable. Please try again.", 503);
  }

  // Persist messages
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

  // Auto-title on first exchange
  if (chat.messages.length === 2) {
    chat.title = content.slice(0, 60) + (content.length > 60 ? "…" : "");
  }

  await chat.save();
  await incrementUsage(projectId, req.user!.id, inputTokens, outputTokens);

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
