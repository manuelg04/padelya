import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clubSlug: string }> },
) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const { clubSlug } = await params;
    const body = (await request.json()) as { paymentInstructions: string };
    const result = await padelService.updateClubPaymentInstructions(
      token,
      decodeURIComponent(clubSlug),
      body.paymentInstructions,
    );

    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}
