import { DEFAULT_NOTIFICATION_LIMIT, MAX_NOTIFICATION_LIMIT } from "./constants";
import { nowIso } from "./date_time";
import { requireUser } from "./auth";
import type { QueryCtx } from "../_generated/server";
import type { ListNotificationsArgs, NotificationDoc, NotificationId, NotificationListItem, WriteCtx } from "./types";

function toNotificationListItem(row: NotificationDoc): NotificationListItem {
  return {
    id: row._id,
    type: row.type,
    title: row.title,
    message: row.message,
    matchPublicId: row.matchPublicId ?? null,
    createdAt: row.createdAt,
    readAt: row.readAt ?? null,
    isRead: Boolean(row.readAt),
  };
}

function sanitizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? DEFAULT_NOTIFICATION_LIMIT, MAX_NOTIFICATION_LIMIT));
}

export async function listNotificationsForMeHandler(
  ctx: QueryCtx,
  args: ListNotificationsArgs,
): Promise<NotificationListItem[]> {
  const user = await requireUser(ctx);
  const limit = sanitizeLimit(args.limit);

  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_created_at", (q) => q.eq("recipientUserId", user._id))
    .order("desc")
    .take(limit);

  return rows.map(toNotificationListItem);
}

export async function unreadNotificationsCountHandler(ctx: QueryCtx): Promise<number> {
  const user = await requireUser(ctx);
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_read_at", (q) => q.eq("recipientUserId", user._id))
    .collect();

  return rows.filter((row) => !row.readAt).length;
}

export async function markNotificationReadHandler(
  ctx: WriteCtx,
  args: { notificationId: NotificationId },
): Promise<{ ok: true }> {
  const user = await requireUser(ctx);
  const row = await ctx.db.get(args.notificationId);
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  if (row.recipientUserId !== user._id) {
    throw new Error("UNAUTHORIZED");
  }

  if (!row.readAt) {
    await ctx.db.patch(row._id, { readAt: nowIso() });
  }

  return { ok: true };
}

export async function markAllNotificationsReadHandler(ctx: WriteCtx): Promise<{ updated: number }> {
  const user = await requireUser(ctx);
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_read_at", (q) => q.eq("recipientUserId", user._id))
    .collect();

  const now = nowIso();
  const unreadRows = rows.filter((row) => !row.readAt);
  await Promise.all(unreadRows.map((row) => ctx.db.patch(row._id, { readAt: now })));

  return { updated: unreadRows.length };
}
