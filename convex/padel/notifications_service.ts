import type { NotifyManyUsersInput, NotifyUserInput, UserId, WriteCtx } from "./types";

export async function notifyUser(ctx: WriteCtx, input: NotifyUserInput): Promise<void> {
  if (input.dedupeKey) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_dedupe", (q) =>
        q.eq("recipientUserId", input.recipientUserId).eq("dedupeKey", input.dedupeKey),
      )
      .unique();

    if (existing) {
      return;
    }
  }

  await ctx.db.insert("notifications", {
    recipientUserId: input.recipientUserId,
    type: input.type,
    title: input.title,
    message: input.message,
    matchId: input.matchId,
    matchPublicId: input.matchPublicId,
    createdAt: input.createdAt,
    dedupeKey: input.dedupeKey,
  });
}

export async function notifyManyUsers(ctx: WriteCtx, input: NotifyManyUsersInput): Promise<void> {
  const recipientsById = new Map<string, UserId>();
  for (const recipientUserId of input.recipientUserIds) {
    recipientsById.set(String(recipientUserId), recipientUserId);
  }

  await Promise.all(
    [...recipientsById.values()].map((recipientUserId) =>
      notifyUser(ctx, {
        recipientUserId,
        type: input.type,
        matchId: input.matchId,
        matchPublicId: input.matchPublicId,
        title: input.title,
        message: input.message,
        createdAt: input.createdAt,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${String(recipientUserId)}` : undefined,
      }),
    ),
  );
}
