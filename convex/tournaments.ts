import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

import { getOptionalUser, requireOrCreateUser, requireUser } from "./padel/auth";
import { bogotaLocalToUtcIso, nowIso } from "./padel/date_time";
import { upsertUserByFirebaseUid } from "./padel/users_repo";
import { assertClubAdmin } from "./tournaments/authz";
import {
  countActiveOccupyingSpots,
  countRegistrationsByStatus,
  findActiveRegistrationForPrimary,
  getClubBySlug,
  getTeamById,
  getTournamentBySlug as getTournamentBySlugFromRepo,
  getTournamentCategoryBySlug as getTournamentCategoryBySlugFromRepo,
  listClubMembershipsForUser,
  listRegistrationsByCategory,
  listTournamentCategories,
} from "./tournaments/repo";
import { makeUniqueSlug, slugify } from "./tournaments/slugs";

type ReadCtx = QueryCtx | MutationCtx;

function ensureNonEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("VALIDATION_ERROR");
  }
  return trimmed;
}

async function requireTournamentBySlugOrThrow(tournamentSlug: string, ctx: ReadCtx) {
  const tournament = await getTournamentBySlugFromRepo(ctx, tournamentSlug);
  if (!tournament) {
    throw new Error("NOT_FOUND");
  }
  return tournament;
}

async function requireCategoryBySlugOrThrow(
  ctx: ReadCtx,
  tournamentId: Parameters<typeof getTournamentCategoryBySlugFromRepo>[1],
  categorySlug: string,
) {
  const category = await getTournamentCategoryBySlugFromRepo(ctx, tournamentId, categorySlug);
  if (!category) {
    throw new Error("NOT_FOUND");
  }
  return category;
}

async function buildCategoryCounts(ctx: ReadCtx, categoryId: Parameters<typeof countRegistrationsByStatus>[1]) {
  const [pending, confirmed, waitlist, cancelled] = await Promise.all([
    countRegistrationsByStatus(ctx, categoryId, "pending"),
    countRegistrationsByStatus(ctx, categoryId, "confirmed"),
    countRegistrationsByStatus(ctx, categoryId, "waitlist"),
    countRegistrationsByStatus(ctx, categoryId, "cancelled"),
  ]);

  return {
    pending,
    confirmed,
    waitlist,
    cancelled,
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export const getTournamentBySlug = query({
  args: {
    tournamentSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    const categories = await listTournamentCategories(ctx, tournament._id);
    const categoryViews = await Promise.all(
      categories.map(async (category) => {
        const counts = await buildCategoryCounts(ctx, category._id);
        return {
          id: String(category._id),
          slug: category.slug,
          name: category.name,
          capacity: category.capacity,
          note: category.note ?? null,
          counts,
          confirmedLabel: `${counts.confirmed}/${category.capacity}`,
        };
      }),
    );

    return {
      tournament: {
        id: String(tournament._id),
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
        description: tournament.description,
        prizes: tournament.prizes ?? null,
        priceInfo: tournament.priceInfo ?? null,
        posterUrl: tournament.posterUrl ?? null,
      },
      club: {
        id: String(club._id),
        slug: club.slug,
        name: club.name,
      },
      categories: categoryViews,
    };
  },
});

export const getTournamentCategoryBySlug = query({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);
    const counts = await buildCategoryCounts(ctx, category._id);

    const user = await getOptionalUser(ctx);
    let myRegistration: {
      id: string;
      status: "pending" | "confirmed" | "waitlist" | "cancelled";
      teamName: string;
      partnerPhone: string | null;
      createdAt: string;
      updatedAt: string;
    } | null = null;

    if (user) {
      const active = await findActiveRegistrationForPrimary(ctx, category._id, user._id);
      if (active) {
        const team = await getTeamById(ctx, active.teamId);
        myRegistration = {
          id: String(active._id),
          status: active.status,
          teamName: team?.teamName ?? "",
          partnerPhone: team?.partnerPhone ?? null,
          createdAt: active.createdAt,
          updatedAt: active.updatedAt,
        };
      }
    }

    return {
      tournament: {
        id: String(tournament._id),
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
        description: tournament.description,
        prizes: tournament.prizes ?? null,
        priceInfo: tournament.priceInfo ?? null,
        posterUrl: tournament.posterUrl ?? null,
      },
      club: {
        id: String(club._id),
        slug: club.slug,
        name: club.name,
      },
      category: {
        id: String(category._id),
        slug: category.slug,
        name: category.name,
        capacity: category.capacity,
        note: category.note ?? null,
        counts,
      },
      myRegistration,
    };
  },
});

