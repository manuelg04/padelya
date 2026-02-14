"use node";

import webpush from "web-push";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  formatJoinPushBody,
  formatReleaseSpotPushBody,
  resolveJoinPushRecipientUserIds,
} from "./padel/push_message";

function getRequiredEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return null;
  }
  return value.trim();
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

function toAbsoluteMatchUrl(matchPublicId: string, query?: URLSearchParams): string {
  const path = `/partido/${matchPublicId}${query?.size ? `?${query.toString()}` : ""}`;
  const siteUrl = getRequiredEnv("NEXT_PUBLIC_CONVEX_SITE_URL");
  if (!siteUrl) {
    return path;
  }

  const normalizedSiteUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  return `${normalizedSiteUrl}${path}`;
}

function configureWebPushOrNull(): {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
} | null {
  const vapidPublicKey = getRequiredEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
  const vapidPrivateKey = getRequiredEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
  const vapidSubject = getRequiredEnv("WEB_PUSH_VAPID_SUBJECT");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.warn("[push] Missing VAPID env vars. Skipping push dispatch.");
    return null;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  return { vapidPublicKey, vapidPrivateKey, vapidSubject };
}

async function sendPushToRecipients(
  ctx: ActionCtx,
  input: {
    recipientUserIds: Id<"users">[];
    payload: string;
  },
) {
  const configured = configureWebPushOrNull();
  if (!configured) {
    return;
  }

  const subscriptions = await ctx.runQuery(internal.padel.listActivePushSubscriptionsForRecipients, {
    recipientUserIds: input.recipientUserIds,
  });

  if (subscriptions.length === 0) {
    return;
  }

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          input.payload,
        );
      } catch (error) {
        const statusCode = getStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.padel.disablePushSubscriptionByEndpoint, {
            endpoint: subscription.endpoint,
            reason: `delivery_${statusCode}`,
          });
          return;
        }

        console.error("[push] Failed to send push", {
          endpoint: subscription.endpoint,
          statusCode,
          error,
        });
      }
    }),
  );
}

export const sendJoinPush = internalAction({
  args: {
    recipientUserIds: v.array(v.id("users")),
    joinerUserId: v.id("users"),
    joinerAlias: v.string(),
    club: v.string(),
    startsAtUtc: v.string(),
    matchPublicId: v.string(),
    eventAt: v.string(),
  },
  handler: async (ctx, args) => {
    const recipientUserIds = resolveJoinPushRecipientUserIds(args.recipientUserIds, args.joinerUserId);
    if (recipientUserIds.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      title: "Nuevo jugador confirmado",
      body: formatJoinPushBody({
        joinerAlias: args.joinerAlias,
        club: args.club,
        startsAtUtc: args.startsAtUtc,
        referenceNowUtc: args.eventAt,
      }),
      tag: `join:${args.matchPublicId}`,
      data: {
        url: toAbsoluteMatchUrl(args.matchPublicId),
      },
    });

    await sendPushToRecipients(ctx, {
      recipientUserIds,
      payload,
    });
  },
});

export const sendReleaseSpotPush = internalAction({
  args: {
    recipientUserIds: v.array(v.id("users")),
    club: v.string(),
    startsAtUtc: v.string(),
    matchPublicId: v.string(),
    eventAt: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.recipientUserIds.length === 0) {
      return;
    }

    const query = new URLSearchParams({
      cta: "join",
      notice: "release",
    });

    const payload = JSON.stringify({
      title: "Se liberó 1 cupo",
      body: formatReleaseSpotPushBody({
        club: args.club,
        startsAtUtc: args.startsAtUtc,
        referenceNowUtc: args.eventAt,
      }),
      tag: `release:${args.matchPublicId}`,
      data: {
        url: toAbsoluteMatchUrl(args.matchPublicId, query),
      },
    });

    await sendPushToRecipients(ctx, {
      recipientUserIds: args.recipientUserIds,
      payload,
    });
  },
});

export const sendMatchCanceledPush = internalAction({
  args: {
    recipientUserIds: v.array(v.id("users")),
    club: v.string(),
    matchPublicId: v.string(),
    eventAt: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.recipientUserIds.length === 0) {
      return;
    }

    const query = new URLSearchParams({
      notice: "canceled",
    });

    const payload = JSON.stringify({
      title: "Partido cancelado",
      body: `El partido en ${args.club} fue cancelado.`,
      tag: `cancel:${args.matchPublicId}`,
      data: {
        url: toAbsoluteMatchUrl(args.matchPublicId, query),
      },
    });

    await sendPushToRecipients(ctx, {
      recipientUserIds: args.recipientUserIds,
      payload,
    });
  },
});
