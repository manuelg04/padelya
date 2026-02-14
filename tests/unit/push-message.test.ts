import { describe, expect, it } from "vitest";

import {
  formatJoinPushBody,
  formatReleaseSpotPushBody,
  resolveJoinPushRecipientUserIds,
} from "@/convex/padel/push_message";

describe("push message formatting", () => {
  it("formats join push body with Hoy label", () => {
    const body = formatJoinPushBody({
      joinerAlias: "Ana",
      club: "Padel Norte",
      startsAtUtc: "2026-02-14T20:00:00.000Z",
      referenceNowUtc: "2026-02-14T12:00:00.000Z",
    });

    expect(body).toBe("Ana se unió a Padel Norte · Hoy 15:00");
  });

  it("formats join push body with Mañana label", () => {
    const body = formatJoinPushBody({
      joinerAlias: "Ana",
      club: "Padel Norte",
      startsAtUtc: "2026-02-15T20:00:00.000Z",
      referenceNowUtc: "2026-02-14T23:00:00.000Z",
    });

    expect(body).toBe("Ana se unió a Padel Norte · Mañana 15:00");
  });

  it("formats join push body with dd/MM/yyyy for later dates", () => {
    const body = formatJoinPushBody({
      joinerAlias: "Ana",
      club: "Padel Norte",
      startsAtUtc: "2026-02-17T20:00:00.000Z",
      referenceNowUtc: "2026-02-14T12:00:00.000Z",
    });

    expect(body).toBe("Ana se unió a Padel Norte · 17/02/2026 15:00");
  });

  it("formats release push body", () => {
    const body = formatReleaseSpotPushBody({
      club: "Padel Norte",
      startsAtUtc: "2026-02-14T20:00:00.000Z",
      referenceNowUtc: "2026-02-14T12:00:00.000Z",
    });

    expect(body).toBe("Ahora hay cupo en Padel Norte · Hoy 15:00");
  });

  it("excludes joiner and deduplicates recipients", () => {
    const recipients = resolveJoinPushRecipientUserIds(["u1", "u2", "u2", "u3"], "u2");
    expect(recipients).toEqual(["u1", "u3"]);
  });
});
