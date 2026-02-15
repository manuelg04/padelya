import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export type RegistrationStatus = "pending" | "confirmed" | "waitlist" | "cancelled";
export type TournamentMatchPhase = "group";

export async function getClubBySlug(ctx: ReadCtx, slug: string): Promise<Doc<"clubs"> | null> {
  return ctx.db
    .query("clubs")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export async function getTournamentBySlug(ctx: ReadCtx, slug: string): Promise<Doc<"tournaments"> | null> {
  return ctx.db
    .query("tournaments")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export async function listTournamentCategories(
  ctx: ReadCtx,
  tournamentId: Id<"tournaments">,
): Promise<Doc<"tournamentCategories">[]> {
  return ctx.db
    .query("tournamentCategories")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
    .collect();
}

export async function getTournamentCategoryBySlug(
  ctx: ReadCtx,
  tournamentId: Id<"tournaments">,
  slug: string,
): Promise<Doc<"tournamentCategories"> | null> {
  return ctx.db
    .query("tournamentCategories")
    .withIndex("by_tournament_slug", (q) => q.eq("tournamentId", tournamentId).eq("slug", slug))
    .unique();
}

export async function listRegistrationsByCategory(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
): Promise<Doc<"tournamentRegistrations">[]> {
  const pending = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", "pending"))
    .collect();
  const confirmed = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", "confirmed"))
    .collect();
  const waitlist = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", "waitlist"))
    .collect();
  const cancelled = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", "cancelled"))
    .collect();

  return [...pending, ...confirmed, ...waitlist, ...cancelled].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listRegistrationsByCategoryStatus(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  status: RegistrationStatus,
): Promise<Doc<"tournamentRegistrations">[]> {
  return ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", status))
    .collect();
}

export async function listConfirmedRegistrationsByCategory(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
): Promise<Doc<"tournamentRegistrations">[]> {
  return listRegistrationsByCategoryStatus(ctx, categoryId, "confirmed");
}

export async function countRegistrationsByStatus(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  status: RegistrationStatus,
): Promise<number> {
  const rows = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_status", (q) => q.eq("categoryId", categoryId).eq("status", status))
    .collect();
  return rows.length;
}

export async function countActiveOccupyingSpots(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
): Promise<number> {
  const [pending, confirmed] = await Promise.all([
    countRegistrationsByStatus(ctx, categoryId, "pending"),
    countRegistrationsByStatus(ctx, categoryId, "confirmed"),
  ]);
  return pending + confirmed;
}

export async function findActiveRegistrationForPrimary(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  primaryUserId: Id<"users">,
): Promise<Doc<"tournamentRegistrations"> | null> {
  const rows = await ctx.db
    .query("tournamentRegistrations")
    .withIndex("by_category_primary", (q) => q.eq("categoryId", categoryId).eq("primaryUserId", primaryUserId))
    .collect();

  const active = rows.find((row) => row.status === "pending" || row.status === "confirmed" || row.status === "waitlist");
  return active ?? null;
}

export async function listClubMembershipsForUser(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Doc<"clubMembers">[]> {
  return ctx.db
    .query("clubMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export async function getTeamById(
  ctx: ReadCtx,
  teamId: Id<"tournamentTeams">,
): Promise<Doc<"tournamentTeams"> | null> {
  return ctx.db.get(teamId);
}

export async function listTournamentGroupsByCategory(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
): Promise<Doc<"tournamentGroups">[]> {
  const rows = await ctx.db
    .query("tournamentGroups")
    .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

export async function getTournamentGroupByCategoryName(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  name: string,
): Promise<Doc<"tournamentGroups"> | null> {
  return ctx.db
    .query("tournamentGroups")
    .withIndex("by_category_name", (q) => q.eq("categoryId", categoryId).eq("name", name))
    .unique();
}

export async function listTournamentMatchesByCategoryPhase(
  ctx: ReadCtx,
  categoryId: Id<"tournamentCategories">,
  phase: TournamentMatchPhase,
): Promise<Doc<"tournamentMatches">[]> {
  const rows = await ctx.db
    .query("tournamentMatches")
    .withIndex("by_category_phase", (q) => q.eq("categoryId", categoryId).eq("phase", phase))
    .collect();

  return rows.sort((a, b) => {
    if (a.groupId !== b.groupId) {
      return String(a.groupId).localeCompare(String(b.groupId));
    }
    return a.order - b.order;
  });
}

export async function listTournamentMatchesByGroup(
  ctx: ReadCtx,
  groupId: Id<"tournamentGroups">,
): Promise<Doc<"tournamentMatches">[]> {
  const rows = await ctx.db
    .query("tournamentMatches")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}
