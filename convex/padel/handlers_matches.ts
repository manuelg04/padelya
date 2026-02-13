import { DEFAULT_TIMEZONE, MAX_PLAYERS } from "./constants";
import {
  bogotaLocalToUtcIso,
  buildPresenceNotificationDedupeKey,
  getOpenFeedUtcRange,
  isFutureBogotaLocalDateTime,
  nowIso,
} from "./date_time";
import { logEvent } from "./events";
import { buildMatchView } from "./match_view";
import {
  getMatchByPublicId,
  listActiveWatcherUserIds,
  listParticipantsForMatch,
  removeAllWatchersForMatch,
  removeMatchWatcher,
  upsertMatchWatcher,
} from "./matches_repo";
import { notifyManyUsers } from "./notifications_service";
import { ensureUser, findUserByFirebaseUid } from "./users_repo";
import type { QueryCtx } from "../_generated/server";
import type {
  CreateMatchArgs,
  GetMatchArgs,
  ListHomeArgs,
  ListMineArgs,
  ListOpenFeedArgs,
  MatchDoc,
  MatchId,
  MatchView,
  PublicIdActorArgs,
  ReadCtx,
  WriteCtx,
} from "./types";

async function requireMatchByPublicId(ctx: ReadCtx, publicId: string): Promise<MatchDoc> {
  const match = await getMatchByPublicId(ctx, publicId);
  if (!match) {
    throw new Error("NOT_FOUND");
  }

  return match;
}

async function generatePublicId(ctx: WriteCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = Math.random().toString(36).slice(2, 12);
    const existing = await getMatchByPublicId(ctx, candidate);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("PUBLIC_ID_CONFLICT");
}

