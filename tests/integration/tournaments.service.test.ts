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

  it("forces America/Bogota timezone on tournament creation", async () => {
    const admin = await createUser(service, "+573110001091", "Admin");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo TZ",
      startsAtLocal: "2030-07-10T18:00",
      timezone: "America/New_York",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 2 }],
    });

    const detail = await service.getTournamentBySlug(created.tournamentSlug);
    expect(detail.tournament.timezone).toBe("America/Bogota");
    expect(detail.tournament.startsAtUtc).toBe("2030-07-10T23:00:00.000Z");
  });

  it("allows tournament creation with date and optional empty time", async () => {
    const admin = await createUser(service, "+573110001092", "Admin");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Solo Fecha",
      startsAtDate: "2030-07-10",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 2 }],
    });

    const detail = await service.getTournamentBySlug(created.tournamentSlug);
    expect(detail.tournament.startsAtUtc).toBe("2030-07-10T05:00:00.000Z");
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

  it("reports and edits group results with standings + qualified teams derived at runtime", async () => {
    const admin = await createUser(service, "+573110001061", "Admin");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Resultados",
      startsAtLocal: "2030-02-01T18:00",
      description: "Desc",
      categories: [{ name: "Mixto", capacity: 8 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    for (let index = 1; index <= 8; index += 1) {
      const player = await createUser(service, `+57311000107${index}`, `Player${index}`);
      const registration = await service.registerForCategory(player.token, created.tournamentSlug, categorySlug, {
        teamName: `Team${index}`,
      });
      await service.setTournamentRegistrationStatus(admin.token, registration.registrationId, "confirmed");
    }

    await service.generateTournamentGroups(admin.token, created.tournamentSlug, categorySlug);
    await service.generateTournamentGroupMatches(admin.token, created.tournamentSlug, categorySlug);

    const before = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    const firstMatch = before.groupStage?.matchesByGroup[0]?.matches[0];
    const firstGroup = before.groupStage?.groups[0];
    expect(firstMatch && firstGroup).toBeTruthy();

    await service.reportTournamentGroupMatchResult(
      admin.token,
      created.tournamentSlug,
      categorySlug,
      firstMatch!.id,
      {
        winnerTeamId: firstMatch!.teamA.id,
        sets: [{ teamAGames: 8, teamBGames: 6 }],
      },
    );

    const afterFirst = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    const firstMatchAfterReport = afterFirst.groupStage?.matchesByGroup[0]?.matches.find((match) => match.id === firstMatch!.id);
    expect(firstMatchAfterReport?.status).toBe("completed");
    expect(firstMatchAfterReport?.result?.winnerTeamId).toBe(firstMatch!.teamA.id);
    expect(firstMatchAfterReport?.result?.sets).toHaveLength(1);

    await service.reportTournamentGroupMatchResult(
      admin.token,
      created.tournamentSlug,
      categorySlug,
      firstMatch!.id,
      {
        winnerTeamId: firstMatch!.teamB.id,
        sets: [
          { teamAGames: 4, teamBGames: 6 },
          { teamAGames: 3, teamBGames: 6 },
        ],
      },
    );

    const afterEdit = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    const firstMatchAfterEdit = afterEdit.groupStage?.matchesByGroup[0]?.matches.find((match) => match.id === firstMatch!.id);
    expect(firstMatchAfterEdit?.result?.winnerTeamId).toBe(firstMatch!.teamB.id);

    await expect(
      service.reportTournamentGroupMatchResult(
        admin.token,
        created.tournamentSlug,
        categorySlug,
        firstMatch!.id,
        {
          winnerTeamId: firstMatch!.teamA.id,
          sets: [
            { teamAGames: 6, teamBGames: 6 },
            { teamAGames: 6, teamBGames: 4 },
          ],
        },
      ),
    ).rejects.toMatchObject<DomainError>({
      code: "VALIDATION_ERROR",
    });

    const outsider = await createUser(service, "+573110001079", "Outsider");
    await expect(
      service.reportTournamentGroupMatchResult(
        outsider.token,
        created.tournamentSlug,
        categorySlug,
        firstMatch!.id,
        {
          winnerTeamId: firstMatch!.teamA.id,
          sets: [
            { teamAGames: 6, teamBGames: 4 },
            { teamAGames: 6, teamBGames: 4 },
          ],
        },
      ),
    ).rejects.toMatchObject<DomainError>({
      code: "FORBIDDEN",
    });

    const refreshed = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    const refreshedGroup = refreshed.groupStage?.groups[0];
    const refreshedMatches = refreshed.groupStage?.matchesByGroup[0]?.matches ?? [];
    expect(refreshedGroup).toBeTruthy();

    const teamsInOrder = refreshedGroup!.teams.map((team) => team.id);
    const [team1, team2, team3, team4] = teamsInOrder;
    const keyForPair = (a: string, b: string) => [a, b].sort().join("|");
    const winnerByPair = new Map<string, string>([
      [keyForPair(team1!, team2!), team1!],
      [keyForPair(team1!, team3!), team1!],
      [keyForPair(team1!, team4!), team1!],
      [keyForPair(team2!, team3!), team2!],
      [keyForPair(team2!, team4!), team2!],
      [keyForPair(team3!, team4!), team3!],
    ]);

    for (const match of refreshedMatches) {
      const winnerTeamId = winnerByPair.get(keyForPair(match.teamA.id, match.teamB.id));
      expect(winnerTeamId).toBeTruthy();

      const winnerIsTeamA = winnerTeamId === match.teamA.id;
      await service.reportTournamentGroupMatchResult(
        admin.token,
        created.tournamentSlug,
        categorySlug,
        match.id,
        {
          winnerTeamId: winnerTeamId!,
          sets: winnerIsTeamA
            ? [
                { teamAGames: 6, teamBGames: 4 },
                { teamAGames: 6, teamBGames: 3 },
              ]
            : [
                { teamAGames: 4, teamBGames: 6 },
                { teamAGames: 3, teamBGames: 6 },
              ],
        },
      );
    }

    const finalDetail = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    const firstStanding = finalDetail.groupStage?.standingsByGroup.find((standing) => standing.groupId === refreshedGroup!.id);
    expect(firstStanding).toBeTruthy();
    expect(firstStanding?.rows[0]?.team.id).toBe(team1);
    expect(firstStanding?.rows[1]?.team.id).toBe(team2);
    expect(firstStanding?.rows[0]?.qualified).toBe(true);
    expect(firstStanding?.rows[1]?.qualified).toBe(true);
    expect(firstStanding?.hasUnresolvedTieAtQualificationCutoff).toBe(false);
    expect(finalDetail.groupStage?.qualifiedTeams.length).toBe(4);
  });

  it("runs free mode rounds with open results and next round from winners", async () => {
    const admin = await createUser(service, "+573110001081", "Admin");

    await service.seedClubAndMembers({
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: [admin.firebaseUid],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const created = await service.createTournament(admin.token, {
      clubSlug: "smash-club",
      name: "Torneo Libre",
      startsAtLocal: "2030-02-10T18:00",
      description: "Desc",
      categories: [{ name: "Mixto Libre", competitionMode: "free", capacity: 5 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    for (let index = 1; index <= 5; index += 1) {
      const player = await createUser(service, `+57311000108${index}`, `Free${index}`);
      const registration = await service.registerForCategory(player.token, created.tournamentSlug, categorySlug, {
        teamName: `Free Team ${index}`,
      });
      await service.setTournamentRegistrationStatus(admin.token, registration.registrationId, "confirmed");
    }

    const createdRound = await service.createTournamentFreeRound(admin.token, created.tournamentSlug, categorySlug, {
      sourceType: "random",
    });
    expect(createdRound.matchesCount).toBe(3);
    expect(createdRound.byeCount).toBe(1);

    const detailAfterRound = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    expect(detailAfterRound.category.competitionMode).toBe("free");
    expect(detailAfterRound.groupStage).toBeNull();
    expect(detailAfterRound.freeStage?.rounds).toHaveLength(1);

    await expect(
      service.registerForCategory(admin.token, created.tournamentSlug, categorySlug, { teamName: "Late Team" }),
    ).rejects.toMatchObject<DomainError>({
      code: "TOURNAMENT_CATEGORY_FROZEN",
    });

    const firstRound = detailAfterRound.freeStage?.rounds[0];
    expect(firstRound).toBeTruthy();

    const pendingMatches = firstRound!.matches.filter((match) => match.status === "pending");
    for (const match of pendingMatches) {
      await service.reportTournamentFreeMatchResult(
        admin.token,
        created.tournamentSlug,
        categorySlug,
        match.id,
        {
          winnerTeamId: match.teamA.id,
          scoreText: "6-4, 6-3",
        },
      );
    }

    const secondRound = await service.createTournamentFreeRound(admin.token, created.tournamentSlug, categorySlug, {
      sourceType: "random",
      sourceRoundId: firstRound!.id,
    });
    expect(secondRound.matchesCount).toBeGreaterThan(0);

    const detailAfterSecondRound = await service.getTournamentCategoryBySlug(created.tournamentSlug, categorySlug, admin.token);
    expect(detailAfterSecondRound.freeStage?.rounds).toHaveLength(2);
    expect(detailAfterSecondRound.freeStage?.rounds[1]?.sourceRoundId).toBe(firstRound!.id);

    const outsider = await createUser(service, "+573110001099", "Outsider");
    await expect(
      service.createTournamentFreeRound(outsider.token, created.tournamentSlug, categorySlug, {
        sourceType: "random",
      }),
    ).rejects.toMatchObject<DomainError>({
      code: "FORBIDDEN",
    });
  });
});
