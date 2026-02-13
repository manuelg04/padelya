import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";

function parseLimit(value: string | null): number {
  if (!value) {
    return 50;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const notifications = await padelService.listNotifications(token, limit);
    return responseOk({ notifications });
  } catch (error) {
    return responseError(error);
  }
}