export async function createMatchHandler(ctx: WriteCtx, args: CreateMatchArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  if (!user.alias) {
    throw new Error("ALIAS_REQUIRED");
  }

  if (!isFutureBogotaLocalDateTime(args.input.startsAtLocal, new Date())) {
    throw new Error("VALIDATION_ERROR");
  }

  const now = nowIso();
  const publicId = await generatePublicId(ctx);
  const startsAtUtc = bogotaLocalToUtcIso(args.input.startsAtLocal);

  const matchId = await ctx.db.insert("matches", {
    publicId,
    organizerUserId: user._id,
    club: args.input.club.trim(),
    startsAtUtc,
    timezone: args.timezone ?? DEFAULT_TIMEZONE,
    category: args.input.category.trim(),
    modality: args.input.modality,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("matchParticipants", {
    matchId,
    userId: user._id,
    joinedAt: now,
  });

  await logEvent(ctx, {
    type: "match_created",
    actorUserId: user._id,
    matchId,
  });

  const match = await ctx.db.get(matchId);
  if (!match) {
    throw new Error("NOT_FOUND");
  }

  return buildMatchView(ctx, match, user._id);
}

export async function listHomeHandler(ctx: QueryCtx, args: ListHomeArgs): Promise<MatchView[]> {
  const actorUser = args.actor ? await findUserByFirebaseUid(ctx, args.actor.firebaseUid) : null;
  const actorUserId = actorUser?._id ?? null;

  const matches = await ctx.db.query("matches").withIndex("by_starts_at_utc").collect();
  matches.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  return Promise.all(matches.map((match) => buildMatchView(ctx, match, actorUserId)));
}

export async function listMineHandler(ctx: QueryCtx, args: ListMineArgs): Promise<MatchView[]> {
  const actorUser = await findUserByFirebaseUid(ctx, args.actor.firebaseUid);
  if (!actorUser) {
    return [];
  }

  const participantRows = await ctx.db
    .query("matchParticipants")
    .withIndex("by_user", (q) => q.eq("userId", actorUser._id))
    .collect();

  const organizerRows = await ctx.db
    .query("matches")
    .withIndex("by_organizer", (q) => q.eq("organizerUserId", actorUser._id))
    .collect();

  const matchIds = new Set<MatchId>();
  for (const row of participantRows) {
    matchIds.add(row.matchId);
  }
  for (const row of organizerRows) {
    matchIds.add(row._id);
  }

  const fetchedMatches = await Promise.all([...matchIds].map((matchId) => ctx.db.get(matchId)));
  const matches = fetchedMatches.filter((match): match is MatchDoc => Boolean(match));

  matches.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  return Promise.all(matches.map((match) => buildMatchView(ctx, match, actorUser._id)));
}

export async function listOpenFeedHandler(ctx: QueryCtx, args: ListOpenFeedArgs): Promise<MatchView[]> {
  const now = args.nowIso ? new Date(args.nowIso) : new Date();
  const { fromInclusiveUtc, toInclusiveUtc } = getOpenFeedUtcRange(args.window, now);

  const matches = await ctx.db.query("matches").withIndex("by_starts_at_utc").collect();
  const filteredMatches = matches.filter((match) => {
    if (match.canceledAt) {
      return false;
    }

    if (args.modality && match.modality !== args.modality) {
      return false;
    }

    return match.startsAtUtc >= fromInclusiveUtc && match.startsAtUtc <= toInclusiveUtc;
  });

  const openMatches: MatchDoc[] = [];
  for (const match of filteredMatches) {
    const participants = await listParticipantsForMatch(ctx, match._id);
    if (participants.length < MAX_PLAYERS) {
      openMatches.push(match);
    }
  }

  openMatches.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  return Promise.all(openMatches.map((match) => buildMatchView(ctx, match, null)));
}

export async function getMatchHandler(ctx: QueryCtx, args: GetMatchArgs): Promise<MatchView> {
  const actorUser = args.actor ? await findUserByFirebaseUid(ctx, args.actor.firebaseUid) : null;
  const actorUserId = actorUser?._id ?? null;

  const match = await requireMatchByPublicId(ctx, args.publicId);
  return buildMatchView(ctx, match, actorUserId);
}

export async function followMatchWatchHandler(ctx: WriteCtx, args: PublicIdActorArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  const match = await requireMatchByPublicId(ctx, args.publicId);

  if (match.canceledAt) {
    throw new Error("MATCH_CANCELED");
  }
  if (match.organizerUserId === user._id) {
    throw new Error("VALIDATION_ERROR");
  }

  const participants = await listParticipantsForMatch(ctx, match._id);
  const participantUserIds = new Set(participants.map((participant) => participant.userId));
  if (participantUserIds.has(user._id)) {
    throw new Error("VALIDATION_ERROR");
  }

  if (participants.length !== MAX_PLAYERS) {
    throw new Error("VALIDATION_ERROR");
  }

  const now = nowIso();
  await upsertMatchWatcher(ctx, {
    matchId: match._id,
    userId: user._id,
    startsAtUtc: match.startsAtUtc,
    now,
  });

  return buildMatchView(ctx, match, user._id);
}

export async function unfollowMatchWatchHandler(ctx: WriteCtx, args: PublicIdActorArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  const match = await requireMatchByPublicId(ctx, args.publicId);

  await removeMatchWatcher(ctx, match._id, user._id);
  return buildMatchView(ctx, match, user._id);
}

export async function joinHandler(ctx: WriteCtx, args: PublicIdActorArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  if (!user.alias) {
    throw new Error("ALIAS_REQUIRED");
  }

  const match = await requireMatchByPublicId(ctx, args.publicId);
  if (match.canceledAt) {
    throw new Error("MATCH_CANCELED");
  }

  const existing = await ctx.db
    .query("matchParticipants")
    .withIndex("by_match_user", (q) => q.eq("matchId", match._id).eq("userId", user._id))
    .unique();

  if (existing) {
    throw new Error("ALREADY_JOINED");
  }

  const now = nowIso();
  const participantsBefore = await listParticipantsForMatch(ctx, match._id);

  if (participantsBefore.length >= MAX_PLAYERS) {
    throw new Error("MATCH_FULL");
  }

  await ctx.db.insert("matchParticipants", {
    matchId: match._id,
    userId: user._id,
    joinedAt: now,
  });

  await removeMatchWatcher(ctx, match._id, user._id);

  const currentParticipantUserIds = participantsBefore.map((participant) => participant.userId);
  await notifyManyUsers(ctx, {
    recipientUserIds: currentParticipantUserIds,
    type: "PARTICIPANTE_SE_UNIO",
    matchId: match._id,
    matchPublicId: match.publicId,
    title: "Se sumó un jugador",
    message: `${user.alias} se unió a ${match.club}.`,
    createdAt: now,
    dedupeKey: buildPresenceNotificationDedupeKey({
      type: "PARTICIPANTE_SE_UNIO",
      matchId: String(match._id),
      actorUserId: String(user._id),
      createdAt: now,
    }),
  });

  if (participantsBefore.length === MAX_PLAYERS - 1) {
    const participantsAfter = await listParticipantsForMatch(ctx, match._id);
    const participantUserIds = participantsAfter.map((participant) => participant.userId);

    await notifyManyUsers(ctx, {
      recipientUserIds: participantUserIds,
      type: "PARTIDO_LLENO",
      matchId: match._id,
      matchPublicId: match.publicId,
      title: "Partido lleno (4/4)",
      message: `${match.club} ya está completo.`,
      createdAt: now,
    });
  }

  await logEvent(ctx, {
    type: "match_joined",
    actorUserId: user._id,
    matchId: match._id,
  });

  return buildMatchView(ctx, match, user._id);
}

export async function leaveHandler(ctx: WriteCtx, args: PublicIdActorArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  const match = await requireMatchByPublicId(ctx, args.publicId);

  if (match.canceledAt) {
    throw new Error("MATCH_CANCELED");
  }
  if (match.organizerUserId === user._id) {
    throw new Error("ORGANIZER_MUST_CANCEL");
  }

  const now = nowIso();
  const participantsBefore = await listParticipantsForMatch(ctx, match._id);

  const participant = await ctx.db
    .query("matchParticipants")
    .withIndex("by_match_user", (q) => q.eq("matchId", match._id).eq("userId", user._id))
    .unique();

  if (!participant) {
    throw new Error("NOT_JOINED");
  }

  await ctx.db.delete(participant._id);
  await removeMatchWatcher(ctx, match._id, user._id);

  const participantsAfter = await listParticipantsForMatch(ctx, match._id);

  const remainingParticipantUserIds = participantsAfter.map((row) => row.userId);
  await notifyManyUsers(ctx, {
    recipientUserIds: remainingParticipantUserIds,
    type: "PARTICIPANTE_SE_SALIO",
    matchId: match._id,
    matchPublicId: match.publicId,
    title: "Se liberó un jugador",
    message: `${user.alias ?? "Un jugador"} salió de ${match.club}.`,
    createdAt: now,
    dedupeKey: buildPresenceNotificationDedupeKey({
      type: "PARTICIPANTE_SE_SALIO",
      matchId: String(match._id),
      actorUserId: String(user._id),
      createdAt: now,
    }),
  });

  if (participantsBefore.length === MAX_PLAYERS && participantsAfter.length === MAX_PLAYERS - 1) {
    const participantUserIds = new Set(participantsAfter.map((row) => row.userId));
    const watcherUserIds = await listActiveWatcherUserIds(ctx, {
      matchId: match._id,
      startsAtUtc: match.startsAtUtc,
      participantUserIds,
      now,
    });

    await notifyManyUsers(ctx, {
      recipientUserIds: watcherUserIds,
      type: "CUPO_LIBERADO",
      matchId: match._id,
      matchPublicId: match.publicId,
      title: "Cupo liberado",
      message: `Ahora hay cupo disponible en ${match.club}.`,
      createdAt: now,
      dedupeKey: `release:${String(match._id)}`,
    });
  }

  await logEvent(ctx, {
    type: "match_left",
    actorUserId: user._id,
    matchId: match._id,
  });

  return buildMatchView(ctx, match, user._id);
}

export async function cancelHandler(ctx: WriteCtx, args: PublicIdActorArgs): Promise<MatchView> {
  const user = await ensureUser(ctx, args.actor);
  const match = await requireMatchByPublicId(ctx, args.publicId);

  if (match.organizerUserId !== user._id) {
    throw new Error("UNAUTHORIZED");
  }

  const now = nowIso();
  const participantsBeforeCancel = await listParticipantsForMatch(ctx, match._id);

  if (!match.canceledAt) {
    await ctx.db.patch(match._id, {
      canceledAt: now,
      updatedAt: now,
    });

    const participantUserIds = participantsBeforeCancel.map((participant) => participant.userId);
    const participantUserIdSet = new Set(participantUserIds);
    const watcherUserIds = await listActiveWatcherUserIds(ctx, {
      matchId: match._id,
      startsAtUtc: match.startsAtUtc,
      participantUserIds: participantUserIdSet,
      now,
    });

    const recipientUserIds = new Set([...participantUserIds, ...watcherUserIds]);
    await notifyManyUsers(ctx, {
      recipientUserIds: [...recipientUserIds],
      type: "PARTIDO_CANCELADO",
      matchId: match._id,
      matchPublicId: match.publicId,
      title: "Partido cancelado",
      message: `El partido en ${match.club} fue cancelado.`,
      createdAt: now,
      dedupeKey: `cancel:${String(match._id)}`,
    });

    await removeAllWatchersForMatch(ctx, match._id);

    await logEvent(ctx, {
      type: "match_canceled",
      actorUserId: user._id,
      matchId: match._id,
    });
  }

  const patched = await ctx.db.get(match._id);
  if (!patched) {
    throw new Error("NOT_FOUND");
  }

  return buildMatchView(ctx, patched, user._id);
}