export const listAdminClubs = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await listClubMembershipsForUser(ctx, user._id);

    const clubs = await Promise.all(
      memberships.map(async (membership) => {
        const club = await ctx.db.get(membership.clubId);
        if (!club) {
          return null;
        }

        return {
          clubSlug: club.slug,
          clubName: club.name,
          role: membership.role,
          paymentInstructions: club.paymentInstructions ?? null,
        };
      }),
    );

    return clubs.filter((club): club is NonNullable<typeof club> => Boolean(club));
  },
});

export const listAdminTournaments = query({
  args: {
    clubSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const club = await getClubBySlug(ctx, args.clubSlug);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, user._id);

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_club", (q) => q.eq("clubId", club._id))
      .collect();

    tournaments.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

    const withCategoryCounts = await Promise.all(
      tournaments.map(async (tournament) => {
        const categories = await listTournamentCategories(ctx, tournament._id);
        return {
          id: String(tournament._id),
          slug: tournament.slug,
          name: tournament.name,
          startsAtUtc: tournament.startsAtUtc,
          timezone: tournament.timezone,
          description: tournament.description,
          categoriesCount: categories.length,
          categories: categories.map((category) => ({
            slug: category.slug,
            name: category.name,
            capacity: category.capacity,
          })),
        };
      }),
    );

    return {
      club: {
        slug: club.slug,
        name: club.name,
      },
      tournaments: withCategoryCounts,
    };
  },
});

export const getAdminCategoryDashboard = query({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, user._id);

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);
    const registrations = await listRegistrationsByCategory(ctx, category._id);
    const counts = await buildCategoryCounts(ctx, category._id);

    const rows = await Promise.all(
      registrations.map(async (registration) => {
        const team = await getTeamById(ctx, registration.teamId);
        const primaryUser = await ctx.db.get(registration.primaryUserId);

        return {
          id: String(registration._id),
          status: registration.status,
          createdAt: registration.createdAt,
          updatedAt: registration.updatedAt,
          primaryUserId: String(registration.primaryUserId),
          primaryAlias: primaryUser?.alias ?? null,
          primaryPhone: primaryUser?.phoneE164 ?? null,
          teamName: team?.teamName ?? "",
          partnerPhone: team?.partnerPhone ?? null,
        };
      }),
    );

    const byStatus = {
      pending: rows.filter((row) => row.status === "pending"),
      confirmed: rows.filter((row) => row.status === "confirmed"),
      waitlist: rows.filter((row) => row.status === "waitlist"),
      cancelled: rows.filter((row) => row.status === "cancelled"),
    };

    return {
      tournament: {
        id: String(tournament._id),
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
      },
      club: {
        slug: club.slug,
        name: club.name,
        paymentInstructions: club.paymentInstructions ?? null,
      },
      category: {
        id: String(category._id),
        slug: category.slug,
        name: category.name,
        capacity: category.capacity,
        note: category.note ?? null,
        counts,
      },
      registrations: byStatus,
    };
  },
});

