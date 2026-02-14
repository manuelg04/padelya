import { getBogotaDateKey } from "@/src/domain/match";
import { MAX_PLAYERS, type MatchStatus, type MatchView } from "@/src/domain/types";

export const RETURN_BANNER_MIN_AWAY_MS = 30_000;
export const RETURN_COOLDOWN_MS = 1_500;
export const NEW_BADGE_TTL_MS = 5_000;

export type ReturnReason = "visibility" | "focus" | "online";

export type MatchReentrySnapshot = {
  publicId: string;
  status: MatchStatus;
  participantCount: number;
  startsAtUtc: string;
  isOrganizer: boolean;
  isWatchingReleaseSpot: boolean;
  participantUserIds: string[];
};

export type MatchReentrySnapshotMap = Map<string, MatchReentrySnapshot>;

export type ReturnTriggerEvent = {
  reason: ReturnReason;
  awayMs: number;
  triggeredAtMs: number;
};

export type FeedReturnDiff = {
  newIds: string[];
  updatedIds: string[];
  missingIds: string[];
};

export function toMatchReentrySnapshot(match: MatchView): MatchReentrySnapshot {
  return {
    publicId: match.publicId,
    status: match.status,
    participantCount: match.participants.length,
    startsAtUtc: match.startsAtUtc,
    isOrganizer: match.isOrganizer,
    isWatchingReleaseSpot: match.isWatchingReleaseSpot,
    participantUserIds: match.participants.map((participant) => participant.userId).sort(),
  };
}

export function toMatchReentrySnapshotMap(matches: MatchView[]): MatchReentrySnapshotMap {
  const snapshots = new Map<string, MatchReentrySnapshot>();
  for (const match of matches) {
    snapshots.set(match.publicId, toMatchReentrySnapshot(match));
  }
  return snapshots;
}

export function hasStrictMatchUpdate(
  previousSnapshot: MatchReentrySnapshot,
  nextSnapshot: MatchReentrySnapshot,
): boolean {
  return (
    previousSnapshot.status !== nextSnapshot.status ||
    previousSnapshot.participantCount !== nextSnapshot.participantCount
  );
}

export function computeFeedReturnDiff(
  previousSnapshots: MatchReentrySnapshotMap,
  nextSnapshots: MatchReentrySnapshotMap,
): FeedReturnDiff {
  const newIds: string[] = [];
  const updatedIds: string[] = [];

  for (const [publicId, nextSnapshot] of nextSnapshots) {
    const previousSnapshot = previousSnapshots.get(publicId);
    if (!previousSnapshot) {
      newIds.push(publicId);
      continue;
    }

    if (hasStrictMatchUpdate(previousSnapshot, nextSnapshot)) {
      updatedIds.push(publicId);
    }
  }

  const missingIds: string[] = [];
  for (const publicId of previousSnapshots.keys()) {
    if (!nextSnapshots.has(publicId)) {
      missingIds.push(publicId);
    }
  }

  return { newIds, updatedIds, missingIds };
}

export function isRelevantMatch(
  snapshot: MatchReentrySnapshot,
  options?: { now?: Date; currentUserId?: string | null },
): boolean {
  const now = options?.now ?? new Date();
  const currentUserId = options?.currentUserId ?? null;

  const startsAtMs = new Date(snapshot.startsAtUtc).getTime();
  const nowMs = now.getTime();

  if (Number.isFinite(startsAtMs)) {
    const todayKey = getBogotaDateKey(now);
    const matchKey = getBogotaDateKey(new Date(startsAtMs));
    if (matchKey === todayKey) {
      return true;
    }

    const sixHoursInMs = 6 * 60 * 60 * 1000;
    if (startsAtMs >= nowMs && startsAtMs - nowMs < sixHoursInMs) {
      return true;
    }
  }

  if (snapshot.participantCount === MAX_PLAYERS - 1) {
    return true;
  }

  if (snapshot.isOrganizer || snapshot.isWatchingReleaseSpot) {
    return true;
  }

  if (currentUserId && snapshot.participantUserIds.includes(currentUserId)) {
    return true;
  }

  return false;
}

export function shouldShowFeedReturnBanner(input: {
  awayMs: number;
  newCount: number;
  relevantCount: number;
  totalCount: number;
}): boolean {
  if (input.totalCount <= 0) {
    return false;
  }

  return (
    input.awayMs > RETURN_BANNER_MIN_AWAY_MS ||
    input.newCount >= 2 ||
    input.relevantCount >= 1
  );
}

export function countStrictUpdatedMatches(
  previousSnapshots: MatchReentrySnapshotMap,
  nextSnapshots: MatchReentrySnapshotMap,
): number {
  let count = 0;
  for (const [publicId, nextSnapshot] of nextSnapshots) {
    const previousSnapshot = previousSnapshots.get(publicId);
    if (!previousSnapshot) {
      continue;
    }

    if (hasStrictMatchUpdate(previousSnapshot, nextSnapshot)) {
      count += 1;
    }
  }
  return count;
}

export function resolveDetailReturnNotice(
  previousSnapshot: MatchReentrySnapshot,
  nextSnapshot: MatchReentrySnapshot,
): string | null {
  if (!hasStrictMatchUpdate(previousSnapshot, nextSnapshot)) {
    return null;
  }

  if (nextSnapshot.status === "cancelada") {
    return "Partido cancelado";
  }

  if (nextSnapshot.status === "no_se_armo") {
    return "No se armó";
  }

  const wasFull =
    previousSnapshot.status === "cerrada" || previousSnapshot.participantCount >= MAX_PLAYERS;
  const isFull = nextSnapshot.status === "cerrada" || nextSnapshot.participantCount >= MAX_PLAYERS;

  if (wasFull && !isFull) {
    return "Se liberó 1 cupo";
  }

  if (!wasFull && isFull) {
    return `Completo (${MAX_PLAYERS}/${MAX_PLAYERS})`;
  }

  return null;
}

export function getNextUpcomingMatch(matches: MatchView[], now: Date = new Date()): MatchView | null {
  const nowIso = now.toISOString();
  const upcoming = matches
    .filter((match) => match.startsAtUtc >= nowIso)
    .filter((match) => match.status !== "cancelada" && match.status !== "no_se_armo")
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  return upcoming[0] ?? null;
}

export function isWithinHours(startsAtUtc: string, hours: number, now: Date = new Date()): boolean {
  const startsAtMs = new Date(startsAtUtc).getTime();
  if (!Number.isFinite(startsAtMs)) {
    return false;
  }

  const nowMs = now.getTime();
  if (startsAtMs < nowMs) {
    return false;
  }

  const hoursInMs = hours * 60 * 60 * 1000;
  return startsAtMs - nowMs < hoursInMs;
}
