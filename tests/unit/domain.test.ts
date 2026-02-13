import { describe, expect, it } from "vitest";

import {
  bogotaLocalToUtcIso,
  buildWhatsAppSummary,
  deriveMatchStatus,
  formatFeedSchedule,
  getOpenFeedUtcRange,
  isFutureBogotaLocalDateTime,
  isWholeHourBogotaLocalDateTime,
  isValidAlias,
  normalizeAlias,
  utcIsoToBogotaParts,
} from "@/src/domain/match";
import type { MatchView } from "@/src/domain/types";
import { AVATAR_MAX_BYTES, getAvatarInitials, validateAvatarFile } from "@/src/lib/avatar";
import { normalizePublicId } from "@/src/lib/public-id";

describe("domain/match", () => {
  it("normalizes and validates aliases", () => {
    expect(normalizeAlias("  Juan   Perez ")).toBe("Juan Perez");
    expect(isValidAlias("Ju")).toBe(false);
    expect(isValidAlias("Juan Perez")).toBe(true);
    expect(isValidAlias("Alias_con_guion")).toBe(false);
  });

  it("derives status from participants and cancellation", () => {
    expect(deriveMatchStatus(0, null)).toBe("abierta");
    expect(deriveMatchStatus(4, null)).toBe("cerrada");
    expect(deriveMatchStatus(1, new Date().toISOString())).toBe("cancelada");
  });

  it("converts datetime-local in bogota to utc and back", () => {
    const utc = bogotaLocalToUtcIso("2026-02-12T20:30");
    expect(utc).toBe("2026-02-13T01:30:00.000Z");

    const local = utcIsoToBogotaParts(utc);
    expect(local.date).toBe("12/02/2026");
    expect(local.time).toBe("20:30");
  });

  it("validates whole-hour local slots", () => {
    expect(isWholeHourBogotaLocalDateTime("2026-02-12T20:00")).toBe(true);
    expect(isWholeHourBogotaLocalDateTime("2026-02-12T20:30")).toBe(false);
    expect(isWholeHourBogotaLocalDateTime("not-a-date")).toBe(false);
  });

  it("validates that selected local datetime is in the future", () => {
    const now = new Date("2026-02-12T15:00:00.000Z");
    expect(isFutureBogotaLocalDateTime("2026-02-12T10:00", now)).toBe(false);
    expect(isFutureBogotaLocalDateTime("2026-02-12T09:00", now)).toBe(false);
    expect(isFutureBogotaLocalDateTime("2026-02-12T11:30", now)).toBe(false);
    expect(isFutureBogotaLocalDateTime("2026-02-12T12:30", now)).toBe(false);
    expect(isFutureBogotaLocalDateTime("2026-02-12T12:00", now)).toBe(true);
  });

  it("computes open feed range for today in bogota with inclusive bounds", () => {
    const now = new Date("2026-02-12T15:30:00.000Z");
    const range = getOpenFeedUtcRange("today", now);

    expect(range.fromInclusiveUtc).toBe("2026-02-12T15:30:00.000Z");
    expect(range.toInclusiveUtc).toBe("2026-02-13T04:59:59.999Z");
  });

  it("computes open feed range for next seven days from now", () => {
    const now = new Date("2026-02-12T15:30:00.000Z");
    const range = getOpenFeedUtcRange("next7", now);

    expect(range.fromInclusiveUtc).toBe("2026-02-12T15:30:00.000Z");
    expect(range.toInclusiveUtc).toBe("2026-02-19T15:30:00.000Z");
  });

  it("builds whatsapp summary with emoji and key fields", () => {
    const match: MatchView = {
      publicId: "abc123",
      organizerUserId: "u1",
      club: "Padel House",
      startsAtUtc: "2026-02-13T01:30:00.000Z",
      timezone: "America/Bogota",
      category: "4ta",
      modality: "mixto",
      status: "abierta",
      participants: [
        { userId: "u1", alias: "Ana", joinedAt: "2026-01-01T00:00:00.000Z", avatarUrl: null },
      ],
      isOrganizer: true,
      canJoin: false,
      canLeave: true,
      isCanceled: false,
      isWatchingReleaseSpot: false,
    };

    const summary = buildWhatsAppSummary(match, "https://app.test/partido/abc123");
    expect(summary).toContain("🎾 Partido de Pádel");
    expect(summary).toContain("Club: Padel House");
    expect(summary).toContain("Confirmados (1/4)");
    expect(summary).toContain("1. Ana");
    expect(summary).toContain("Estado: abierta");
  });

  it("formats feed schedule with human labels and one-hour range", () => {
    const now = new Date("2026-02-12T15:00:00.000Z");

    expect(formatFeedSchedule("2026-02-12T20:00:00.000Z", now)).toBe("Hoy de 15:00 a 16:00");
    expect(formatFeedSchedule("2026-02-13T20:00:00.000Z", now)).toBe("Mañana de 15:00 a 16:00");
    expect(formatFeedSchedule("2026-02-14T20:00:00.000Z", now)).toBe("14/02/2026 de 15:00 a 16:00");
  });

  it("normalizes dirty public ids copied from share flows", () => {
    expect(normalizePublicId("b85ebd93df")).toBe("b85ebd93df");
    expect(normalizePublicId("b85ebd93df Súmate al partido")).toBe("b85ebd93df");
    expect(normalizePublicId("b85ebd93df%20S%C3%BAmate%20al%20partido")).toBe("b85ebd93df");
  });

  it("computes avatar initials for single and multiple words", () => {
    expect(getAvatarInitials("Nataly")).toBe("N");
    expect(getAvatarInitials("Daniel Gonzalez")).toBe("DG");
    expect(getAvatarInitials("Juan David Pérez")).toBe("JP");
    expect(getAvatarInitials("  maria   jose  ")).toBe("MJ");
  });

  it("validates avatar file type and size", () => {
    const valid = new File([new Uint8Array(1024)], "avatar.jpg", { type: "image/jpeg" });
    expect(validateAvatarFile(valid)).toBeNull();

    const invalidType = new File([new Uint8Array(1024)], "avatar.gif", { type: "image/gif" });
    expect(validateAvatarFile(invalidType)).toBe("Formato inválido. Usa JPG, PNG o WEBP.");

    const tooBig = new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], "avatar.png", { type: "image/png" });
    expect(validateAvatarFile(tooBig)).toBe("La foto debe pesar máximo 3MB.");
  });
});
