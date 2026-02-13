import { WATCHER_TTL_MS } from "./constants";
import type { MatchDoc, MatchId, MatchParticipantDoc, ReadCtx, UserId, WriteCtx } from "./types";

function getWatcherExpiresAt(startsAtUtc: string, now: string): string {
  const ttlCap = new Date(new Date(now).getTime() + WATCHER_TTL_MS).toISOString();
  return startsAtUtc < ttlCap ? startsAtUtc : ttlCap;
}

export async function getMatchByPublicId(ctx: ReadCtx, publicId: string): Promise<MatchDoc | null> {
  return ctx.db
    .query("matches")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique();
}

export async function listParticipantsForMatch(ctx: ReadCtx, matchId: MatchId): Promise<MatchParticipantDoc[]> {
  return ctx.db
    .query("matchParticipants")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
}

export async function upsertMatchWatcher(
  ctx: WriteCtx,
  input: {
    matchId: MatchId;
    userId: UserId;
    now: string;
    startsAtUtc: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("matchWatchers")
    .withIndex("by_match_user", (q) => q.eq("matchId", input.matchId).eq("userId", input.userId))
    .unique();

  const expiresAt = getWatcherExpiresAt(input.startsAtUtc, input.now);
  if (existing) {
    await ctx.db.patch(existing._id, {
      reason: "full_attempt",
      createdAt: input.now,
      expiresAt,
    });
    return;
  }

  await ctx.db.insert("matchWatchers", {
    matchId: input.matchId,
    userId: input.userId,
    reason: "full_attempt",
    createdAt: input.now,
    expiresAt,
  });
}

export async function removeMatchWatcher(ctx: WriteCtx, matchId: MatchId, userId: UserId): Promise<void> {
  const existing = await ctx.db
    .query("matchWatchers")
    .withIndex("by_match_user", (q) => q.eq("matchId", matchId).eq("userId", userId))
    .unique();

  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

export async function listActiveWatcherUserIds(
  ctx: WriteCtx,
  input: {
    matchId: MatchId;
    startsAtUtc: string;
    participantUserIds: Set<UserId>;
    now: string;
  },
): Promise<UserId[]> {
  const watchers = await ctx.db
    .query("matchWatchers")
    .withIndex("by_match", (q) => q.eq("matchId", input.matchId))
    .collect();

  const activeUserIds: UserId[] = [];
  for (const watcher of watchers) {
    if (watcher.expiresAt <= input.now || input.startsAtUtc <= input.now) {
      await ctx.db.delete(watcher._id);
      continue;
    }

    if (input.participantUserIds.has(watcher.userId)) {
      await ctx.db.delete(watcher._id);
      continue;
    }

    activeUserIds.push(watcher.userId);
  }

  return activeUserIds;
}

export async function removeAllWatchersForMatch(ctx: WriteCtx, matchId: MatchId): Promise<void> {
  const watchers = await ctx.db
    .query("matchWatchers")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();

  await Promise.all(watchers.map((watcher) => ctx.db.delete(watcher._id)));
}
