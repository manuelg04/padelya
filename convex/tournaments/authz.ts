import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireUser } from "../padel/auth";

type ReadCtx = QueryCtx | MutationCtx;

export async function assertClubAdmin(
  ctx: ReadCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<void> {
  const membership = await ctx.db
    .query("clubMembers")
    .withIndex("by_club_user", (q) => q.eq("clubId", clubId).eq("userId", userId))
    .unique();

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  if (membership.role !== "admin" && membership.role !== "staff") {
    throw new Error("FORBIDDEN");
  }
}

export async function requireClubAdmin(ctx: ReadCtx, clubId: Id<"clubs">): Promise<Id<"users">> {
  const user = await requireUser(ctx);
  await assertClubAdmin(ctx, clubId, user._id);
  return user._id;
}
