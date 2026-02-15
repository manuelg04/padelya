import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import type { TournamentRegistrationRequest } from "@/src/domain/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const { tournamentSlug, categorySlug } = await params;
    const body = (await request.json()) as TournamentRegistrationRequest;
    const registration = await padelService.registerForCategory(
      token,
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      body,
    );

    return responseOk(registration, 201);
  } catch (error) {
    return responseError(error);
  }
}
