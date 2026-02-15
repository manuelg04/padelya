import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
  getTournamentGroupByCategoryName,
  listClubMembershipsForUser,
  listConfirmedRegistrationsByCategory,
  listRegistrationsByCategory,
  listTournamentCategories,
  listTournamentGroupsByCategory,
  listTournamentMatchesByCategoryPhase,
} from "./tournaments/repo";
import { makeUniqueSlug, slugify } from "./tournaments/slugs";

type ReadCtx = QueryCtx | MutationCtx;

type TournamentTeamView = {
  id: string;
  teamName: string;
  primaryAlias: string | null;
  primaryPhone: string | null;
};

type TournamentTeamWithMeta = TournamentTeamView & {
  createdAt: string;
};

type TournamentSetScore = {
  teamAGames: number;
  teamBGames: number;
};

type TournamentStandingRow = {
  team: TournamentTeamView;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  setDiff: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  qualified: boolean;
};

const GROUP_MATCH_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
] as const;

const ALLOWED_GROUP_TEAM_COUNTS = new Set([8, 12, 16]);
const MATCH_RESULT_SET_VALIDATOR = v.object({
  teamAGames: v.number(),
  teamBGames: v.number(),
});

function ensureNonEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("VALIDATION_ERROR");
  }
  return trimmed;
}

function ensurePositiveInteger(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("VALIDATION_ERROR");
  }
  return value;
}

function ensureNonNegativeInteger(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("VALIDATION_ERROR");
  }
  return value;
}

function groupLabelForOrder(order: number): string {
  if (!Number.isInteger(order) || order < 1 || order > 26) {
    throw new Error("VALIDATION_ERROR");
  }
  return String.fromCharCode("A".charCodeAt(0) + order - 1);
}

function shuffleInPlace<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const next = values[index];
    values[index] = values[randomIndex] as T;
    values[randomIndex] = next as T;
  }
  return values;
}

function buildRandomGroups(teamIds: Id<"tournamentTeams">[], groupCount: number): Id<"tournamentTeams">[][] {
  const shuffled = shuffleInPlace([...teamIds]);
  const groups: Id<"tournamentTeams">[][] = Array.from({ length: groupCount }, () => []);

  shuffled.forEach((teamId, index) => {
    groups[index % groupCount]?.push(teamId);
  });

  if (groups.some((group) => group.length !== 4)) {
    throw new Error("VALIDATION_ERROR");
  }

  return groups;
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

async function isCategoryFrozen(ctx: ReadCtx, categoryId: Id<"tournamentCategories">): Promise<boolean> {
  const groups = await listTournamentGroupsByCategory(ctx, categoryId);
  return groups.length > 0;
}

async function assertCategoryNotFrozen(ctx: ReadCtx, categoryId: Id<"tournamentCategories">): Promise<void> {
  if (await isCategoryFrozen(ctx, categoryId)) {
    throw new Error("TOURNAMENT_CATEGORY_FROZEN");
  }
}

function validateAndNormalizeReportedResult(input: {
  teamAId: Id<"tournamentTeams">;
  teamBId: Id<"tournamentTeams">;
  winnerTeamId: Id<"tournamentTeams">;
  sets: TournamentSetScore[];
}): TournamentSetScore[] {
  if (input.winnerTeamId !== input.teamAId && input.winnerTeamId !== input.teamBId) {
    throw new Error("VALIDATION_ERROR");
  }

  if (input.sets.length < 2 || input.sets.length > 3) {
    throw new Error("VALIDATION_ERROR");
  }

  let teamASetsWon = 0;
  let teamBSetsWon = 0;
  const normalized = input.sets.map((set) => {
    const teamAGames = ensureNonNegativeInteger(set.teamAGames);
    const teamBGames = ensureNonNegativeInteger(set.teamBGames);

    if (teamAGames === teamBGames) {
      throw new Error("VALIDATION_ERROR");
    }

    if (teamAGames > teamBGames) {
      teamASetsWon += 1;
    } else {
      teamBSetsWon += 1;
    }

    return {
      teamAGames,
      teamBGames,
    };
  });

  const winnerSetsWon = input.winnerTeamId === input.teamAId ? teamASetsWon : teamBSetsWon;
  if (winnerSetsWon !== 2) {
    throw new Error("VALIDATION_ERROR");
  }

  return normalized;
}

function buildMatchResultView(match: {
  status: "pending" | "completed";
  winnerTeamId?: Id<"tournamentTeams">;
  sets?: TournamentSetScore[];
}): {
  winnerTeamId: string;
  sets: TournamentSetScore[];
} | null {
  if (match.status !== "completed") {
    return null;
  }

  if (!match.winnerTeamId || !match.sets || match.sets.length === 0) {
    return null;
  }

  return {
    winnerTeamId: String(match.winnerTeamId),
    sets: match.sets.map((set) => ({
      teamAGames: set.teamAGames,
      teamBGames: set.teamBGames,
    })),
  };
}

function toTeamView(team: TournamentTeamWithMeta): TournamentTeamView {
  return {
    id: team.id,
    teamName: team.teamName,
    primaryAlias: team.primaryAlias,
    primaryPhone: team.primaryPhone,
  };
}

function hasSameStandingMetrics(a: TournamentStandingRow, b: TournamentStandingRow): boolean {
  return a.wins === b.wins && a.setDiff === b.setDiff && a.gameDiff === b.gameDiff;
}

function sortStandingRows(rows: TournamentStandingRow[], createdAtByTeamId: Map<string, string>): TournamentStandingRow[] {
  rows.sort((a, b) => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    if (a.setDiff !== b.setDiff) {
      return b.setDiff - a.setDiff;
    }
    if (a.gameDiff !== b.gameDiff) {
      return b.gameDiff - a.gameDiff;
    }

    const aCreatedAt = createdAtByTeamId.get(a.team.id) ?? "";
    const bCreatedAt = createdAtByTeamId.get(b.team.id) ?? "";
    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt.localeCompare(bCreatedAt);
    }

    return a.team.id.localeCompare(b.team.id);
  });

  return rows;
}

