import { findUserByFirebaseUid, getRequiredIdentity, upsertUserFromIdentity } from "./users_repo";
import type { AuthIdentity, ReadCtx, UserDoc, UserId, WriteCtx } from "./types";

export async function requireIdentity(ctx: ReadCtx): Promise<AuthIdentity> {
  return getRequiredIdentity(ctx);
}

export async function getOptionalUser(ctx: ReadCtx): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    return null;
  }

  return findUserByFirebaseUid(ctx, identity.subject);
}

export async function requireUser(ctx: ReadCtx): Promise<UserDoc> {
  const identity = await requireIdentity(ctx);
  const user = await findUserByFirebaseUid(ctx, identity.subject);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export async function requireOrCreateUser(ctx: WriteCtx): Promise<UserDoc> {
  const identity = await requireIdentity(ctx);
  return upsertUserFromIdentity(ctx, identity);
}

export async function requireUserId(ctx: ReadCtx): Promise<UserId> {
  const user = await requireUser(ctx);
  return user._id;
}
