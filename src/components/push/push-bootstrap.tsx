"use client";

import { useEffect } from "react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { upsertPushSubscription } from "@/src/lib/api/client";
import { USE_MOCK_BACKEND } from "@/src/lib/env";
import {
  getPushAvailability,
  registerPushServiceWorker,
  subscribeToPush,
  toPushSubscriptionPayload,
} from "@/src/lib/push/client";

export function PushBootstrap() {
  const { user, token } = useAuth();

  useEffect(() => {
    if (!user || !token || USE_MOCK_BACKEND) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const availability = getPushAvailability();
      if (!availability.supported || availability.permission !== "granted") {
        return;
      }

      const registration = await registerPushServiceWorker();
      const subscription = await subscribeToPush(registration);
      if (cancelled) {
        return;
      }

      await upsertPushSubscription(token, toPushSubscriptionPayload(subscription));
    })().catch(() => {
      // Silent bootstrap; explicit errors are shown in profile controls.
    });

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  return null;
}
