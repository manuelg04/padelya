import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const { registrationId } = await params;
    const result = await padelService.cancelTournamentRegistration(token, decodeURIComponent(registrationId));
    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
