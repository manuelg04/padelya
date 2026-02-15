import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "./constants";
import { isValidAlias, normalizeAlias, nowIso } from "./date_time";
import { requireIdentity, requireOrCreateUser } from "./auth";
import type { ReadCtx, SetMyAvatarArgs, UpdateAliasArgs, UserDoc, UserResponse, WriteCtx } from "./types";

async function toUserResponse(ctx: ReadCtx, user: UserDoc): Promise<UserResponse> {
  const avatarUrl = user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : null;
  return {
    id: String(user._id),
    firebaseUid: user.firebaseUid,
    phoneE164: user.phoneE164,
    alias: user.alias ?? null,
    avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function upsertUserHandler(ctx: WriteCtx): Promise<UserResponse> {
  const user = await requireOrCreateUser(ctx);
  return toUserResponse(ctx, user);
}

export async function updateAliasHandler(ctx: WriteCtx, args: UpdateAliasArgs): Promise<UserResponse> {
  if (!isValidAlias(args.alias)) {
    throw new Error("VALIDATION_ERROR");
  }

  const user = await requireOrCreateUser(ctx);
  const now = nowIso();

  await ctx.db.patch(user._id, {
    alias: normalizeAlias(args.alias),
    updatedAt: now,
  });

  const patched = await ctx.db.get(user._id);
  if (!patched) {
    throw new Error("NOT_FOUND");
  }

  return toUserResponse(ctx, patched);
}

function validateAvatarMetadata(metadata: { contentType?: string | null; size?: number }) {
  if (!metadata.contentType || !AVATAR_MIME_TYPES.has(metadata.contentType)) {
    throw new Error("VALIDATION_ERROR");
  }

  if (typeof metadata.size !== "number" || metadata.size <= 0 || metadata.size > AVATAR_MAX_BYTES) {
    throw new Error("VALIDATION_ERROR");
  }
}

async function deleteStorageObjectBestEffort(ctx: WriteCtx, storageId: SetMyAvatarArgs["storageId"]): Promise<void> {
  try {
    await ctx.storage.delete(storageId);
  } catch {
    return;
  }
}

export async function generateAvatarUploadUrlHandler(ctx: WriteCtx): Promise<string> {
  await requireOrCreateUser(ctx);
  return ctx.storage.generateUploadUrl();
}

export async function setMyAvatarHandler(ctx: WriteCtx, args: SetMyAvatarArgs): Promise<UserResponse> {
  await requireIdentity(ctx);
  const user = await requireOrCreateUser(ctx);

  const metadata = await ctx.storage.getMetadata(args.storageId);
  if (!metadata) {
    await deleteStorageObjectBestEffort(ctx, args.storageId);
    throw new Error("VALIDATION_ERROR");
  }
  try {
    validateAvatarMetadata({
      contentType: metadata.contentType,
      size: metadata.size,
    });
  } catch (error) {
    await deleteStorageObjectBestEffort(ctx, args.storageId);
    throw error;
  }

  const now = nowIso();
  const previousStorageId = user.avatarStorageId;
  await ctx.db.patch(user._id, {
    avatarStorageId: args.storageId,
    updatedAt: now,
  });

  if (previousStorageId && previousStorageId !== args.storageId) {
    await ctx.storage.delete(previousStorageId);
  }

  const patched = await ctx.db.get(user._id);
  if (!patched) {
    throw new Error("NOT_FOUND");
  }

  return toUserResponse(ctx, patched);
}

export async function removeMyAvatarHandler(ctx: WriteCtx): Promise<UserResponse> {
  await requireIdentity(ctx);
  const user = await requireOrCreateUser(ctx);

  if (user.avatarStorageId) {
    await ctx.storage.delete(user.avatarStorageId);
  }

  const now = nowIso();
  await ctx.db.patch(user._id, {
    avatarStorageId: undefined,
    updatedAt: now,
  });

  const patched = await ctx.db.get(user._id);
  if (!patched) {
    throw new Error("NOT_FOUND");
  }

  return toUserResponse(ctx, patched);
}
