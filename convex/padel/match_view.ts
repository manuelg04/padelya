import { MAX_PLAYERS } from "./constants";
import { nowIso } from "./date_time";
import { listParticipantsForMatch } from "./matches_repo";
import type { MatchDoc, MatchStatus, MatchView, MatchViewParticipant, ReadCtx, UserId } from "./types";

export function deriveStatus(participantCount: number, canceledAt: string | undefined): MatchStatus {
  if (canceledAt) {
    return "cancelada";
  }

  return participantCount >= MAX_PLAYERS ? "cerrada" : "abierta";
}

export async function buildMatchView(ctx: ReadCtx, match: MatchDoc, actorUserId: UserId | null): Promise<MatchView> {
  const participantDocs = await listParticipantsForMatch(ctx, match._id);
  participantDocs.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  const participants: MatchViewParticipant[] = await Promise.all(
    participantDocs.map(async (participant) => {
      const user = await ctx.db.get(participant.userId);
      if (!user) {
        throw new Error("NOT_FOUND");
      }

      return {
        userId: String(participant.userId),
        alias: user.alias ?? "Sin alias",
        joinedAt: participant.joinedAt,
        avatarUrl: user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null,
      };
    }),
  );

  const status = deriveStatus(participants.length, match.canceledAt);
  const isJoined = Boolean(actorUserId && participantDocs.some((participant) => participant.userId === actorUserId));

  let isWatchingReleaseSpot = false;
  if (actorUserId && !isJoined && !match.canceledAt) {
    const watcher = await ctx.db
      .query("matchWatchers")
      .withIndex("by_match_user", (q) => q.eq("matchId", match._id).eq("userId", actorUserId))
      .unique();

    if (watcher) {
      const now = nowIso();
      if (watcher.expiresAt > now && match.startsAtUtc > now) {
        isWatchingReleaseSpot = true;
      }
    }
  }

  return {
    publicId: match.publicId,
    organizerUserId: String(match.organizerUserId),
    club: match.club,
    startsAtUtc: match.startsAtUtc,
    timezone: match.timezone,
    category: match.category,
    modality: match.modality,
    status,
    participants,
    isOrganizer: Boolean(actorUserId && match.organizerUserId === actorUserId),
    canJoin: Boolean(actorUserId && !isJoined && status === "abierta"),
    canLeave: Boolean(actorUserId && isJoined && status !== "cancelada" && match.organizerUserId !== actorUserId),
    isCanceled: status === "cancelada",
    isWatchingReleaseSpot,
  };
}
