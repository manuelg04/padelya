import { MAX_PLAYERS, PRESENCE_NOTIFICATION_COOLDOWN_MS } from "./constants";
import type { OpenWindow, PresenceNotificationType } from "./types";

export const NO_SHOW_GRACE_MS = 30 * 60 * 1000;

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
  return localDateTimeToUtcIso(localDateTime, "America/Bogota");
}

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const LOCAL_DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseLocalDateTime(localDateTime: string): LocalDateTimeParts {
  const match = LOCAL_DATE_TIME_REGEX.exec(localDateTime);
  if (!match) {
    throw new Error("VALIDATION_ERROR");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
  };
}

function partsToUtcMs(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function getPartsInTimezone(date: Date, timezone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const year = Number(byType.year);
  const month = Number(byType.month);
  const day = Number(byType.day);
  const hour = Number(byType.hour);
  const minute = Number(byType.minute);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("VALIDATION_ERROR");
  }

  return { year, month, day, hour, minute };
}

export function localDateTimeToUtcIso(localDateTime: string, timezone: string): string {
  try {
    const targetParts = parseLocalDateTime(localDateTime);
    const targetMs = partsToUtcMs(targetParts);
    let candidateMs = targetMs;

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const candidateParts = getPartsInTimezone(new Date(candidateMs), timezone);
      const deltaMs = targetMs - partsToUtcMs(candidateParts);
      if (deltaMs === 0) {
        return new Date(candidateMs).toISOString();
      }
      candidateMs += deltaMs;
    }
  } catch {
    throw new Error("VALIDATION_ERROR");
  }

  throw new Error("VALIDATION_ERROR");
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

export function isNoShowExpired(
  startsAtUtc: string,
  participantCount: number,
  canceledAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (canceledAt || participantCount >= MAX_PLAYERS) {
    return false;
  }

  const startsAtMs = new Date(startsAtUtc).getTime();
  if (!Number.isFinite(startsAtMs)) {
    return false;
  }

  return now.getTime() > startsAtMs + NO_SHOW_GRACE_MS;
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
