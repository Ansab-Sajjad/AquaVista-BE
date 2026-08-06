import { UsageLog } from "../models/UsageLog.model";
import { Project } from "../models/Project.model";

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getProjectUsageToday(
  projectId: string,
  userId?: string
): Promise<{
  used: number;
  limit: number;
  remaining: number;
  limitReached: boolean;
}> {
  const project = await Project.findById(projectId).select("dailyQuestionLimit");
  const limit = project?.dailyQuestionLimit ?? 100;

  const filter: Record<string, unknown> = {
    project: projectId,
    date: todayString(),
  };
  // When a userId is provided, scope the usage to that user only so each
  // member of the project gets their own daily limit.
  if (userId) filter.user = userId;

  const logs = await UsageLog.find(filter);

  const used = logs.reduce((sum, l) => sum + l.questionCount, 0);
  const remaining = Math.max(0, limit - used);

  return { used, limit, remaining, limitReached: used >= limit };
}

export async function incrementUsage(
  projectId: string,
  userId: string,
  inputTokens = 0,
  outputTokens = 0
): Promise<void> {
  await UsageLog.findOneAndUpdate(
    { project: projectId, user: userId, date: todayString() },
    {
      $inc: {
        questionCount: 1,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
      },
    },
    { upsert: true, new: true }
  );
}
