const BOGOTA_TIMEZONE = "America/Bogota";

function getBogotaDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function getBogotaDateLabel(startsAtUtc: string, referenceNowUtc?: string): string {
  const startsAt = new Date(startsAtUtc);
  const now = referenceNowUtc ? new Date(referenceNowUtc) : new Date();

  const startsAtDateKey = getBogotaDateKey(startsAt);
  const todayDateKey = getBogotaDateKey(now);
  const tomorrowDateKey = getBogotaDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (startsAtDateKey === todayDateKey) {
    return "Hoy";
  }
  if (startsAtDateKey === tomorrowDateKey) {
    return "Mañana";
  }

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(startsAt);
}

function getBogotaTimeLabel(startsAtUtc: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAtUtc));
}

export function formatJoinPushBody(input: {
  joinerAlias: string;
  club: string;
  startsAtUtc: string;
  referenceNowUtc?: string;
}): string {
  const alias = input.joinerAlias.trim() || "Un jugador";
  const dateLabel = getBogotaDateLabel(input.startsAtUtc, input.referenceNowUtc);
  const timeLabel = getBogotaTimeLabel(input.startsAtUtc);
  return `${alias} se unió a ${input.club} · ${dateLabel} ${timeLabel}`;
}

export function resolveJoinPushRecipientUserIds<UserIdType>(
  participantUserIds: UserIdType[],
  joinerUserId: UserIdType,
): UserIdType[] {
  const joinerKey = String(joinerUserId);
  const uniqueRecipients = new Map<string, UserIdType>();

  for (const recipientUserId of participantUserIds) {
    const recipientKey = String(recipientUserId);
    if (recipientKey === joinerKey) {
      continue;
    }
    uniqueRecipients.set(recipientKey, recipientUserId);
  }

  return [...uniqueRecipients.values()];
}
