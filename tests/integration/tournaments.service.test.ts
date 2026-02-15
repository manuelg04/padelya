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

  it("generates groups and fixtures, then freezes category registrations", async () => {
    const admin = await createUser(service, "+573110001031", "Admin");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Grupos",
      startsAtLocal: "2030-01-26T18:00",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 8 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    const registrations: string[] = [];
    const playerTokens: string[] = [];

    for (let index = 1; index <= 8; index += 1) {
      const player = await createUser(service, `+57311000104${index}`, `Player${index}`);
      playerTokens.push(player.token);

      const registration = await service.registerForCategory(player.token, created.tournamentSlug, categorySlug, {
        teamName: `Team${index}`,
      });
      registrations.push(registration.registrationId);

      await service.setTournamentRegistrationStatus(admin.token, registration.registrationId, "confirmed");
    }

    const groups = await service.generateTournamentGroups(admin.token, created.tournamentSlug, categorySlug);
    expect(groups.groupCount).toBe(2);
    expect(groups.teamsCount).toBe(8);

    const detail = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    expect(detail.groupStage?.groups).toHaveLength(2);
    expect(detail.groupStage?.groups.every((group) => group.teams.length === 4)).toBe(true);

    const sourceGroup = detail.groupStage?.groups[0];
    const destinationGroup = detail.groupStage?.groups[1];
    const teamId = sourceGroup?.teams[0]?.id;
    expect(sourceGroup && destinationGroup && teamId).toBeTruthy();

    await service.moveTournamentTeamGroup(
      admin.token,
      created.tournamentSlug,
      categorySlug,
      teamId!,
      destinationGroup!.name,
    );

    const fixtures = await service.generateTournamentGroupMatches(admin.token, created.tournamentSlug, categorySlug);
    expect(fixtures.groupsCount).toBe(2);
    expect(fixtures.matchesCount).toBe(12);

    const playerDetail = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, playerTokens[0]!);
    expect(playerDetail.myGroupMatches).toHaveLength(3);

    await expect(
      service.setTournamentRegistrationStatus(admin.token, registrations[0]!, "waitlist"),
    ).rejects.toMatchObject<DomainError>({
      code: "TOURNAMENT_CATEGORY_FROZEN",
    });

    await expect(
      service.cancelTournamentRegistration(playerTokens[0]!, registrations[0]!),
    ).rejects.toMatchObject<DomainError>({
      code: "TOURNAMENT_CATEGORY_FROZEN",
    });

    const late = await createUser(service, "+573110001050", "Late");
    await expect(
      service.registerForCategory(late.token, created.tournamentSlug, categorySlug, { teamName: "Late Team" }),
    ).rejects.toMatchObject<DomainError>({
      code: "TOURNAMENT_CATEGORY_FROZEN",
    });
  });
});
