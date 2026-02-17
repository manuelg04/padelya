import type {
  AdminCategoryDashboard,
  PublicTournamentCategoryDetail,
  TournamentFreeRoundPairingInput,
} from "@/src/domain/types";

function formatBogotaDateTime(utcIso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcIso));
}

export function buildTournamentCategoryUrl(origin: string, tournamentSlug: string, categorySlug: string): string {
  return `${origin}/torneos/${encodeURIComponent(tournamentSlug)}/categorias/${encodeURIComponent(categorySlug)}`;
}

export function buildCategoryAnnouncementMessage(
  categoryDetail: PublicTournamentCategoryDetail,
  categoryUrl: string,
): string {
  return [
    `🎾 ${categoryDetail.tournament.name}`,
    `${categoryDetail.club.name} · ${formatBogotaDateTime(categoryDetail.tournament.startsAtUtc)}`,
    `Categoría: ${categoryDetail.category.name}`,
    categoryDetail.tournament.priceInfo ? `Precio: ${categoryDetail.tournament.priceInfo}` : null,
    `Inscripción: ${categoryUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCategoryConfirmedListMessage(dashboard: AdminCategoryDashboard): string {
  const confirmed = dashboard.registrations.confirmed;
  const names = confirmed.length
    ? confirmed.map((item, index) => `${index + 1}. ${item.teamName}${item.primaryAlias ? ` (${item.primaryAlias})` : ""}`).join("\n")
    : "Sin confirmados todavía.";

  return [
    `✅ Confirmados - ${dashboard.tournament.name}`,
    `Categoría: ${dashboard.category.name}`,
    `Confirmados ${dashboard.category.counts.confirmed}/${dashboard.category.capacity}`,
    names,
  ].join("\n");
}

export function buildCategoryPaymentMessage(dashboard: AdminCategoryDashboard): string {
  return [
    `💳 Pago - ${dashboard.tournament.name}`,
    `Categoría: ${dashboard.category.name}`,
    dashboard.club.paymentInstructions ?? "Instrucciones de pago pendientes.",
  ].join("\n");
}

export function buildCategoryReminderMessage(
  categoryDetail: PublicTournamentCategoryDetail,
  categoryUrl: string,
): string {
  return [
    `⏰ Recordatorio - ${categoryDetail.tournament.name}`,
    `${categoryDetail.club.name} · ${formatBogotaDateTime(categoryDetail.tournament.startsAtUtc)}`,
    `Categoría: ${categoryDetail.category.name}`,
    `Revisa estado / lista de espera: ${categoryUrl}`,
  ].join("\n");
}

export function buildRoundRobinPairsForGroupOfFour<T>(teams: readonly [T, T, T, T]): Array<readonly [T, T]> {
  return [
    [teams[0], teams[1]],
    [teams[2], teams[3]],
    [teams[0], teams[2]],
    [teams[1], teams[3]],
    [teams[0], teams[3]],
    [teams[1], teams[2]],
  ];
}

export interface TournamentFreePairing {
  teamAId: string;
  teamBId: string | null;
}

function validateUniqueTeamIds(teamIds: string[]): void {
  if (teamIds.length === 0) {
    throw new Error("VALIDATION_ERROR");
  }

  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) {
    throw new Error("VALIDATION_ERROR");
  }
}

export function buildRandomFreeRoundPairings(
  teamIds: string[],
  random: () => number = Math.random,
): TournamentFreePairing[] {
  validateUniqueTeamIds(teamIds);

  const shuffled = [...teamIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    const next = shuffled[index];
    shuffled[index] = shuffled[randomIndex] as string;
    shuffled[randomIndex] = next as string;
  }

  const pairings: TournamentFreePairing[] = [];
  for (let index = 0; index < shuffled.length; index += 2) {
    const teamAId = shuffled[index];
    if (!teamAId) {
      continue;
    }

    pairings.push({
      teamAId,
      teamBId: shuffled[index + 1] ?? null,
    });
  }

  return pairings;
}

export function buildManualFreeRoundPairings(
  teamIds: string[],
  manualPairings: TournamentFreeRoundPairingInput[],
): TournamentFreePairing[] {
  validateUniqueTeamIds(teamIds);

  if (manualPairings.length === 0 && teamIds.length > 1) {
    throw new Error("VALIDATION_ERROR");
  }

  const available = new Set(teamIds);
  const used = new Set<string>();
  const normalized: TournamentFreePairing[] = [];

  for (const pairing of manualPairings) {
    const teamAId = pairing.teamAId;
    const teamBId = pairing.teamBId ?? null;

    if (!available.has(teamAId) || used.has(teamAId)) {
      throw new Error("VALIDATION_ERROR");
    }
    if (teamBId !== null) {
      if (!available.has(teamBId) || used.has(teamBId)) {
        throw new Error("VALIDATION_ERROR");
      }
      if (teamAId === teamBId) {
        throw new Error("VALIDATION_ERROR");
      }
    }

    used.add(teamAId);
    if (teamBId !== null) {
      used.add(teamBId);
    }

    normalized.push({
      teamAId,
      teamBId,
    });
  }

  const remaining = teamIds.filter((teamId) => !used.has(teamId));
  if (remaining.length > 1) {
    throw new Error("VALIDATION_ERROR");
  }
  if (remaining.length === 1) {
    normalized.push({
      teamAId: remaining[0] as string,
      teamBId: null,
    });
  }

  return normalized;
}
