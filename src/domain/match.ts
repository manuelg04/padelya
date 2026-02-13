import { MAX_PLAYERS, type MatchStatus, type MatchView, type OpenFeedWindow } from "@/src/domain/types";

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

export function deriveMatchStatus(participantCount: number, canceledAt: string | null): MatchStatus {
  if (canceledAt) {
    return "cancelada";
  }
  return participantCount >= MAX_PLAYERS ? "cerrada" : "abierta";
}

export function bogotaLocalToUtcIso(localDateTime: string): string {
  // Bogotá is fixed UTC-05:00 (no DST), so conversion remains deterministic.
  const local = `${localDateTime}:00-05:00`;
  const date = new Date(local);
  return date.toISOString();
}

export function isWholeHourBogotaLocalDateTime(localDateTime: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(localDateTime)) {
    return false;
  }
  const parsed = new Date(`${localDateTime}:00-05:00`);
  return Number.isFinite(parsed.getTime());
}

export function isFutureBogotaLocalDateTime(localDateTime: string, now: Date = new Date()): boolean {
  if (!isWholeHourBogotaLocalDateTime(localDateTime)) {
    return false;
  }
  const startsAtUtc = bogotaLocalToUtcIso(localDateTime);
  return startsAtUtc > now.toISOString();
}

export function utcIsoToBogotaParts(utcIso: string): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcIso));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${byType.day}/${byType.month}/${byType.year}`,
    time: `${byType.hour}:${byType.minute}`,
  };
}

export function getBogotaDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function formatFeedSchedule(startsAtUtc: string, now: Date = new Date()): string {
  const startsAtDate = new Date(startsAtUtc);
  const endsAtDate = new Date(startsAtDate.getTime() + 60 * 60 * 1000);
  const startParts = utcIsoToBogotaParts(startsAtUtc);
  const endParts = utcIsoToBogotaParts(endsAtDate.toISOString());

  const startDateKey = getBogotaDateKey(startsAtDate);
  const todayDateKey = getBogotaDateKey(now);
  const tomorrowDateKey = getBogotaDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  let dayLabel = startParts.date;
  if (startDateKey === todayDateKey) {
    dayLabel = "Hoy";
  } else if (startDateKey === tomorrowDateKey) {
    dayLabel = "Mañana";
  }

  return `${dayLabel} de ${startParts.time} a ${endParts.time}`;
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

export function getOpenFeedUtcRange(window: OpenFeedWindow, now: Date = new Date()): {
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

export type DayGroup = { dateKey: string; label: string; matches: MatchView[] };

export function groupMatchesByDay(matches: MatchView[], now: Date = new Date()): DayGroup[] {
  if (matches.length === 0) {
    return [];
  }

  const todayKey = getBogotaDateKey(now);
  const tomorrowKey = getBogotaDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;

  for (const match of matches) {
    const dateKey = getBogotaDateKey(new Date(match.startsAtUtc));

    if (!current || current.dateKey !== dateKey) {
      let label: string;
      if (dateKey === todayKey) {
        label = "Hoy";
      } else if (dateKey === tomorrowKey) {
        label = "Mañana";
      } else {
        const parts = utcIsoToBogotaParts(match.startsAtUtc);
        label = parts.date;
      }

      current = { dateKey, label, matches: [] };
      groups.push(current);
    }

    current.matches.push(match);
  }

  return groups;
}

const MODALITY_LABEL: Record<MatchView["modality"], string> = {
  mixto: "Mixto",
  masc: "Masc",
  fem: "Fem",
};

function formatBogotaTime12h(utcIso: string): string {
  const formatter = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const parts = formatter.formatToParts(new Date(utcIso));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = byType.hour ?? "0";
  const minute = byType.minute ?? "00";
  const dayPeriod = (byType.dayPeriod ?? "").replace(/[.\s]/g, "").toLowerCase();

  return dayPeriod ? `${hour}:${minute} ${dayPeriod}` : `${hour}:${minute}`;
}

export function buildWhatsAppSummary(match: MatchView, shareUrl: string, now: Date = new Date()): string {
  const startsAtDate = new Date(match.startsAtUtc);
  const { date } = utcIsoToBogotaParts(match.startsAtUtc);
  const time = formatBogotaTime12h(match.startsAtUtc);
  const startsAtDateKey = getBogotaDateKey(startsAtDate);
  const todayDateKey = getBogotaDateKey(now);
  const tomorrowDateKey = getBogotaDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  let dayLabel = date;
  if (startsAtDateKey === todayDateKey) {
    dayLabel = "Hoy";
  } else if (startsAtDateKey === tomorrowDateKey) {
    dayLabel = "Mañana";
  }

  const lines: string[] = [match.club, `${dayLabel} ${time} · ${MODALITY_LABEL[match.modality]}`];

  if (match.isCanceled) {
    lines.push("Cancelado");
    lines.push(`Ver detalles: ${shareUrl}`);
    return lines.join("\n");
  }

  const confirmedNames = match.participants.slice(0, MAX_PLAYERS).map((participant) => participant.alias);
  const confirmedCount = confirmedNames.length;
  const namesLabel = confirmedNames.length > 0 ? confirmedNames.join(", ") : "—";
  lines.push(`Confirmados (${confirmedCount}/${MAX_PLAYERS}): ${namesLabel}`);

  const remaining = MAX_PLAYERS - confirmedCount;
  if (remaining > 0) {
    lines.push(`Faltan ${remaining} ${remaining === 1 ? "cupo" : "cupos"}`);
    lines.push(`Únete aquí: ${shareUrl}`);
  } else {
    lines.push("Completo");
    lines.push(`Ver detalles: ${shareUrl}`);
  }

  return lines.join("\n");
}
