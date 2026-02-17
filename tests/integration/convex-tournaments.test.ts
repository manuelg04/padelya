import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");

describe("Convex tournaments", () => {
  beforeEach(() => {
    process.env.TOURNAMENTS_SEED_TOKEN = "test-seed-token";
  });

  it("allows admin to create tournaments and categories", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Apertura",
      startsAtLocal: "2030-01-15T18:00",
      description: "Torneo inicial",
      categories: [
        { name: "Mixto iniciación", capacity: 2 },
        { name: "Mixto intermedio", capacity: 2 },
      ],
    });

    expect(created.tournamentSlug).toBeTruthy();
    expect(created.categorySlugs).toHaveLength(2);
  });

  it("forces America/Bogota timezone on tournament creation", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Timezone",
      startsAtLocal: "2030-07-10T18:00",
      timezone: "America/New_York",
      description: "Torneo con timezone",
      categories: [{ name: "Mixto", capacity: 2 }],
    });

    const detail = await admin.query(api.tournaments.getTournamentBySlug, {
      tournamentSlug: created.tournamentSlug,
    });

    expect(detail.tournament.timezone).toBe("America/Bogota");
    expect(detail.tournament.startsAtUtc).toBe("2030-07-10T23:00:00.000Z");
  });

  it("allows tournament creation with date and optional empty time", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Solo Fecha",
      startsAtDate: "2030-07-10",
      description: "Torneo sin hora",
      categories: [{ name: "Mixto", capacity: 2 }],
    });

    const detail = await admin.query(api.tournaments.getTournamentBySlug, {
      tournamentSlug: created.tournamentSlug,
    });

    expect(detail.tournament.startsAtUtc).toBe("2030-07-10T05:00:00.000Z");
  });

  it("blocks non-admin from creating tournaments", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const player = t.withIdentity({ subject: "player-uid", phoneNumber: "+573001000010" });
    await player.mutation(api.padel.upsertUser, {});

    await expect(
      player.mutation(api.tournaments.createTournament, {
        clubSlug: "smash-club",
        name: "Torneo no autorizado",
        startsAtLocal: "2030-01-15T18:00",
        description: "x",
        categories: [{ name: "Cat", capacity: 2 }],
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("applies pending/waitlist capacity and dedupe rules", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});
    await admin.mutation(api.padel.updateAlias, { alias: "Admin" });

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Cupos",
      startsAtLocal: "2030-01-20T18:00",
      description: "x",
      categories: [{ name: "Única", capacity: 1 }],
    });

    const categorySlug = created.categorySlugs[0]!;

    const p1 = t.withIdentity({ subject: "p1", phoneNumber: "+573001000101" });
    await p1.mutation(api.padel.upsertUser, {});
    await p1.mutation(api.padel.updateAlias, { alias: "Play1" });

    const p2 = t.withIdentity({ subject: "p2", phoneNumber: "+573001000102" });
    await p2.mutation(api.padel.upsertUser, {});
    await p2.mutation(api.padel.updateAlias, { alias: "Play2" });

    const first = await p1.mutation(api.tournaments.registerForCategory, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      teamName: "P1/Pareja",
    });

    const second = await p2.mutation(api.tournaments.registerForCategory, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      teamName: "P2/Pareja",
    });

    expect(first.status).toBe("pending");
    expect(second.status).toBe("waitlist");

    await expect(
      p1.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: "Duplicado",
      }),
    ).rejects.toThrow(/TOURNAMENT_ALREADY_REGISTERED/);
  });

  it("allows cancel by owner and admin confirm/promotion", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});
    await admin.mutation(api.padel.updateAlias, { alias: "Admin" });

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Flujo",
      startsAtLocal: "2030-01-22T18:00",
      description: "x",
      categories: [{ name: "Cat", capacity: 1 }],
    });

    const categorySlug = created.categorySlugs[0]!;

    const p1 = t.withIdentity({ subject: "p1", phoneNumber: "+573001000201" });
    await p1.mutation(api.padel.upsertUser, {});
    await p1.mutation(api.padel.updateAlias, { alias: "Play1" });

    const p2 = t.withIdentity({ subject: "p2", phoneNumber: "+573001000202" });
    await p2.mutation(api.padel.upsertUser, {});
    await p2.mutation(api.padel.updateAlias, { alias: "Play2" });

    const r1 = await p1.mutation(api.tournaments.registerForCategory, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      teamName: "Team1",
    });
    const r2 = await p2.mutation(api.tournaments.registerForCategory, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      teamName: "Team2",
    });

    await p1.mutation(api.tournaments.cancelMyRegistration, {
      registrationId: r1.registrationId as Id<"tournamentRegistrations">,
    });

    const promoted = await admin.mutation(api.tournaments.setRegistrationStatus, {
      registrationId: r2.registrationId as Id<"tournamentRegistrations">,
      status: "confirmed",
    });

    expect(promoted.status).toBe("confirmed");
  });

  it("generates groups + fixtures and freezes registrations after groups", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});
    await admin.mutation(api.padel.updateAlias, { alias: "Admin" });

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Grupos",
      startsAtLocal: "2030-01-25T18:00",
      description: "x",
      categories: [{ name: "Cat", capacity: 8 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    const registrations: Array<{ registrationId: string; teamId?: string; playerSubject: string }> = [];

    for (let index = 1; index <= 8; index += 1) {
      const subject = `p${index}`;
      const phone = `+57300110010${index}`;
      const player = t.withIdentity({ subject, phoneNumber: phone });
      await player.mutation(api.padel.upsertUser, {});
      await player.mutation(api.padel.updateAlias, { alias: `Play${index}` });

      const registration = await player.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: `Team${index}`,
      });

      registrations.push({ registrationId: registration.registrationId, playerSubject: subject });
      await admin.mutation(api.tournaments.setRegistrationStatus, {
        registrationId: registration.registrationId as Id<"tournamentRegistrations">,
        status: "confirmed",
      });
    }

    const generatedGroups = await admin.mutation(api.tournaments.generateCategoryGroups, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(generatedGroups.groupCount).toBe(2);
    expect(generatedGroups.teamsCount).toBe(8);

    const detailAfterGroups = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(detailAfterGroups.groupStage?.groups).toHaveLength(2);
    expect(detailAfterGroups.groupStage?.groups.every((group) => group.teams.length === 4)).toBe(true);

    await expect(
      admin.mutation(api.tournaments.generateCategoryGroups, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
      }),
    ).rejects.toThrow(/VALIDATION_ERROR/);

    const firstGroup = detailAfterGroups.groupStage?.groups[0];
    const secondGroup = detailAfterGroups.groupStage?.groups[1];
    const movableTeamId = firstGroup?.teams[0]?.id;
    expect(firstGroup && secondGroup && movableTeamId).toBeTruthy();

    await admin.mutation(api.tournaments.moveCategoryTeamToGroup, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      teamId: movableTeamId as Id<"tournamentTeams">,
      targetGroupName: secondGroup!.name,
    });

    const generatedMatches = await admin.mutation(api.tournaments.generateCategoryGroupMatches, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(generatedMatches.groupsCount).toBe(2);
    expect(generatedMatches.matchesCount).toBe(12);

    const detailAfterMatches = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(detailAfterMatches.groupStage?.matchesByGroup.every((group) => group.matches.length === 6)).toBe(true);

    const playerOne = t.withIdentity({ subject: registrations[0]!.playerSubject, phoneNumber: "+573001100101" });
    const playerOneDetail = await playerOne.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(playerOneDetail.myGroupMatches).toHaveLength(3);

    await expect(
      playerOne.mutation(api.tournaments.cancelMyRegistration, {
        registrationId: registrations[0]!.registrationId as Id<"tournamentRegistrations">,
      }),
    ).rejects.toThrow(/TOURNAMENT_CATEGORY_FROZEN/);

    await expect(
      admin.mutation(api.tournaments.setRegistrationStatus, {
        registrationId: registrations[1]!.registrationId as Id<"tournamentRegistrations">,
        status: "waitlist",
      }),
    ).rejects.toThrow(/TOURNAMENT_CATEGORY_FROZEN/);

    const latePlayer = t.withIdentity({ subject: "late-player", phoneNumber: "+573001100199" });
    await latePlayer.mutation(api.padel.upsertUser, {});
    await latePlayer.mutation(api.padel.updateAlias, { alias: "Late" });
    await expect(
      latePlayer.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: "Late Team",
      }),
    ).rejects.toThrow(/TOURNAMENT_CATEGORY_FROZEN/);
  });

  it("reports and edits group results with standings + qualified teams derived at runtime", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});
    await admin.mutation(api.padel.updateAlias, { alias: "Admin" });

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Resultados",
      startsAtLocal: "2030-02-01T18:00",
      description: "x",
      categories: [{ name: "Cat", capacity: 8 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    for (let index = 1; index <= 8; index += 1) {
      const player = t.withIdentity({ subject: `p${index}`, phoneNumber: `+57300130010${index}` });
      await player.mutation(api.padel.upsertUser, {});
      await player.mutation(api.padel.updateAlias, { alias: `Play${index}` });
      const registration = await player.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: `Team${index}`,
      });
      await admin.mutation(api.tournaments.setRegistrationStatus, {
        registrationId: registration.registrationId as Id<"tournamentRegistrations">,
        status: "confirmed",
      });
    }

    await admin.mutation(api.tournaments.generateCategoryGroups, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    await admin.mutation(api.tournaments.generateCategoryGroupMatches, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });

    const before = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    const firstGroup = before.groupStage?.groups[0];
    const firstGroupMatches = before.groupStage?.matchesByGroup[0]?.matches ?? [];
    const firstMatch = firstGroupMatches[0];
    expect(firstGroup && firstMatch).toBeTruthy();

    await admin.mutation(api.tournaments.reportCategoryGroupMatchResult, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      matchId: firstMatch!.id as Id<"tournamentMatches">,
      winnerTeamId: firstMatch!.teamA.id as Id<"tournamentTeams">,
      sets: [{ teamAGames: 8, teamBGames: 6 }],
    });

    const afterFirstReport = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    const firstMatchAfterReport = afterFirstReport.groupStage?.matchesByGroup[0]?.matches.find(
      (match) => match.id === firstMatch!.id,
    );
    expect(firstMatchAfterReport?.status).toBe("completed");
    expect(firstMatchAfterReport?.result?.winnerTeamId).toBe(firstMatch!.teamA.id);
    expect(firstMatchAfterReport?.result?.sets).toHaveLength(1);

    await admin.mutation(api.tournaments.reportCategoryGroupMatchResult, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      matchId: firstMatch!.id as Id<"tournamentMatches">,
      winnerTeamId: firstMatch!.teamB.id as Id<"tournamentTeams">,
      sets: [
        { teamAGames: 4, teamBGames: 6 },
        { teamAGames: 3, teamBGames: 6 },
      ],
    });

    const afterEdit = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    const firstMatchAfterEdit = afterEdit.groupStage?.matchesByGroup[0]?.matches.find((match) => match.id === firstMatch!.id);
    expect(firstMatchAfterEdit?.result?.winnerTeamId).toBe(firstMatch!.teamB.id);

    await expect(
      admin.mutation(api.tournaments.reportCategoryGroupMatchResult, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        matchId: firstMatch!.id as Id<"tournamentMatches">,
        winnerTeamId: firstMatch!.teamA.id as Id<"tournamentTeams">,
        sets: [
          { teamAGames: 6, teamBGames: 6 },
          { teamAGames: 6, teamBGames: 4 },
        ],
      }),
    ).rejects.toThrow(/VALIDATION_ERROR/);

    const outsider = t.withIdentity({ subject: "outsider", phoneNumber: "+573001300999" });
    await outsider.mutation(api.padel.upsertUser, {});
    await outsider.mutation(api.padel.updateAlias, { alias: "Outsider" });

    await expect(
      outsider.mutation(api.tournaments.reportCategoryGroupMatchResult, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        matchId: firstMatch!.id as Id<"tournamentMatches">,
        winnerTeamId: firstMatch!.teamA.id as Id<"tournamentTeams">,
        sets: [
          { teamAGames: 6, teamBGames: 4 },
          { teamAGames: 6, teamBGames: 4 },
        ],
      }),
    ).rejects.toThrow(/FORBIDDEN/);

    const refreshed = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
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
      await admin.mutation(api.tournaments.reportCategoryGroupMatchResult, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        matchId: match.id as Id<"tournamentMatches">,
        winnerTeamId: winnerTeamId as Id<"tournamentTeams">,
        sets: winnerIsTeamA
          ? [
              { teamAGames: 6, teamBGames: 4 },
              { teamAGames: 6, teamBGames: 3 },
            ]
          : [
              { teamAGames: 4, teamBGames: 6 },
              { teamAGames: 3, teamBGames: 6 },
            ],
      });
    }

    const finalDetail = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    const firstStanding = finalDetail.groupStage?.standingsByGroup.find(
      (standing) => standing.groupId === refreshedGroup!.id,
    );
    expect(firstStanding).toBeTruthy();
    expect(firstStanding?.rows[0]?.team.id).toBe(team1);
    expect(firstStanding?.rows[1]?.team.id).toBe(team2);
    expect(firstStanding?.rows[0]?.qualified).toBe(true);
    expect(firstStanding?.rows[1]?.qualified).toBe(true);
    expect(firstStanding?.hasUnresolvedTieAtQualificationCutoff).toBe(false);
    expect(finalDetail.groupStage?.qualifiedTeams.length).toBe(4);
  });

  it("supports free rounds with open results and next rounds from winners", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.tournaments.seedClubAndMembers, {
      clubSlug: "smash-club",
      clubName: "Smash Club",
      adminFirebaseUids: ["admin-uid"],
      staffFirebaseUids: [],
      seedToken: "test-seed-token",
    });

    const admin = t.withIdentity({ subject: "admin-uid", phoneNumber: "+573001000001" });
    await admin.mutation(api.padel.upsertUser, {});
    await admin.mutation(api.padel.updateAlias, { alias: "Admin" });

    const created = await admin.mutation(api.tournaments.createTournament, {
      clubSlug: "smash-club",
      name: "Torneo Libre Convex",
      startsAtLocal: "2030-02-10T18:00",
      description: "x",
      categories: [{ name: "Libre", competitionMode: "free", capacity: 5 }],
    });
    const categorySlug = created.categorySlugs[0]!;

    for (let index = 1; index <= 5; index += 1) {
      const player = t.withIdentity({ subject: `free-p${index}`, phoneNumber: `+57300140010${index}` });
      await player.mutation(api.padel.upsertUser, {});
      await player.mutation(api.padel.updateAlias, { alias: `Free${index}` });

      const registration = await player.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: `Free Team ${index}`,
      });

      await admin.mutation(api.tournaments.setRegistrationStatus, {
        registrationId: registration.registrationId as Id<"tournamentRegistrations">,
        status: "confirmed",
      });
    }

    const firstRound = await admin.mutation(api.tournaments.createCategoryFreeRound, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      sourceType: "random",
    });
    expect(firstRound.matchesCount).toBe(3);
    expect(firstRound.byeCount).toBe(1);

    const detailAfterFirstRound = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(detailAfterFirstRound.category.competitionMode).toBe("free");
    expect(detailAfterFirstRound.groupStage).toBeNull();
    expect(detailAfterFirstRound.freeStage?.rounds).toHaveLength(1);

    await expect(
      admin.mutation(api.tournaments.registerForCategory, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        teamName: "Late Team",
      }),
    ).rejects.toThrow(/TOURNAMENT_CATEGORY_FROZEN/);

    const firstRoundView = detailAfterFirstRound.freeStage?.rounds[0];
    expect(firstRoundView).toBeTruthy();

    const pendingMatches = firstRoundView!.matches.filter((match) => match.status === "pending");
    for (const match of pendingMatches) {
      await admin.mutation(api.tournaments.reportCategoryFreeMatchResult, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        matchId: match.id as Id<"tournamentFreeMatches">,
        winnerTeamId: match.teamA.id as Id<"tournamentTeams">,
        scoreText: "6-4, 6-3",
      });
    }

    await admin.mutation(api.tournaments.createCategoryFreeRound, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
      sourceType: "random",
      sourceRoundId: firstRoundView!.id as Id<"tournamentFreeRounds">,
    });

    const detailAfterSecondRound = await admin.query(api.tournaments.getTournamentCategoryBySlug, {
      tournamentSlug: created.tournamentSlug,
      categorySlug,
    });
    expect(detailAfterSecondRound.freeStage?.rounds).toHaveLength(2);
    expect(detailAfterSecondRound.freeStage?.rounds[1]?.sourceRoundId).toBe(firstRoundView!.id);

    const outsider = t.withIdentity({ subject: "free-outsider", phoneNumber: "+573001499999" });
    await outsider.mutation(api.padel.upsertUser, {});
    await outsider.mutation(api.padel.updateAlias, { alias: "Outsider" });
    await expect(
      outsider.mutation(api.tournaments.createCategoryFreeRound, {
        tournamentSlug: created.tournamentSlug,
        categorySlug,
        sourceType: "random",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
