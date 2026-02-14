"use client";

import { useEffect, useRef } from "react";

import {
  RETURN_COOLDOWN_MS,
  type ReturnReason,
  type ReturnTriggerEvent,
} from "@/src/domain/reentry";

type UseReturnTriggerOptions = {
  enabled?: boolean;
  cooldownMs?: number;
};

export function useReturnTrigger(
  onReturn: (event: ReturnTriggerEvent) => void,
  options?: UseReturnTriggerOptions,
) {
  const enabled = options?.enabled ?? true;
  const cooldownMs = options?.cooldownMs ?? RETURN_COOLDOWN_MS;
  const callbackRef = useRef(onReturn);
  const hiddenAtMsRef = useRef<number | null>(null);
  const offlineAtMsRef = useRef<number | null>(null);
  const lastTriggerAtMsRef = useRef<number>(0);

  useEffect(() => {
    callbackRef.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function trigger(reason: ReturnReason, awayMs: number) {
      const nowMs = Date.now();
      if (nowMs - lastTriggerAtMsRef.current < cooldownMs) {
        return;
      }

      lastTriggerAtMsRef.current = nowMs;
      callbackRef.current({
        reason,
        awayMs: Math.max(0, awayMs),
        triggeredAtMs: nowMs,
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtMsRef.current = Date.now();
        return;
      }

      const hiddenAtMs = hiddenAtMsRef.current;
      hiddenAtMsRef.current = null;
      const awayMs = hiddenAtMs ? Date.now() - hiddenAtMs : 0;
      trigger("visibility", awayMs);
    }

    function handleFocus() {
      const hiddenAtMs = hiddenAtMsRef.current;
      hiddenAtMsRef.current = null;
      const awayMs = hiddenAtMs ? Date.now() - hiddenAtMs : 0;
      trigger("focus", awayMs);
    }

    function handleOffline() {
      offlineAtMsRef.current = Date.now();
    }

    function handleOnline() {
      const offlineAtMs = offlineAtMsRef.current;
      offlineAtMsRef.current = null;
      const awayMs = offlineAtMs ? Date.now() - offlineAtMs : 0;
      trigger("online", awayMs);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, cooldownMs]);
}
