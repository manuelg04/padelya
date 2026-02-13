import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";

export async function GET(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      return responseOk({ user: null });
    }
    const user = await padelService.getUserByToken(token);
    return responseOk({ user });
  } catch (error) {
    return responseError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }

    const body = (await request.json()) as { alias: string };
    const user = await padelService.updateAlias(token, body.alias);
    return responseOk({ user });
  } catch (error) {
    return responseError(error);
  }
}
