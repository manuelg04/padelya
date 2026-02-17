import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";
import type { TournamentFreeRoundCreateRequest } from "@/src/domain/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const body = (await request.json().catch(() => ({}))) as TournamentFreeRoundCreateRequest;
    const { tournamentSlug, categorySlug } = await params;
    const result = await padelService.createTournamentFreeRound(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      body,
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
