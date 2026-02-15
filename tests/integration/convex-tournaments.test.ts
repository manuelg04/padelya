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
});
