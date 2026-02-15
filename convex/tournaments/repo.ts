import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export type RegistrationStatus = "pending" | "confirmed" | "waitlist" | "cancelled";

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