function hasUnresolvedTieAtQualificationCutoff(rows: TournamentStandingRow[]): boolean {
  if (rows.length <= 2) {
    return false;
  }

  const cutoffRow = rows[1];
  if (!cutoffRow) {
    return false;
  }

  const bucketStart = rows.findIndex((row) => hasSameStandingMetrics(row, cutoffRow));
  if (bucketStart < 0) {
    return false;
  }

  let bucketEnd = bucketStart;
  while (bucketEnd + 1 < rows.length && hasSameStandingMetrics(rows[bucketEnd + 1]!, cutoffRow)) {
    bucketEnd += 1;
  }

  const bucketSize = bucketEnd - bucketStart + 1;
  const slotsAtCutoff = 2 - bucketStart;
  return slotsAtCutoff < bucketSize;
}

async function buildTeamViewsById(
  ctx: ReadCtx,
  teamIds: Id<"tournamentTeams">[],
): Promise<Map<Id<"tournamentTeams">, TournamentTeamWithMeta>> {
  const uniqueTeamIds = [...new Set(teamIds)];

  const pairs = await Promise.all(
    uniqueTeamIds.map(async (teamId) => {
      const team = await getTeamById(ctx, teamId);
      if (!team) {
        return null;
      }
      const primary = await ctx.db.get(team.primaryUserId);
      return [
        teamId,
        {
          id: String(team._id),
          teamName: team.teamName,
          primaryAlias: primary?.alias ?? null,
          primaryPhone: primary?.phoneE164 ?? null,
          createdAt: team.createdAt,
        },
      ] as const;
    }),
  );

  return new Map(
    pairs.filter((entry): entry is readonly [Id<"tournamentTeams">, TournamentTeamWithMeta] => Boolean(entry)),
  );
}

