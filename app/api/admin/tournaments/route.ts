import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import { DomainError } from "@/src/domain/errors";
import type { CreateTournamentInput } from "@/src/domain/types";

export async function GET(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const clubSlug = request.nextUrl.searchParams.get("clubSlug");
    if (!clubSlug) {
      throw new Error("Falta clubSlug.");
    }

    const result = await padelService.listAdminTournaments(token, clubSlug);
    return responseOk(result);
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new DomainError("UNAUTHORIZED", "No autorizado.");
    }

    const input = (await request.json()) as CreateTournamentInput;
    const result = await padelService.createTournament(token, input);
    return responseOk(result, 201);
  } catch (error) {
    return responseError(error);
  }
}
