import type { AdminCategoryDashboard, PublicTournamentCategoryDetail } from "@/src/domain/types";

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
