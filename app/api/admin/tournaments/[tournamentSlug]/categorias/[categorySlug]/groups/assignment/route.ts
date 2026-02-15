import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const body = (await request.json()) as { teamId: string; targetGroupName: string };
    const { tournamentSlug, categorySlug } = await params;

    const result = await padelService.moveTournamentTeamGroup(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      body.teamId,
      body.targetGroupName,
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
