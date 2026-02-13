import { beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "@/src/domain/errors";
import { MAX_PLAYERS } from "@/src/domain/types";
import { PadelService } from "@/src/backend/service";

async function createAuthedUser(service: PadelService, phone: string, alias: string) {
  service.requestOtp(phone);
  const { token } = service.verifyOtp(phone, "123456");
  service.updateAlias(token, alias);
  return token;
}

async function fillMatch(service: PadelService, publicId: string, playerTokens: string[]) {
  for (const token of playerTokens) {
    await service.join(publicId, token);
  }
}

describe("PadelService integration", () => {
  let service: PadelService;

  beforeEach(() => {
    service = new PadelService();
  });

  it("creates a match and auto-joins organizer", async () => {
    const organizerToken = await createAuthedUser(service, "+573001112233", "Organizador");

    const match = service.createMatch(organizerToken, {
      club: "Padel Norte",
      startsAtLocal: "2030-02-14T18:00",
      category: "4ta",
      modality: "mixto",
    });

    expect(match.participants).toHaveLength(1);
    expect(match.organizerUserId).toBeDefined();
    expect(match.participants[0]?.avatarUrl).toBeNull();
    expect(match.status).toBe("abierta");
    expect(match.isOrganizer).toBe(true);
  });

  it("blocks creating matches in the past or with non-hour slots", async () => {
    const organizerToken = await createAuthedUser(service, "+573001112234", "Organizador");

    expect(() =>
      service.createMatch(organizerToken, {
        club: "Padel Norte",
        startsAtLocal: "2000-01-01T10:00",
        category: "4ta",
        modality: "mixto",
      }),
    ).toThrowError(DomainError);

    expect(() =>
      service.createMatch(organizerToken, {
        club: "Padel Norte",
        startsAtLocal: "2030-03-01T10:30",
        category: "4ta",
        modality: "mixto",
      }),
    ).toThrowError(DomainError);
  });

  it("joins and leaves with automatic status updates", async () => {
    const organizer = await createAuthedUser(service, "+573001112200", "Org");
    const match = service.createMatch(organizer, {
      club: "Padel Sur",
      startsAtLocal: "2030-02-14T08:00",
      category: "5ta",
      modality: "masc",
    });

    const p2 = await createAuthedUser(service, "+573001112201", "Ana");
    const p3 = await createAuthedUser(service, "+573001112202", "Luis");
    const p4 = await createAuthedUser(service, "+573001112203", "Pao");

    await service.join(match.publicId, p2);
    await service.join(match.publicId, p3);
    const closed = await service.join(match.publicId, p4);
    expect(closed.participants).toHaveLength(MAX_PLAYERS);
    expect(closed.status).toBe("cerrada");

    const reopened = await service.leave(match.publicId, p3);
    expect(reopened.participants).toHaveLength(MAX_PLAYERS - 1);
    expect(reopened.status).toBe("abierta");
  });

  it("blocks joins on canceled matches", async () => {
    const organizer = await createAuthedUser(service, "+573001112210", "Org");
    const player = await createAuthedUser(service, "+573001112211", "Jugador");
    const match = service.createMatch(organizer, {
      club: "Padel Center",
      startsAtLocal: "2030-02-14T11:00",
      category: "4ta",
      modality: "fem",
    });

    await service.cancel(match.publicId, organizer);

    await expect(service.join(match.publicId, player)).rejects.toMatchObject<DomainError>({
      code: "MATCH_CANCELED",
    });
  });

  it("allows only one player to take the last spot under concurrency", async () => {
    const organizer = await createAuthedUser(service, "+573001112220", "Org");
    const match = service.createMatch(organizer, {
      club: "Padel Plus",
      startsAtLocal: "2030-02-14T20:00",
      category: "3ra",
      modality: "mixto",
    });

    const p2 = await createAuthedUser(service, "+573001112221", "Pao");
    const p3 = await createAuthedUser(service, "+573001112222", "Luis");
    const p4a = await createAuthedUser(service, "+573001112223", "Mara");
    const p4b = await createAuthedUser(service, "+573001112224", "Gabi");

    await service.join(match.publicId, p2);
    await service.join(match.publicId, p3);

    const [a, b] = await Promise.allSettled([
      service.join(match.publicId, p4a),
      service.join(match.publicId, p4b),
    ]);

    const fulfilled = [a, b].filter((result) => result.status === "fulfilled");
    const rejected = [a, b].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect((rejected[0].reason as DomainError).code).toBe("MATCH_FULL");
    }

    const latest = service.getMatch(match.publicId, organizer);
    expect(latest.participants).toHaveLength(MAX_PLAYERS);
  });

  it("allows follow/unfollow only for full matches", async () => {
    const organizer = await createAuthedUser(service, "+573001112240", "Org");
    const fullMatch = service.createMatch(organizer, {
      club: "Padel Full",
      startsAtLocal: "2030-02-14T20:00",
      category: "4ta",
      modality: "mixto",
    });

    const p2 = await createAuthedUser(service, "+573001112241", "Jug2");
    const p3 = await createAuthedUser(service, "+573001112242", "Jug3");
    const p4 = await createAuthedUser(service, "+573001112243", "Jug4");
    const watcher = await createAuthedUser(service, "+573001112244", "Watcher");

    await fillMatch(service, fullMatch.publicId, [p2, p3, p4]);

    const followed = await service.followMatchWatch(fullMatch.publicId, watcher);
    expect(followed.isWatchingReleaseSpot).toBe(true);

    const unfollowed = await service.unfollowMatchWatch(fullMatch.publicId, watcher);
    expect(unfollowed.isWatchingReleaseSpot).toBe(false);

    const openMatch = service.createMatch(organizer, {
      club: "Padel Open",
      startsAtLocal: "2030-02-15T20:00",
      category: "4ta",
      modality: "mixto",
    });

    await expect(service.followMatchWatch(openMatch.publicId, watcher)).rejects.toMatchObject<DomainError>({
      code: "VALIDATION_ERROR",
    });
  });

  it("auto-removes watcher when the user joins", async () => {
    const organizer = await createAuthedUser(service, "+573001112250", "Org");
    const match = service.createMatch(organizer, {
      club: "Padel Auto Cleanup",
      startsAtLocal: "2030-02-16T20:00",
      category: "4ta",
      modality: "mixto",
    });

    const p2 = await createAuthedUser(service, "+573001112251", "Jug2");
    const p3 = await createAuthedUser(service, "+573001112252", "Jug3");
    const p4 = await createAuthedUser(service, "+573001112253", "Jug4");
    const watcher = await createAuthedUser(service, "+573001112254", "Watcher");

    await fillMatch(service, match.publicId, [p2, p3, p4]);
    await service.followMatchWatch(match.publicId, watcher);

    await service.leave(match.publicId, p4);
    const joined = await service.join(match.publicId, watcher);
    expect(joined.participants.some((participant) => participant.alias === "Watcher")).toBe(true);
    expect(joined.isWatchingReleaseSpot).toBe(false);
  });

  it("dedupes CUPO_LIBERADO notifications per user and match", async () => {
    const organizer = await createAuthedUser(service, "+573001112260", "Org");
    const match = service.createMatch(organizer, {
      club: "Padel Dedupe Release",
      startsAtLocal: "2030-02-17T20:00",
      category: "4ta",
      modality: "mixto",
    });

    const p2 = await createAuthedUser(service, "+573001112261", "Jug2");
    const p3 = await createAuthedUser(service, "+573001112262", "Jug3");
    const p4 = await createAuthedUser(service, "+573001112263", "Jug4");
    const watcher = await createAuthedUser(service, "+573001112264", "Watcher");

    await fillMatch(service, match.publicId, [p2, p3, p4]);
    await service.followMatchWatch(match.publicId, watcher);

    await service.leave(match.publicId, p4);
    await service.join(match.publicId, p4);
    await service.leave(match.publicId, p3);

    const notifications = service.listNotifications(watcher, 20);
    const releaseNotifications = notifications.filter((notification) => notification.type === "CUPO_LIBERADO");
    expect(releaseNotifications).toHaveLength(1);
  });

  it("dedupes PARTIDO_CANCELADO notifications per user and match on retries", async () => {
    const organizer = await createAuthedUser(service, "+573001112270", "Org");
    const match = service.createMatch(organizer, {
      club: "Padel Dedupe Cancel",
      startsAtLocal: "2030-02-18T20:00",
      category: "4ta",
      modality: "mixto",
    });

    const p2 = await createAuthedUser(service, "+573001112271", "Jug2");
    const p3 = await createAuthedUser(service, "+573001112272", "Jug3");
    const p4 = await createAuthedUser(service, "+573001112273", "Jug4");
    const watcher = await createAuthedUser(service, "+573001112274", "Watcher");

    await fillMatch(service, match.publicId, [p2, p3, p4]);
    await service.followMatchWatch(match.publicId, watcher);

    await service.cancel(match.publicId, organizer);
    await service.cancel(match.publicId, organizer);

    const participantNotifications = service
      .listNotifications(p2, 20)
      .filter((notification) => notification.type === "PARTIDO_CANCELADO");
    const watcherNotifications = service
      .listNotifications(watcher, 20)
      .filter((notification) => notification.type === "PARTIDO_CANCELADO");

    expect(participantNotifications).toHaveLength(1);
    expect(watcherNotifications).toHaveLength(1);
  });

  it("lists open feed with source-based visibility, filters, order and inclusive time bounds", async () => {
    const now = new Date("2030-02-12T15:00:00.000Z");
    const organizer = await createAuthedUser(service, "+573001112230", "Org");

    service.createMatch(organizer, {
      club: "Open Desde Ahora",
      startsAtLocal: "2030-02-12T10:00",
      category: "4ta",
      modality: "mixto",
    });

    service.createMatch(organizer, {
      club: "Open Cierre Dia",
      startsAtLocal: "2030-02-12T23:00",
      category: "4ta",
      modality: "fem",
    });

    service.createMatch(organizer, {
      club: "Open Inicio Manana",
      startsAtLocal: "2030-02-13T00:00",
      category: "4ta",
      modality: "mixto",
    });

    service.createMatch(organizer, {
      club: "Open Masc Manana",
      startsAtLocal: "2030-02-13T08:00",
      category: "4ta",
      modality: "masc",
    });

    service.createMatch(organizer, {
      club: "Open Fuera 7 Dias",
      startsAtLocal: "2030-02-20T10:00",
      category: "4ta",
      modality: "mixto",
    });

    const full = service.createMatch(organizer, {
      club: "Completo",
      startsAtLocal: "2030-02-12T11:00",
      category: "4ta",
      modality: "mixto",
    });
    const p2 = await createAuthedUser(service, "+573001112231", "Jugador2");
    const p3 = await createAuthedUser(service, "+573001112232", "Jugador3");
    const p4 = await createAuthedUser(service, "+573001112233", "Jugador4");
    await service.join(full.publicId, p2);
    await service.join(full.publicId, p3);
    await service.join(full.publicId, p4);

    const canceled = service.createMatch(organizer, {
      club: "Cancelado",
      startsAtLocal: "2030-02-12T12:00",
      category: "4ta",
      modality: "fem",
    });
    await service.cancel(canceled.publicId, organizer);

    const today = service.listOpenFeed({ window: "today", now });
    expect(today.map((match) => match.club)).toEqual(["Open Desde Ahora", "Open Cierre Dia"]);

    const next7 = service.listOpenFeed({ window: "next7", now });
    expect(next7.map((match) => match.club)).toEqual([
      "Open Desde Ahora",
      "Open Cierre Dia",
      "Open Inicio Manana",
      "Open Masc Manana",
    ]);

    const onlyMasc = service.listOpenFeed({ window: "next7", modality: "masc", now });
    expect(onlyMasc.map((match) => match.club)).toEqual(["Open Masc Manana"]);
  });
});
