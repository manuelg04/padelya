import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
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
