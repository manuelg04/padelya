import { nowIso } from "./date_time";
import type { AuthIdentity, ReadCtx, UserDoc, WriteCtx } from "./types";

export async function findUserByFirebaseUid(ctx: ReadCtx, firebaseUid: string): Promise<UserDoc | null> {
  return ctx.db
    .query("users")
    .withIndex("by_firebase_uid", (q) => q.eq("firebaseUid", firebaseUid))
    .unique();
}

export async function upsertUserFromIdentity(ctx: WriteCtx, identity: AuthIdentity): Promise<UserDoc> {
  return upsertUserByFirebaseUid(ctx, {
    firebaseUid: identity.subject,
    phoneE164: identity.phoneNumber ?? "",
  });
}

export async function upsertUserByFirebaseUid(
  ctx: WriteCtx,
  input: { firebaseUid: string; phoneE164?: string },
): Promise<UserDoc> {
  const firebaseUid = input.firebaseUid;
  const phoneE164 = input.phoneE164 ?? "";
  const existing = await findUserByFirebaseUid(ctx, firebaseUid);

  if (existing) {
    const nextPhone = phoneE164 || existing.phoneE164;
    if (nextPhone !== existing.phoneE164) {
      await ctx.db.patch(existing._id, {
        phoneE164: nextPhone,
        updatedAt: nowIso(),
      });

      const patched = await ctx.db.get(existing._id);
      if (!patched) {
        throw new Error("NOT_FOUND");
      }
      return patched;
    }

    return existing;
  }

  const now = nowIso();
  const id = await ctx.db.insert("users", {
    firebaseUid,
    phoneE164,
    createdAt: now,
    updatedAt: now,
  });

  const user = await ctx.db.get(id);
  if (!user) {
    throw new Error("NOT_FOUND");
  }

  return user;
}

export async function getRequiredIdentity(ctx: ReadCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new Error("UNAUTHORIZED");
  }

  return identity;
}

export async function getAuthenticatedUser(ctx: ReadCtx): Promise<UserDoc> {
  const identity = await getRequiredIdentity(ctx);

  const user = await findUserByFirebaseUid(ctx, identity.subject);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
