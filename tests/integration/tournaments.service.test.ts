import { beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "@/src/domain/errors";
import { PadelService } from "@/src/backend/service";

async function createUser(service: PadelService, phone: string, alias: string) {
  service.requestOtp(phone);
  const { token, user } = service.verifyOtp(phone, "123456");
  service.updateAlias(token, alias);
  return { token, firebaseUid: user.firebaseUid };
}

describe("PadelService tournaments", () => {
  let service: PadelService;

  beforeEach(() => {
    process.env.TOURNAMENTS_SEED_TOKEN = "test-seed-token";
    service = new PadelService();
  });

  it("creates tournament and applies pending/waitlist flow", async () => {
    const admin = await createUser(service, "+573110001001", "Admin");
    const p1 = await createUser(service, "+573110001002", "Play1");
    const p2 = await createUser(service, "+573110001003", "Play2");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Test",
      startsAtLocal: "2030-01-10T18:00",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 1 }],
    });

    const categorySlug = created.categorySlugs[0]!;

    const r1 = await service.registerForCategory(p1.token, created.tournamentSlug, categorySlug, {
      teamName: "P1 Team",
    });
    const r2 = await service.registerForCategory(p2.token, created.tournamentSlug, categorySlug, {
      teamName: "P2 Team",
    });

    expect(r1.status).toBe("pending");
    expect(r2.status).toBe("waitlist");
  });

  it("dedupes active registration and allows cancel by owner", async () => {
    const admin = await createUser(service, "+573110001011", "Admin");
    const player = await createUser(service, "+573110001012", "Play1");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Test 2",
      startsAtLocal: "2030-01-11T18:00",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 2 }],
    });

    const categorySlug = created.categorySlugs[0]!;

    const registration = await service.registerForCategory(player.token, created.tournamentSlug, categorySlug, {
      teamName: "P1 Team",
    });

    await expect(
      service.registerForCategory(player.token, created.tournamentSlug, categorySlug, {
        teamName: "Duplicado",
      }),
    ).rejects.toMatchObject<DomainError>({
      code: "TOURNAMENT_ALREADY_REGISTERED",
    });

    const cancelled = await service.cancelTournamentRegistration(player.token, registration.registrationId);
    expect(cancelled.status).toBe("cancelled");
  });

  it("enforces admin permission for status changes", async () => {
    const admin = await createUser(service, "+573110001021", "Admin");
    const player1 = await createUser(service, "+573110001022", "Play1");
    const player2 = await createUser(service, "+573110001023", "Play2");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Test 3",
      startsAtLocal: "2030-01-12T18:00",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 1 }],
    });

    const categorySlug = created.categorySlugs[0]!;
    const waitlistRegistration = await service.registerForCategory(player1.token, created.tournamentSlug, categorySlug, {
      teamName: "P1 Team",
    });
    const player2Registration = await service.registerForCategory(player2.token, created.tournamentSlug, categorySlug, {
      teamName: "P2 Team",
    });

    await expect(
      service.setTournamentRegistrationStatus(player2.token, waitlistRegistration.registrationId, "confirmed"),
    ).rejects.toMatchObject<DomainError>({
      code: "FORBIDDEN",
    });

    await service.cancelTournamentRegistration(player1.token, waitlistRegistration.registrationId);
    const confirmed = await service.setTournamentRegistrationStatus(
      admin.token,
      player2Registration.registrationId,
      "confirmed",
    );

    expect(confirmed.status).toBe("confirmed");
  });
});
