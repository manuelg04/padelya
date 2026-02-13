import { isValidAlias, normalizeAlias, nowIso } from "./date_time";
import { ensureUser } from "./users_repo";
import type { ActorArgs, UpdateAliasArgs, UserDoc, UserResponse, WriteCtx } from "./types";

function toUserResponse(user: UserDoc): UserResponse {
  return {
    id: String(user._id),
    firebaseUid: user.firebaseUid,
    phoneE164: user.phoneE164,
    alias: user.alias ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function upsertUserHandler(ctx: WriteCtx, args: ActorArgs): Promise<UserResponse> {
  const user = await ensureUser(ctx, args.actor);
  return toUserResponse(user);
}

export async function updateAliasHandler(ctx: WriteCtx, args: UpdateAliasArgs): Promise<UserResponse> {
  if (!isValidAlias(args.alias)) {
    throw new Error("VALIDATION_ERROR");
  }

  const user = await ensureUser(ctx, args.actor);
  const now = nowIso();

  await ctx.db.patch(user._id, {
    alias: normalizeAlias(args.alias),
    updatedAt: now,
  });

  const patched = await ctx.db.get(user._id);
  if (!patched) {
    throw new Error("NOT_FOUND");
  }

  return toUserResponse(patched);
}
