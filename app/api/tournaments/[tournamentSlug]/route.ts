import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string }> },
) {
  try {
    const token = (await resolveAuthToken(request)) ?? undefined;
    const { tournamentSlug } = await params;
    const tournament = await padelService.getTournamentBySlug(decodeURIComponent(tournamentSlug), token);
    return responseOk({ tournament });
  } catch (error) {
    return responseError(error);
  }
}
