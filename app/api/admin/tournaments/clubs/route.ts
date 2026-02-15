import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function GET(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const clubs = await padelService.listAdminClubs(token);
    return responseOk({ clubs });
  } catch (error) {
    return responseError(error);
  }
}
