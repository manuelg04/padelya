import { describe, expect, it } from "vitest";

import {
  bogotaLocalToUtcIso,
  buildWhatsAppSummary,
  deriveMatchStatus,
  formatFeedSchedule,
  getOpenFeedUtcRange,
  groupMatchesByDay,
  isFutureBogotaLocalDateTime,
  isNoShowExpired,
  isWholeHourBogotaLocalDateTime,
  isValidAlias,
  localDateTimeToUtcIso,
  normalizeAlias,
  suggestRetryStartsAtLocal,
  utcIsoToBogotaParts,
} from "@/src/domain/match";
import type { MatchView } from "@/src/domain/types";
import { buildManualFreeRoundPairings, buildRandomFreeRoundPairings } from "@/src/domain/tournament";
import { AVATAR_MAX_BYTES, getAvatarInitials, validateAvatarFile } from "@/src/lib/avatar";
import { normalizePublicId } from "@/src/lib/public-id";

describe("domain/match", () => {
  const summaryNow = new Date("2026-02-12T15:00:00.000Z");
  const shareUrl = "https://app.test/partido/abc123";

  const buildParticipant = (
    userId: string,
    alias: string,
    joinedAt: string,
  ): MatchView["participants"][number] => ({
    userId,
    alias,
    joinedAt,
    avatarUrl: null,
  });

  const buildMatch = (overrides: Partial<MatchView> = {}): MatchView => ({
    publicId: "abc123",
    organizerUserId: "u1",
    club: "Padel CC",
    startsAtUtc: "2026-02-13T01:30:00.000Z",
    timezone: "America/Bogota",
    category: "4ta",
    modality: "mixto",
    status: "abierta",
    participants: [buildParticipant("u1", "Ana", "2026-01-01T00:00:00.000Z")],
    isOrganizer: true,
    canJoin: false,
    canLeave: false,
    isCanceled: false,
    isWatchingReleaseSpot: false,
    ...overrides,
  });

  it("normalizes and validates aliases", () => {
    expect(normalizeAlias("  Juan   Perez ")).toBe("Juan Perez");
    expect(isValidAlias("Ju")).toBe(false);
    expect(isValidAlias("Juan Perez")).toBe(true);
    expect(isValidAlias("Alias_con_guion")).toBe(false);
  });

  it("derives status from participants, cancellation and no-show expiration", () => {
    expect(deriveMatchStatus("2030-02-12T18:00:00.000Z", 0, null, new Date("2030-02-12T15:00:00.000Z"))).toBe(
      "abierta",
    );
    expect(deriveMatchStatus("2030-02-12T15:00:00.000Z", 4, null, new Date("2030-02-12T16:00:00.000Z"))).toBe(
      "cerrada",
    );
    expect(
      deriveMatchStatus(
        "2030-02-12T15:00:00.000Z",
        1,
        "2030-02-12T14:00:00.000Z",
        new Date("2030-02-12T16:00:00.000Z"),
      ),
    ).toBe("cancelada");
    expect(deriveMatchStatus("2030-02-12T15:00:00.000Z", 1, null, new Date("2030-02-12T15:30:00.000Z"))).toBe(
      "abierta",
    );
    expect(deriveMatchStatus("2030-02-12T15:00:00.000Z", 1, null, new Date("2030-02-12T15:30:00.001Z"))).toBe(
      "no_se_armo",
    );
  });

  it("calculates no-show expiration with strict 30-minute boundary", () => {
    expect(
      isNoShowExpired("2030-02-12T15:00:00.000Z", 3, null, new Date("2030-02-12T15:30:00.000Z")),
    ).toBe(false);
    expect(
      isNoShowExpired("2030-02-12T15:00:00.000Z", 3, null, new Date("2030-02-12T15:30:00.001Z")),
    ).toBe(true);
  });

  it("converts datetime-local in bogota to utc and back", () => {
    const utc = bogotaLocalToUtcIso("2026-02-12T20:30");
    expect(utc).toBe("2026-02-13T01:30:00.000Z");

    const local = utcIsoToBogotaParts(utc);
    expect(local.date).toBe("12/02/2026");
    expect(local.time).toBe("20:30");
  });

  it("converts datetime-local using an explicit timezone", () => {
    expect(localDateTimeToUtcIso("2030-07-10T18:00", "America/New_York")).toBe("2030-07-10T22:00:00.000Z");
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

  it("builds whatsapp summary for open match with organizer only (1/4)", () => {
    const summary = buildWhatsAppSummary(buildMatch(), shareUrl, summaryNow);

    expect(summary).toBe(
      [
        "Padel CC",
        "Hoy 8:30 pm · Mixto",
        "Confirmados (1/4): Ana",
        "Faltan 3 cupos",
        `Únete aquí: ${shareUrl}`,
      ].join("\n"),
    );
  });

  it("builds whatsapp summary for match with 3/4 and singular urgency", () => {
    const match = buildMatch({
      startsAtUtc: "2026-02-14T01:30:00.000Z",
      participants: [
        buildParticipant("u1", "Ana", "2026-01-01T00:00:00.000Z"),
        buildParticipant("u2", "Bob", "2026-01-01T00:01:00.000Z"),
        buildParticipant("u3", "Carlos", "2026-01-01T00:02:00.000Z"),
      ],
    });

    const summary = buildWhatsAppSummary(match, shareUrl, summaryNow);

    expect(summary).toBe(
      [
        "Padel CC",
        "Mañana 8:30 pm · Mixto",
        "Confirmados (3/4): Ana, Bob, Carlos",
        "Faltan 1 cupo",
        `Únete aquí: ${shareUrl}`,
      ].join("\n"),
    );
  });

  it("builds whatsapp summary for full match (4/4) and caps names to four", () => {
    const match = buildMatch({
      startsAtUtc: "2026-02-15T01:30:00.000Z",
      status: "cerrada",
      participants: [
        buildParticipant("u1", "Ana", "2026-01-01T00:00:00.000Z"),
        buildParticipant("u2", "Bob", "2026-01-01T00:01:00.000Z"),
        buildParticipant("u3", "Carlos", "2026-01-01T00:02:00.000Z"),
        buildParticipant("u4", "Diana", "2026-01-01T00:03:00.000Z"),
        buildParticipant("u5", "Extra", "2026-01-01T00:04:00.000Z"),
      ],
    });

    const summary = buildWhatsAppSummary(match, shareUrl, summaryNow);

    expect(summary).toBe(
      [
        "Padel CC",
        "14/02/2026 8:30 pm · Mixto",
        "Confirmados (4/4): Ana, Bob, Carlos, Diana",
        "Completo",
        `Ver detalles: ${shareUrl}`,
      ].join("\n"),
    );
    expect(summary).not.toContain("Faltan");
    expect(summary).not.toContain("Únete aquí");
    expect(summary).not.toContain("Extra");
  });

  it("builds whatsapp summary for canceled match without join urgency", () => {
    const match = buildMatch({
      startsAtUtc: "2026-02-15T01:30:00.000Z",
      status: "cancelada",
      isCanceled: true,
      participants: [
        buildParticipant("u1", "Ana", "2026-01-01T00:00:00.000Z"),
        buildParticipant("u2", "Bob", "2026-01-01T00:01:00.000Z"),
      ],
    });

    const summary = buildWhatsAppSummary(match, shareUrl, summaryNow);

    expect(summary).toBe(
      [
        "Padel CC",
        "14/02/2026 8:30 pm · Mixto",
        "Cancelado",
        `Ver detalles: ${shareUrl}`,
      ].join("\n"),
    );
    expect(summary).not.toContain("Confirmados");
    expect(summary).not.toContain("Faltan");
    expect(summary).not.toContain("Únete aquí");
  });

  it("builds whatsapp summary for no-show match without join urgency", () => {
    const match = buildMatch({
      startsAtUtc: "2026-02-15T01:30:00.000Z",
      status: "no_se_armo",
      participants: [buildParticipant("u1", "Ana", "2026-01-01T00:00:00.000Z")],
    });

    const summary = buildWhatsAppSummary(match, shareUrl, summaryNow);

    expect(summary).toBe(
      [
        "Padel CC",
        "14/02/2026 8:30 pm · Mixto",
        "No se armó",
        `Ver detalles: ${shareUrl}`,
      ].join("\n"),
    );
    expect(summary).not.toContain("Confirmados");
    expect(summary).not.toContain("Faltan");
    expect(summary).not.toContain("Únete aquí");
  });

  it("suggests retry slot in the future preserving Bogotá hour block", () => {
    expect(suggestRetryStartsAtLocal("2030-02-12T20:00:00.000Z", new Date("2030-02-12T18:30:00.000Z"))).toBe(
      "2030-02-12T15:00",
    );
    expect(suggestRetryStartsAtLocal("2030-02-12T20:00:00.000Z", new Date("2030-02-12T20:30:00.000Z"))).toBe(
      "2030-02-13T15:00",
    );
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

  it("groups matches by Bogotá day with Hoy and Mañana labels", () => {
    const now = new Date("2026-02-12T15:00:00.000Z");

    const makeMatch = (startsAtUtc: string): MatchView => ({
      publicId: startsAtUtc,
      organizerUserId: "u1",
      club: "Club",
      startsAtUtc,
      timezone: "America/Bogota",
      category: "4ta",
      modality: "mixto",
      status: "abierta",
      participants: [],
      isOrganizer: false,
      canJoin: true,
      canLeave: false,
      isCanceled: false,
      isWatchingReleaseSpot: false,
    });

    const matches = [
      makeMatch("2026-02-12T20:00:00.000Z"),
      makeMatch("2026-02-12T22:00:00.000Z"),
      makeMatch("2026-02-13T20:00:00.000Z"),
      makeMatch("2026-02-14T20:00:00.000Z"),
    ];

    const groups = groupMatchesByDay(matches, now);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe("Hoy");
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].label).toBe("Mañana");
    expect(groups[1].matches).toHaveLength(1);
    expect(groups[2].label).toBeTruthy();
    expect(groups[2].matches).toHaveLength(1);
  });

  it("returns empty array when grouping empty matches", () => {
    expect(groupMatchesByDay([])).toEqual([]);
  });

  it("validates avatar file type and size", () => {
    const valid = new File([new Uint8Array(1024)], "avatar.jpg", { type: "image/jpeg" });
    expect(validateAvatarFile(valid)).toBeNull();

    const invalidType = new File([new Uint8Array(1024)], "avatar.gif", { type: "image/gif" });
    expect(validateAvatarFile(invalidType)).toBe("Formato inválido. Usa JPG, PNG o WEBP.");

    const tooBig = new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], "avatar.png", { type: "image/png" });
    expect(validateAvatarFile(tooBig)).toBe("La foto debe pesar máximo 3MB.");
  });

  it("builds random free round pairings and auto-creates one BYE when odd", () => {
    const pairings = buildRandomFreeRoundPairings(["t1", "t2", "t3", "t4", "t5"]);
    const byes = pairings.filter((pairing) => pairing.teamBId === null);

    expect(pairings).toHaveLength(3);
    expect(byes).toHaveLength(1);
    expect(new Set(pairings.flatMap((pairing) => [pairing.teamAId, pairing.teamBId].filter(Boolean))).size).toBe(5);
  });

  it("builds manual free pairings and appends BYE for one unpaired team", () => {
    const pairings = buildManualFreeRoundPairings(
      ["team-a", "team-b", "team-c"],
      [{ teamAId: "team-a", teamBId: "team-b" }],
    );

    expect(pairings).toEqual([
      { teamAId: "team-a", teamBId: "team-b" },
      { teamAId: "team-c", teamBId: null },
    ]);
  });

  it("rejects invalid manual free pairings", () => {
    expect(() =>
      buildManualFreeRoundPairings(
        ["team-a", "team-b", "team-c", "team-d"],
        [{ teamAId: "team-a", teamBId: "team-b" }],
      ),
    ).toThrow("VALIDATION_ERROR");

    expect(() =>
      buildManualFreeRoundPairings(
        ["team-a", "team-b"],
        [{ teamAId: "team-a", teamBId: "team-a" }],
      ),
    ).toThrow("VALIDATION_ERROR");
  });
});
