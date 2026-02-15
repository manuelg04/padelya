import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
  listNotificationsForMeHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  unreadNotificationsCountHandler,
} from "./padel/handlers_notifications";
import {
  disablePushSubscriptionByEndpointHandler,
  getPushSubscriptionStateHandler,
  listActivePushSubscriptionsForRecipientsHandler,
  removePushSubscriptionHandler,
  upsertPushSubscriptionHandler,
} from "./padel/handlers_push";
import {
  generateAvatarUploadUrlHandler,
  removeMyAvatarHandler,
  setMyAvatarHandler,
  updateAliasHandler,
  upsertUserHandler,
} from "./padel/handlers_users";
import { createMatchInputValidator, modalityValidator, openWindowValidator } from "./padel/validators";

export const upsertUser = mutation({
  args: {},
  handler: (ctx) => upsertUserHandler(ctx),
});

export const updateAlias = mutation({
  args: {
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
    input: createMatchInputValidator,
    timezone: v.optional(v.string()),
  },
  handler: (ctx, args) => createMatchHandler(ctx, args),
});

export const listHome = query({
  args: {},
  handler: (ctx) => listHomeHandler(ctx),
});

export const listMine = query({
  args: {},
  handler: (ctx) => listMineHandler(ctx),
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
  },
  handler: (ctx, args) => getMatchHandler(ctx, args),
});

export const followMatchWatch = mutation({
  args: {
    publicId: v.string(),
  },
  handler: (ctx, args) => followMatchWatchHandler(ctx, args),
});

export const unfollowMatchWatch = mutation({
  args: {
    publicId: v.string(),
  },
  handler: (ctx, args) => unfollowMatchWatchHandler(ctx, args),
});

export const join = mutation({
  args: {
    publicId: v.string(),
  },
  handler: (ctx, args) => joinHandler(ctx, args),
});

export const leave = mutation({
  args: {
    publicId: v.string(),
  },
  handler: (ctx, args) => leaveHandler(ctx, args),
});

export const cancel = mutation({
  args: {
    publicId: v.string(),
  },
  handler: (ctx, args) => cancelHandler(ctx, args),
});

export const listNotificationsForMe = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listNotificationsForMeHandler(ctx, args),
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

export const getPushSubscriptionState = query({
  args: {},
  handler: (ctx) => getPushSubscriptionStateHandler(ctx),
});

export const upsertPushSubscription = mutation({
  args: {
    subscription: v.object({
      endpoint: v.string(),
      keys: v.object({
        p256dh: v.string(),
        auth: v.string(),
      }),
      expirationTime: v.union(v.number(), v.null()),
    }),
  },
  handler: (ctx, args) => upsertPushSubscriptionHandler(ctx, args),
});

export const removePushSubscription = mutation({
  args: {
    endpoint: v.optional(v.string()),
    all: v.optional(v.boolean()),
  },
  handler: (ctx, args) => removePushSubscriptionHandler(ctx, args),
});

export const listActivePushSubscriptionsForRecipients = internalQuery({
  args: {
    recipientUserIds: v.array(v.id("users")),
  },
  handler: (ctx, args) => listActivePushSubscriptionsForRecipientsHandler(ctx, args),
});

export const disablePushSubscriptionByEndpoint = internalMutation({
  args: {
    endpoint: v.string(),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => disablePushSubscriptionByEndpointHandler(ctx, args),
});
