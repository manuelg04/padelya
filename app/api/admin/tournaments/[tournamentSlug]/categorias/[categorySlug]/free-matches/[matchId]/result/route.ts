import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";
import type { TournamentFreeMatchResultInput } from "@/src/domain/types";

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ tournamentSlug: string; categorySlug: string; matchId: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const body = (await request.json()) as TournamentFreeMatchResultInput;
    const { tournamentSlug, categorySlug, matchId } = await params;
    const result = await padelService.reportTournamentFreeMatchResult(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      decodeURIComponent(matchId),
      body,
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
