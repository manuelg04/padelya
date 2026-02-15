import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const body = (await request.json().catch(() => ({}))) as { groupCount?: number };
    const { tournamentSlug, categorySlug } = await params;
    const result = await padelService.generateTournamentGroups(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      { groupCount: body.groupCount },
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
