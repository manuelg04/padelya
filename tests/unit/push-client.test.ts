import { afterEach, describe, expect, it } from "vitest";

import {
  base64UrlToUint8Array,
  getPushAvailability,
  toPushSubscriptionPayload,
} from "@/src/lib/push/client";

const originalNotification = (window as Window & { Notification?: unknown }).Notification;
const originalPushManager = (window as Window & { PushManager?: unknown }).PushManager;
const originalServiceWorker = (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;
const originalStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
const originalMatchMedia = window.matchMedia;
const originalUserAgent = navigator.userAgent;

function setSupportedEnvironment({
  userAgent = "Mozilla/5.0",
  standalone = false,
  displayModeStandalone = false,
}: {
  userAgent?: string;
  standalone?: boolean;
  displayModeStandalone?: boolean;
} = {}) {
  Object.defineProperty(window, "Notification", {
    value: { permission: "default" },
    configurable: true,
  });
  Object.defineProperty(window, "PushManager", {
    value: function PushManager() {},
    configurable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: {},
    configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: standalone,
    configurable: true,
  });
  Object.defineProperty(navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: (() =>
      ({
        matches: displayModeStandalone,
        media: "(display-mode: standalone)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, "Notification", { value: originalNotification, configurable: true });
  Object.defineProperty(window, "PushManager", { value: originalPushManager, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", { value: originalServiceWorker, configurable: true });
  Object.defineProperty(navigator, "standalone", { value: originalStandalone, configurable: true });
  Object.defineProperty(navigator, "userAgent", { value: originalUserAgent, configurable: true });
  Object.defineProperty(window, "matchMedia", { value: originalMatchMedia, configurable: true });
});

describe("push client", () => {
  it("decodes base64url VAPID key bytes", () => {
    const bytes = base64UrlToUint8Array("AQAB");
    expect([...bytes]).toEqual([1, 0, 1]);
  });

  it("reports unsupported when push APIs are missing", () => {
    Object.defineProperty(window, "Notification", { value: undefined, configurable: true });
    Object.defineProperty(window, "PushManager", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: true });

    const availability = getPushAvailability();
    expect(availability.supported).toBe(false);
    if (!availability.supported) {
      expect(availability.reason).toBe("unsupported");
    }
  });

  it("requires installed PWA context on iOS", () => {
    setSupportedEnvironment({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      standalone: false,
      displayModeStandalone: false,
    });

    const availability = getPushAvailability();
    expect(availability.supported).toBe(false);
    if (!availability.supported) {
      expect(availability.reason).toBe("requires_install");
    }
  });

  it("serializes push subscription payload", () => {
    const subscription = {
      endpoint: "https://push.example/subscription/123",
      expirationTime: null,
      toJSON: () => ({
        endpoint: "https://push.example/subscription/123",
        keys: {
          p256dh: "p256dh-value",
          auth: "auth-value",
        },
      }),
    } as unknown as PushSubscription;

    const payload = toPushSubscriptionPayload(subscription);
    expect(payload).toEqual({
      endpoint: "https://push.example/subscription/123",
      keys: {
        p256dh: "p256dh-value",
        auth: "auth-value",
      },
      expirationTime: null,
    });
  });
});
