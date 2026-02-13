import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  cancelHandler,
  createMatchHandler,
  followMatchWatchHandler,
  getMatchHandler,
  joinHandler,
  leaveHandler,
  listHomeHandler,
  listMineHandler,
  listOpenFeedHandler,
  unfollowMatchWatchHandler,
} from "./padel/handlers_matches";
import {
  listNotificationsForActorHandler,
  listNotificationsForMeHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  unreadNotificationsCountHandler,
} from "./padel/handlers_notifications";
import {
  generateAvatarUploadUrlHandler,
  removeMyAvatarHandler,
  setMyAvatarHandler,
  updateAliasHandler,
  upsertUserHandler,
} from "./padel/handlers_users";
import { actorValidator, createMatchInputValidator, modalityValidator, openWindowValidator } from "./padel/validators";

export const upsertUser = mutation({
  args: {
    actor: actorValidator,
  },
  handler: (ctx, args) => upsertUserHandler(ctx, args),
});

export const updateAlias = mutation({
  args: {
    actor: actorValidator,
    alias: v.string(),
  },
  handler: (ctx, args) => updateAliasHandler(ctx, args),
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: (ctx) => generateAvatarUploadUrlHandler(ctx),
});

export const setMyAvatar = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: (ctx, args) => setMyAvatarHandler(ctx, args),
});

export const removeMyAvatar = mutation({
  args: {},
  handler: (ctx) => removeMyAvatarHandler(ctx),
});

export const createMatch = mutation({
  args: {
    actor: actorValidator,
    input: createMatchInputValidator,
    timezone: v.optional(v.string()),
  },
  handler: (ctx, args) => createMatchHandler(ctx, args),
});

export const listHome = query({
  args: {
    actor: v.optional(actorValidator),
  },
  handler: (ctx, args) => listHomeHandler(ctx, args),
});

export const listMine = query({
  args: {
    actor: actorValidator,
  },
  handler: (ctx, args) => listMineHandler(ctx, args),
});

export const listOpenFeed = query({
  args: {
    modality: v.optional(modalityValidator),
    window: openWindowValidator,
    nowIso: v.optional(v.string()),
  },
  handler: (ctx, args) => listOpenFeedHandler(ctx, args),
});

export const getMatch = query({
  args: {
    publicId: v.string(),
    actor: v.optional(actorValidator),
  },
  handler: (ctx, args) => getMatchHandler(ctx, args),
});

export const followMatchWatch = mutation({
  args: {
    publicId: v.string(),
    actor: actorValidator,
  },
  handler: (ctx, args) => followMatchWatchHandler(ctx, args),
});

export const unfollowMatchWatch = mutation({
  args: {
    publicId: v.string(),
    actor: actorValidator,
  },
  handler: (ctx, args) => unfollowMatchWatchHandler(ctx, args),
});

export const join = mutation({
  args: {
    publicId: v.string(),
    actor: actorValidator,
  },
  handler: (ctx, args) => joinHandler(ctx, args),
});

export const leave = mutation({
  args: {
    publicId: v.string(),
    actor: actorValidator,
  },
  handler: (ctx, args) => leaveHandler(ctx, args),
});

export const cancel = mutation({
  args: {
    publicId: v.string(),
    actor: actorValidator,
  },
  handler: (ctx, args) => cancelHandler(ctx, args),
});

export const listNotificationsForMe = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listNotificationsForMeHandler(ctx, args),
});

export const listNotificationsForActor = query({
  args: {
    actor: actorValidator,
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listNotificationsForActorHandler(ctx, args),
});

export const unreadNotificationsCount = query({
  args: {},
  handler: (ctx) => unreadNotificationsCountHandler(ctx),
});

export const markNotificationRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: (ctx, args) => markNotificationReadHandler(ctx, args),
});

export const markAllNotificationsRead = mutation({
  args: {},
  handler: (ctx) => markAllNotificationsReadHandler(ctx),
});
