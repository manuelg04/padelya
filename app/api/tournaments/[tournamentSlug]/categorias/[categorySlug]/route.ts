import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentSlug: string; categorySlug: string }> },
) {
  try {
    const token = (await resolveAuthToken(request)) ?? undefined;
    const { tournamentSlug, categorySlug } = await params;
    const category = await padelService.getTournamentCategoryBySlug(
      decodeURIComponent(tournamentSlug),
      decodeURIComponent(categorySlug),
      token,
    );
    return responseOk({ category });
  } catch (error) {
    return responseError(error);
  }
}
