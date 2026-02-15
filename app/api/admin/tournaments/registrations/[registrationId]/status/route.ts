import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import type { TournamentRegistrationStatus } from "@/src/domain/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const { registrationId } = await params;
    const body = (await request.json()) as { status: TournamentRegistrationStatus };
    const result = await padelService.setTournamentRegistrationStatus(
      token,
      decodeURIComponent(registrationId),
      body.status,
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
