import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";
import type { PushSubscriptionPayload } from "@/src/domain/types";

type RemovePushSubscriptionRequest = {
  endpoint?: string;
  all?: boolean;
};

function isValidPushSubscriptionPayload(value: unknown): value is PushSubscriptionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<PushSubscriptionPayload>;
  const keys = payload.keys as PushSubscriptionPayload["keys"] | undefined;
  const hasValidExpiration =
    payload.expirationTime === null ||
    (typeof payload.expirationTime === "number" && Number.isFinite(payload.expirationTime));

  return (
    typeof payload.endpoint === "string" &&
    payload.endpoint.trim().length > 0 &&
    Boolean(keys) &&
    typeof keys?.p256dh === "string" &&
    keys.p256dh.trim().length > 0 &&
    typeof keys.auth === "string" &&
    keys.auth.trim().length > 0 &&
    hasValidExpiration
  );
}

async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    const body = (await request.json()) as T;
    return body;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const state = await padelService.getPushSubscriptionState(token);
    return responseOk({ state });
  } catch (error) {
    return responseError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const body = await parseJsonBody<PushSubscriptionPayload>(request);
    if (!body || !isValidPushSubscriptionPayload(body)) {
      throw new DomainError("VALIDATION_ERROR", "Suscripción push inválida.");
    }

    const state = await padelService.upsertPushSubscription(token, body);
    return responseOk({ state });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const body = (await parseJsonBody<RemovePushSubscriptionRequest>(request)) ?? {};
    const state = await padelService.removePushSubscription(token, {
      endpoint: typeof body.endpoint === "string" ? body.endpoint : undefined,
      all: Boolean(body.all),
    });

    return responseOk({ state });
  } catch (error) {
    return responseError(error);
  }
}
