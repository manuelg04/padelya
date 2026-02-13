import { PRESENCE_NOTIFICATION_COOLDOWN_MS } from "./constants";
import type { OpenWindow, PresenceNotificationType } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildPresenceNotificationDedupeKey(input: {
  type: PresenceNotificationType;
  matchId: string;
  actorUserId: string;
  createdAt: string;
}): string {
  const createdAtMs = new Date(input.createdAt).getTime();
  const bucket = Math.floor(createdAtMs / PRESENCE_NOTIFICATION_COOLDOWN_MS);
  return `presence:${input.type}:${input.matchId}:${input.actorUserId}:${bucket}`;
}

export function normalizeAlias(alias: string): string {
  return alias.trim().replace(/\s+/g, " ");
}

export function isValidAlias(alias: string): boolean {
  const normalized = normalizeAlias(alias);
  if (normalized.length < 3 || normalized.length > 24) {
    return false;
  }
  return /^[A-Za-z0-9 ]+$/.test(normalized);
}

export function bogotaLocalToUtcIso(localDateTime: string): string {
  return new Date(`${localDateTime}:00-05:00`).toISOString();
}

export function isWholeHourBogotaLocalDateTime(localDateTime: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(localDateTime)) {
    return false;
  }

  const parsed = new Date(`${localDateTime}:00-05:00`);
  return Number.isFinite(parsed.getTime());
}

export function isFutureBogotaLocalDateTime(localDateTime: string, now: Date): boolean {
  if (!isWholeHourBogotaLocalDateTime(localDateTime)) {
    return false;
  }

  const startsAtUtc = bogotaLocalToUtcIso(localDateTime);
  return startsAtUtc > now.toISOString();
}

function getBogotaDateParts(now: Date): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
  };
}

export function getOpenFeedUtcRange(window: OpenWindow, now: Date): {
  fromInclusiveUtc: string;
  toInclusiveUtc: string;
} {
  const fromInclusiveUtc = now.toISOString();

  if (window === "next7") {
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    return {
      fromInclusiveUtc,
      toInclusiveUtc: new Date(now.getTime() + sevenDaysInMs).toISOString(),
    };
  }

  const { year, month, day } = getBogotaDateParts(now);
  const toInclusiveUtc = new Date(`${year}-${month}-${day}T23:59:59.999-05:00`).toISOString();

  return {
    fromInclusiveUtc,
    toInclusiveUtc,
  };
}
