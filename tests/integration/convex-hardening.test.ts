import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.*s");

describe("Convex hardening", () => {
  beforeEach(() => {
    process.env.TOURNAMENTS_SEED_TOKEN = "test-seed-token";
  });

  it("requires auth for critical match mutations", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.padel.createMatch, {
        input: {
          club: "Club",
          startsAtLocal: "2030-01-01T20:00",
          category: "4ta",
          modality: "mixto",
        },
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);

    await expect(t.mutation(api.padel.join, { publicId: "abc123def4" })).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("prevents canceling match by non-organizer", async () => {
    const t = convexTest(schema, modules);

    const organizer = t.withIdentity({ subject: "org-uid", phoneNumber: "+573001111111" });
    await organizer.mutation(api.padel.upsertUser, {});
    await organizer.mutation(api.padel.updateAlias, { alias: "Organizador" });

    const created = await organizer.mutation(api.padel.createMatch, {
      input: {
        club: "Club Centro",
        startsAtLocal: "2030-01-01T20:00",
        category: "4ta",
        modality: "mixto",
      },
    });

    const other = t.withIdentity({ subject: "other-uid", phoneNumber: "+573001111112" });
    await other.mutation(api.padel.upsertUser, {});
    await other.mutation(api.padel.updateAlias, { alias: "Otro" });

    await expect(
      other.mutation(api.padel.cancel, {
        publicId: created.publicId,
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
});
