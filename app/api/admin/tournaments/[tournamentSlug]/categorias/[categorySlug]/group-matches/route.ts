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

    const { tournamentSlug, categorySlug } = await params;
    const result = await padelService.generateTournamentGroupMatches(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