export const createTournament = mutation({
  args: {
    clubSlug: v.string(),
    name: v.string(),
    startsAtLocal: v.string(),
    timezone: v.optional(v.string()),
    description: v.string(),
    prizes: v.optional(v.string()),
    priceInfo: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    categories: v.array(
      v.object({
        name: v.string(),
        capacity: v.number(),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireOrCreateUser(ctx);
    const club = await getClubBySlug(ctx, args.clubSlug);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, user._id);

    if (args.categories.length === 0) {
      throw new Error("VALIDATION_ERROR");
    }

    const now = nowIso();
    const tournamentName = ensureNonEmpty(args.name);
    const tournamentSlug = await makeUniqueSlug(tournamentName, async (slug) => {
      const existing = await getTournamentBySlugFromRepo(ctx, slug);
      return Boolean(existing);
    });

    const tournamentId = await ctx.db.insert("tournaments", {
      clubId: club._id,
      slug: tournamentSlug,
      name: tournamentName,
      startsAtUtc: bogotaLocalToUtcIso(args.startsAtLocal),
      timezone: args.timezone?.trim() || "America/Bogota",
      description: ensureNonEmpty(args.description),
      prizes: normalizeOptionalText(args.prizes),
      priceInfo: normalizeOptionalText(args.priceInfo),
      posterUrl: normalizeOptionalText(args.posterUrl),
      createdByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const categorySlugs: string[] = [];
    for (const categoryInput of args.categories) {
      if (!Number.isInteger(categoryInput.capacity) || categoryInput.capacity <= 0) {
        throw new Error("VALIDATION_ERROR");
      }

      const categoryName = ensureNonEmpty(categoryInput.name);
      const categorySlug = await makeUniqueSlug(categoryName, async (slug) => {
        const existing = await getTournamentCategoryBySlugFromRepo(ctx, tournamentId, slug);
        return Boolean(existing);
      });

      await ctx.db.insert("tournamentCategories", {
        tournamentId,
        slug: categorySlug,
        name: categoryName,
        capacity: categoryInput.capacity,
        note: normalizeOptionalText(categoryInput.note),
        createdAt: now,
        updatedAt: now,
      });

      categorySlugs.push(categorySlug);
    }

    return {
      tournamentSlug,
      categorySlugs,
    };
  },
});

export const registerForCategory = mutation({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
    teamName: v.string(),
    partnerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOrCreateUser(ctx);
    if (!user.alias) {
      throw new Error("ALIAS_REQUIRED");
    }

    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);

    const existing = await findActiveRegistrationForPrimary(ctx, category._id, user._id);
    if (existing) {
      throw new Error("TOURNAMENT_ALREADY_REGISTERED");
    }

    const occupyingSpots = await countActiveOccupyingSpots(ctx, category._id);
    const status = occupyingSpots >= category.capacity ? "waitlist" : "pending";
    const now = nowIso();

    const teamId = await ctx.db.insert("tournamentTeams", {
      tournamentId: tournament._id,
      categoryId: category._id,
      primaryUserId: user._id,
      teamName: ensureNonEmpty(args.teamName),
      partnerPhone: normalizeOptionalText(args.partnerPhone),
      createdAt: now,
      updatedAt: now,
    });

    const registrationId = await ctx.db.insert("tournamentRegistrations", {
      tournamentId: tournament._id,
      categoryId: category._id,
      teamId,
      primaryUserId: user._id,
      status,
      createdAt: now,
      updatedAt: now,
      statusChangedByUserId: user._id,
    });

    return {
      registrationId: String(registrationId),
      status,
    };
  },
});

export const cancelMyRegistration = mutation({
  args: {
    registrationId: v.id("tournamentRegistrations"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) {
      throw new Error("NOT_FOUND");
    }

    if (registration.primaryUserId !== user._id) {
      throw new Error("FORBIDDEN");
    }

    if (registration.status !== "cancelled") {
      const now = nowIso();
      await ctx.db.patch(registration._id, {
        status: "cancelled",
        updatedAt: now,
        cancelledAt: now,
        cancelledByUserId: user._id,
        statusChangedByUserId: user._id,
      });
    }

    return {
      registrationId: String(registration._id),
      status: "cancelled" as const,
    };
  },
});

export const setRegistrationStatus = mutation({
  args: {
    registrationId: v.id("tournamentRegistrations"),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) {
      throw new Error("NOT_FOUND");
    }

    const category = await ctx.db.get(registration.categoryId);
    if (!category) {
      throw new Error("NOT_FOUND");
    }

    const tournament = await ctx.db.get(registration.tournamentId);
    if (!tournament) {
      throw new Error("NOT_FOUND");
    }

    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    if (registration.status === args.status) {
      return {
        registrationId: String(registration._id),
        status: registration.status,
      };
    }

    if (args.status === "confirmed" && registration.status !== "confirmed") {
      const confirmedCount = await countRegistrationsByStatus(ctx, registration.categoryId, "confirmed");
      if (confirmedCount >= category.capacity) {
        throw new Error("TOURNAMENT_CAPACITY_REACHED");
      }
    }

    if (args.status === "pending" && registration.status !== "pending" && registration.status !== "confirmed") {
      const occupyingSpots = await countActiveOccupyingSpots(ctx, registration.categoryId);
      if (occupyingSpots >= category.capacity) {
        throw new Error("TOURNAMENT_CAPACITY_REACHED");
      }
    }

    const now = nowIso();
    await ctx.db.patch(registration._id, {
      status: args.status,
      updatedAt: now,
      statusChangedByUserId: actor._id,
      cancelledAt: args.status === "cancelled" ? now : undefined,
      cancelledByUserId: args.status === "cancelled" ? actor._id : undefined,
    });

    return {
      registrationId: String(registration._id),
      status: args.status,
    };
  },
});

export const updateClubPaymentInstructions = mutation({
  args: {
    clubSlug: v.string(),
    paymentInstructions: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const club = await getClubBySlug(ctx, args.clubSlug);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    await ctx.db.patch(club._id, {
      paymentInstructions: normalizeOptionalText(args.paymentInstructions),
      updatedAt: nowIso(),
    });

    return {
      ok: true,
    };
  },
});

export const seedClubAndMembers = mutation({
  args: {
    clubSlug: v.string(),
    clubName: v.string(),
    adminFirebaseUids: v.array(v.string()),
    staffFirebaseUids: v.array(v.string()),
    seedToken: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedToken = process.env.TOURNAMENTS_SEED_TOKEN;
    if (!expectedToken || args.seedToken !== expectedToken) {
      throw new Error("UNAUTHORIZED");
    }

    const normalizedClubSlug = slugify(args.clubSlug);
    const now = nowIso();

    let club = await getClubBySlug(ctx, normalizedClubSlug);
    if (!club) {
      const clubId = await ctx.db.insert("clubs", {
        slug: normalizedClubSlug,
        name: ensureNonEmpty(args.clubName),
        createdAt: now,
        updatedAt: now,
      });
      const inserted = await ctx.db.get(clubId);
      if (!inserted) {
        throw new Error("NOT_FOUND");
      }
      club = inserted;
    } else if (club.name !== ensureNonEmpty(args.clubName)) {
      await ctx.db.patch(club._id, {
        name: ensureNonEmpty(args.clubName),
        updatedAt: now,
      });
      const patched = await ctx.db.get(club._id);
      if (!patched) {
        throw new Error("NOT_FOUND");
      }
      club = patched;
    }

    const adminUidSet = new Set(args.adminFirebaseUids.map((uid) => uid.trim()).filter(Boolean));
    const staffUidSet = new Set(args.staffFirebaseUids.map((uid) => uid.trim()).filter(Boolean));

    let memberCount = 0;

    for (const firebaseUid of adminUidSet) {
      const user = await upsertUserByFirebaseUid(ctx, { firebaseUid });
      const existing = await ctx.db
        .query("clubMembers")
        .withIndex("by_club_user", (q) => q.eq("clubId", club._id).eq("userId", user._id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          role: "admin",
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("clubMembers", {
          clubId: club._id,
          userId: user._id,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        });
      }

      memberCount += 1;
    }

    for (const firebaseUid of staffUidSet) {
      if (adminUidSet.has(firebaseUid)) {
        continue;
      }

      const user = await upsertUserByFirebaseUid(ctx, { firebaseUid });
      const existing = await ctx.db
        .query("clubMembers")
        .withIndex("by_club_user", (q) => q.eq("clubId", club._id).eq("userId", user._id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          role: "staff",
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("clubMembers", {
          clubId: club._id,
          userId: user._id,
          role: "staff",
          createdAt: now,
          updatedAt: now,
        });
      }

      memberCount += 1;
    }

    return {
      clubSlug: club.slug,
      memberCount,
    };
  },
});
