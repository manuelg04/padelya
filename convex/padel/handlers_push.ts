import { nowIso } from "./date_time";
import { requireOrCreateUser, requireUser } from "./auth";
import type {
  ActivePushSubscriptionRecord,
  ListActivePushSubscriptionsArgs,
  PushSubscriptionDoc,
  PushSubscriptionState,
  ReadCtx,
  RemovePushSubscriptionArgs,
  UpsertPushSubscriptionArgs,
  UserId,
  WriteCtx,
} from "./types";

async function listActiveSubscriptionsByUser(ctx: ReadCtx, userId: UserId): Promise<PushSubscriptionDoc[]> {
  return ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("isActive", true))
    .collect();
}

function toPushSubscriptionState(rows: PushSubscriptionDoc[]): PushSubscriptionState {
  const latestUpdatedAt =
    rows.length > 0 ? rows.reduce((current, row) => (row.updatedAt > current ? row.updatedAt : current), rows[0].updatedAt) : null;

  return {
    enabled: rows.length > 0,
    activeCount: rows.length,
    updatedAt: latestUpdatedAt,
  };
}

async function getPushSubscriptionStateByUser(ctx: ReadCtx, userId: UserId): Promise<PushSubscriptionState> {
  const rows = await listActiveSubscriptionsByUser(ctx, userId);
  return toPushSubscriptionState(rows);
}

function ensureValidSubscription(input: UpsertPushSubscriptionArgs["subscription"]) {
  const endpoint = input.endpoint.trim();
  const p256dh = input.keys.p256dh.trim();
  const auth = input.keys.auth.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("VALIDATION_ERROR");
  }
}

export async function getPushSubscriptionStateHandler(ctx: ReadCtx): Promise<PushSubscriptionState> {
  const user = await requireUser(ctx);
  return getPushSubscriptionStateByUser(ctx, user._id);
}

export async function upsertPushSubscriptionHandler(
  ctx: WriteCtx,
  args: UpsertPushSubscriptionArgs,
): Promise<PushSubscriptionState> {
  ensureValidSubscription(args.subscription);

  const user = await requireOrCreateUser(ctx);
  const now = nowIso();
  const endpoint = args.subscription.endpoint.trim();

  const existing = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user_endpoint", (q) => q.eq("userId", user._id).eq("endpoint", endpoint))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      endpoint,
      p256dh: args.subscription.keys.p256dh.trim(),
      auth: args.subscription.keys.auth.trim(),
      expirationTime: args.subscription.expirationTime ?? undefined,
      isActive: true,
      updatedAt: now,
      disabledReason: undefined,
      lastFailureAt: undefined,
    });
  } else {
    await ctx.db.insert("pushSubscriptions", {
      userId: user._id,
      endpoint,
      p256dh: args.subscription.keys.p256dh.trim(),
      auth: args.subscription.keys.auth.trim(),
      expirationTime: args.subscription.expirationTime ?? undefined,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });
  }

  return getPushSubscriptionStateByUser(ctx, user._id);
}

export async function removePushSubscriptionHandler(
  ctx: WriteCtx,
  args: RemovePushSubscriptionArgs,
): Promise<PushSubscriptionState> {
  const user = await requireOrCreateUser(ctx);
  const now = nowIso();
  const endpoint = args.endpoint?.trim();

  if (args.all || !endpoint) {
    const activeRows = await listActiveSubscriptionsByUser(ctx, user._id);
    await Promise.all(
      activeRows.map((row) =>
        ctx.db.patch(row._id, {
          isActive: false,
          updatedAt: now,
          disabledReason: "user_disabled",
        }),
      ),
    );

    return {
      enabled: false,
      activeCount: 0,
      updatedAt: activeRows.length > 0 ? now : null,
    };
  }

  const existing = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user_endpoint", (q) => q.eq("userId", user._id).eq("endpoint", endpoint))
    .unique();

  if (existing && existing.isActive) {
    await ctx.db.patch(existing._id, {
      isActive: false,
      updatedAt: now,
      disabledReason: "user_disabled",
    });
  }

  return getPushSubscriptionStateByUser(ctx, user._id);
}

export async function listActivePushSubscriptionsForRecipientsHandler(
  ctx: ReadCtx,
  args: ListActivePushSubscriptionsArgs,
): Promise<ActivePushSubscriptionRecord[]> {
  const uniqueRecipients = new Map<string, UserId>();
  for (const userId of args.recipientUserIds) {
    uniqueRecipients.set(String(userId), userId);
  }

  const subscriptions = await Promise.all(
    [...uniqueRecipients.values()].map((userId) => listActiveSubscriptionsByUser(ctx, userId)),
  );

  return subscriptions.flatMap((rows) =>
    rows.map((row) => ({
      id: row._id,
      userId: row.userId,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      expirationTime: row.expirationTime ?? null,
    })),
  );
}

export async function disablePushSubscriptionByEndpointHandler(
  ctx: WriteCtx,
  args: { endpoint: string; reason?: string },
): Promise<{ updated: number }> {
  const endpoint = args.endpoint.trim();
  if (!endpoint) {
    throw new Error("VALIDATION_ERROR");
  }

  const rows = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
    .collect();

  const now = nowIso();
  const activeRows = rows.filter((row) => row.isActive);
  await Promise.all(
    activeRows.map((row) =>
      ctx.db.patch(row._id, {
        isActive: false,
        updatedAt: now,
        disabledReason: args.reason ?? "delivery_failed",
        lastFailureAt: now,
      }),
    ),
  );

  return { updated: activeRows.length };
}
