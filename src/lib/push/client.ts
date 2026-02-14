"use client";

import type { PushSubscriptionPayload } from "@/src/domain/types";
import { WEB_PUSH_VAPID_PUBLIC_KEY } from "@/src/lib/env";

export type PushUnsupportedReason = "unsupported" | "requires_install";

export type PushAvailability =
  | {
      supported: true;
      permission: NotificationPermission;
    }
  | {
      supported: false;
      reason: PushUnsupportedReason;
      permission: NotificationPermission | "unsupported";
    };

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function hasWindowSupport(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isIosDevice(): boolean {
  if (!hasWindowSupport()) {
    return false;
  }

  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (!hasWindowSupport()) {
    return false;
  }

  const mediaMatch = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone = (navigator as NavigatorWithStandalone).standalone === true;
  return mediaMatch || navigatorStandalone;
}

export function getPushAvailability(): PushAvailability {
  if (!hasWindowSupport()) {
    return {
      supported: false,
      reason: "unsupported",
      permission: "unsupported",
    };
  }

  const hasWebPushApi =
    typeof window.Notification !== "undefined" &&
    typeof window.PushManager !== "undefined" &&
    "serviceWorker" in navigator;

  if (!hasWebPushApi) {
    return {
      supported: false,
      reason: "unsupported",
      permission: "unsupported",
    };
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return {
      supported: false,
      reason: "requires_install",
      permission: Notification.permission,
    };
  }

  return {
    supported: true,
    permission: Notification.permission,
  };
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`;
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export function getVapidPublicKey(): string | null {
  const key = WEB_PUSH_VAPID_PUBLIC_KEY.trim();
  return key.length > 0 ? key : null;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Web Push no soportado.");
  }

  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function getCurrentPushSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    throw new Error("Falta NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY.");
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey) as BufferSource,
  });
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration,
): Promise<{ endpoint: string | null }> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return { endpoint: null };
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return { endpoint };
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    throw new Error("Web Push no soportado.");
  }
  return Notification.requestPermission();
}

export function toPushSubscriptionPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("No se pudo serializar la suscripción push.");
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
    expirationTime: subscription.expirationTime,
  };
}