async function buildCategoryGroupStage(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  myTeamId?: Id<"tournamentTeams">,
) {
  const groups = await listTournamentGroupsByCategory(ctx, categoryId);
  if (groups.length === 0) {
    return {
      groupStage: null,
      myGroupMatches: [] as Array<{
        id: string;
        groupName: string;
        order: number;
        teamA: TournamentTeamView;
        teamB: TournamentTeamView;
        status: "pending" | "completed";
        result: {
          winnerTeamId: string;
          sets: TournamentSetScore[];
        } | null;
      }>,
    };
  }

  const matches = await listTournamentMatchesByCategoryPhase(ctx, categoryId, "group");
  const teamIds = groups.flatMap((group) => group.teamIds);
  const matchTeamIds = matches.flatMap((match) => [match.teamAId, match.teamBId]);
  const teamViews = await buildTeamViewsById(ctx, [...teamIds, ...matchTeamIds]);

  const groupViews = groups.map((group) => ({
    id: String(group._id),
    name: group.name,
    order: group.order,
    teams: group.teamIds
      .map((teamId) => {
        const team = teamViews.get(teamId);
        if (!team) {
          return null;
        }
        return {
          id: team.id,
          teamName: team.teamName,
          primaryAlias: team.primaryAlias,
          primaryPhone: team.primaryPhone,
        };
      })
      .filter((team): team is TournamentTeamView => Boolean(team)),
  }));

  const teamCreatedAtByTeamId = new Map(
    [...teamViews.values()].map((team) => [team.id, team.createdAt] as const),
  );

  const groupNameById = new Map(groups.map((group) => [group._id, group.name] as const));

  const myGroupMatches = matches
    .filter((match) => myTeamId && (match.teamAId === myTeamId || match.teamBId === myTeamId))
    .map((match) => {
      const teamA = teamViews.get(match.teamAId);
      const teamB = teamViews.get(match.teamBId);
      if (!teamA || !teamB) {
        return null;
      }
      return {
        id: String(match._id),
        groupName: groupNameById.get(match.groupId) ?? "",
        order: match.order,
        teamA: toTeamView(teamA),
        teamB: toTeamView(teamB),
        status: match.status,
        result: buildMatchResultView(match),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        groupName: string;
        order: number;
        teamA: TournamentTeamView;
        teamB: TournamentTeamView;
        status: "pending" | "completed";
        result: {
          winnerTeamId: string;
          sets: TournamentSetScore[];
        } | null;
      } => Boolean(entry),
    );

  const matchesByGroup = groups.map((group) => {
    const groupMatches = matches
      .filter((match) => match.groupId === group._id)
      .map((match) => {
        const teamA = teamViews.get(match.teamAId);
        const teamB = teamViews.get(match.teamBId);
        if (!teamA || !teamB) {
          return null;
        }
        return {
          id: String(match._id),
          order: match.order,
          status: match.status,
          teamA: toTeamView(teamA),
          teamB: toTeamView(teamB),
          result: buildMatchResultView(match),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          id: string;
          order: number;
          status: "pending" | "completed";
          teamA: TournamentTeamView;
          teamB: TournamentTeamView;
          result: {
            winnerTeamId: string;
            sets: TournamentSetScore[];
          } | null;
        } => Boolean(entry),
      );

    return {
      groupId: String(group._id),
      groupName: group.name,
      matches: groupMatches,
    };
  });

  const standingsByGroup = groups.map((group) => {
    const teamRows = group.teamIds
      .map((teamId) => {
        const team = teamViews.get(teamId);
        if (!team) {
          return null;
        }
        return {
          teamId,
          row: {
            team: {
              id: team.id,
              teamName: team.teamName,
              primaryAlias: team.primaryAlias,
              primaryPhone: team.primaryPhone,
            },
            played: 0,
            wins: 0,
            losses: 0,
            setsFor: 0,
            setsAgainst: 0,
            setDiff: 0,
            gamesFor: 0,
            gamesAgainst: 0,
            gameDiff: 0,
            qualified: false,
          } as TournamentStandingRow,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const standingByTeamId = new Map(
      teamRows.map((entry) => [entry.teamId, entry.row] as const),
    );

    const groupMatches = matches.filter((match) => match.groupId === group._id && match.status === "completed");
    for (const match of groupMatches) {
      if (!match.winnerTeamId || !match.sets || match.sets.length === 0) {
        continue;
      }

      const teamAStats = standingByTeamId.get(match.teamAId);
      const teamBStats = standingByTeamId.get(match.teamBId);
      if (!teamAStats || !teamBStats) {
        continue;
      }

      teamAStats.played += 1;
      teamBStats.played += 1;

      if (match.winnerTeamId === match.teamAId) {
        teamAStats.wins += 1;
        teamBStats.losses += 1;
      } else if (match.winnerTeamId === match.teamBId) {
        teamBStats.wins += 1;
        teamAStats.losses += 1;
      } else {
        continue;
      }

      for (const set of match.sets) {
        const teamAGames = ensureNonNegativeInteger(set.teamAGames);
        const teamBGames = ensureNonNegativeInteger(set.teamBGames);

        teamAStats.gamesFor += teamAGames;
        teamAStats.gamesAgainst += teamBGames;
        teamBStats.gamesFor += teamBGames;
        teamBStats.gamesAgainst += teamAGames;

        if (teamAGames > teamBGames) {
          teamAStats.setsFor += 1;
          teamAStats.setsAgainst += 0;
          teamBStats.setsFor += 0;
          teamBStats.setsAgainst += 1;
        } else if (teamBGames > teamAGames) {
          teamBStats.setsFor += 1;
          teamBStats.setsAgainst += 0;
          teamAStats.setsFor += 0;
          teamAStats.setsAgainst += 1;
        }
      }
    }

    const rows = sortStandingRows(
      [...standingByTeamId.values()].map((row) => ({
        ...row,
        setDiff: row.setsFor - row.setsAgainst,
        gameDiff: row.gamesFor - row.gamesAgainst,
      })),
      teamCreatedAtByTeamId,
    ).map((row, index) => ({
      ...row,
      qualified: index < 2,
    }));

    return {
      groupId: String(group._id),
      groupName: group.name,
      rows,
      hasUnresolvedTieAtQualificationCutoff: hasUnresolvedTieAtQualificationCutoff(rows),
    };
  });

  const qualifiedTeams = groups.flatMap((group) => {
    const groupStandings = standingsByGroup.find((entry) => entry.groupId === String(group._id));
    if (!groupStandings) {
      return [];
    }

    return groupStandings.rows
      .filter((row) => row.qualified)
      .slice(0, 2)
      .map((row, index) => ({
        groupId: String(group._id),
        groupName: group.name,
        position: index + 1,
        team: row.team,
      }));
  });

  return {
    groupStage: {
      generatedAt: groups[0]?.createdAt ?? nowIso(),
      groups: groupViews,
      matchesByGroup,
      standingsByGroup,
      qualifiedTeams,
    },
    myGroupMatches,
  };
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
    let myTeamId: Id<"tournamentTeams"> | undefined;

    if (user) {
      const active = await findActiveRegistrationForPrimary(ctx, category._id, user._id);
      if (active) {
        const team = await getTeamById(ctx, active.teamId);
        if (team) {
          myTeamId = team._id;
        }
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

    const stage = await buildCategoryGroupStage(ctx, category._id, myTeamId);

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
      groupStage: stage.groupStage,
      myGroupMatches: stage.myGroupMatches,
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

export const generateCategoryGroups = mutation({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
    groupCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);
    if (await isCategoryFrozen(ctx, category._id)) {
      throw new Error("VALIDATION_ERROR");
    }

    const confirmed = await listConfirmedRegistrationsByCategory(ctx, category._id);
    const teamIds = confirmed.map((registration) => registration.teamId);

    if (!ALLOWED_GROUP_TEAM_COUNTS.has(teamIds.length)) {
      throw new Error("VALIDATION_ERROR");
    }

    const defaultGroupCount = teamIds.length / 4;
    const groupCount = args.groupCount === undefined ? defaultGroupCount : ensurePositiveInteger(args.groupCount);

    if (groupCount !== defaultGroupCount) {
      throw new Error("VALIDATION_ERROR");
    }

    const groups = buildRandomGroups(teamIds, groupCount);
    const now = nowIso();

    await Promise.all(
      groups.map(async (teamGroup, index) => {
        await ctx.db.insert("tournamentGroups", {
          tournamentId: tournament._id,
          categoryId: category._id,
          name: groupLabelForOrder(index + 1),
          order: index + 1,
          teamIds: teamGroup,
          createdByUserId: actor._id,
          createdAt: now,
          updatedAt: now,
        });
      }),
    );

    return {
      groupCount,
      teamsCount: teamIds.length,
    };
  },
});

export const moveCategoryTeamToGroup = mutation({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
    teamId: v.id("tournamentTeams"),
    targetGroupName: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);
    const groups = await listTournamentGroupsByCategory(ctx, category._id);
    if (groups.length === 0) {
      throw new Error("VALIDATION_ERROR");
    }

    const matches = await listTournamentMatchesByCategoryPhase(ctx, category._id, "group");
    if (matches.length > 0) {
      throw new Error("VALIDATION_ERROR");
    }

    const normalizedTargetName = ensureNonEmpty(args.targetGroupName).toUpperCase();
    const target = await getTournamentGroupByCategoryName(ctx, category._id, normalizedTargetName);
    if (!target) {
      throw new Error("NOT_FOUND");
    }

    const source = groups.find((group) => group.teamIds.some((teamId) => teamId === args.teamId));
    if (!source) {
      throw new Error("VALIDATION_ERROR");
    }

    if (source._id === target._id) {
      return { ok: true };
    }

    const now = nowIso();

    if (target.teamIds.length >= 4) {
      const replacementTeamId = target.teamIds[0];
      if (!replacementTeamId) {
        throw new Error("VALIDATION_ERROR");
      }

      await ctx.db.patch(source._id, {
        teamIds: [...source.teamIds.filter((teamId) => teamId !== args.teamId), replacementTeamId],
        updatedAt: now,
      });

      await ctx.db.patch(target._id, {
        teamIds: [...target.teamIds.filter((teamId) => teamId !== replacementTeamId), args.teamId],
        updatedAt: now,
      });
      return { ok: true };
    }

    await ctx.db.patch(source._id, {
      teamIds: source.teamIds.filter((teamId) => teamId !== args.teamId),
      updatedAt: now,
    });

    await ctx.db.patch(target._id, {
      teamIds: [...target.teamIds, args.teamId],
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const generateCategoryGroupMatches = mutation({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);
    const groups = await listTournamentGroupsByCategory(ctx, category._id);
    if (groups.length === 0) {
      throw new Error("VALIDATION_ERROR");
    }

    const existingMatches = await listTournamentMatchesByCategoryPhase(ctx, category._id, "group");
    if (existingMatches.length > 0) {
      throw new Error("VALIDATION_ERROR");
    }

    if (groups.some((group) => group.teamIds.length !== 4)) {
      throw new Error("VALIDATION_ERROR");
    }

    const now = nowIso();

    await Promise.all(
      groups.map(async (group) => {
        await Promise.all(
          GROUP_MATCH_PAIRS.map(async ([teamAIndex, teamBIndex], orderIndex) => {
            const teamAId = group.teamIds[teamAIndex];
            const teamBId = group.teamIds[teamBIndex];
            if (!teamAId || !teamBId) {
              throw new Error("VALIDATION_ERROR");
            }

            await ctx.db.insert("tournamentMatches", {
              tournamentId: tournament._id,
              categoryId: category._id,
              phase: "group",
              groupId: group._id,
              order: orderIndex + 1,
              teamAId,
              teamBId,
              status: "pending",
              createdByUserId: actor._id,
              createdAt: now,
              updatedAt: now,
            });
          }),
        );
      }),
    );

    return {
      groupsCount: groups.length,
      matchesCount: groups.length * GROUP_MATCH_PAIRS.length,
    };
  },
});

export const reportCategoryGroupMatchResult = mutation({
  args: {
    tournamentSlug: v.string(),
    categorySlug: v.string(),
    matchId: v.id("tournamentMatches"),
    winnerTeamId: v.id("tournamentTeams"),
    sets: v.array(MATCH_RESULT_SET_VALIDATOR),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const tournament = await requireTournamentBySlugOrThrow(args.tournamentSlug, ctx);
    const club = await ctx.db.get(tournament.clubId);
    if (!club) {
      throw new Error("NOT_FOUND");
    }

    await assertClubAdmin(ctx, club._id, actor._id);

    const category = await requireCategoryBySlugOrThrow(ctx, tournament._id, args.categorySlug);

    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error("NOT_FOUND");
    }

    if (
      match.tournamentId !== tournament._id ||
      match.categoryId !== category._id ||
      match.phase !== "group"
    ) {
      throw new Error("NOT_FOUND");
    }

    const normalizedSets = validateAndNormalizeReportedResult({
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerTeamId: args.winnerTeamId,
      sets: args.sets,
    });

    const now = nowIso();
    await ctx.db.patch(match._id, {
      status: "completed",
      winnerTeamId: args.winnerTeamId,
      sets: normalizedSets,
      reportedAt: now,
      reportedByUserId: actor._id,
      updatedAt: now,
    });

    return {
      matchId: String(match._id),
      status: "completed" as const,
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
    await assertCategoryNotFrozen(ctx, category._id);

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

    await assertCategoryNotFrozen(ctx, registration.categoryId);

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

    await assertCategoryNotFrozen(ctx, category._id);

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
