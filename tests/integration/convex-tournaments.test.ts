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
});
