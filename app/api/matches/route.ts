import { NextRequest } from "next/server";

import { resolveAuthToken, responseError, responseOk } from "@/src/backend/http";
import { padelService } from "@/src/backend/padel-service";
import type { Modality, OpenFeedWindow } from "@/src/domain/types";

function parseOpenModality(value: string | null): Modality | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "mixto" || value === "masc" || value === "fem") {
    return value;
  }
  throw new Error("Modalidad inválida.");
}

function parseOpenWindow(value: string | null): OpenFeedWindow {
  if (!value || value === "next7") {
    return "next7";
  }
  if (value === "today") {
    return value;
  }
  throw new Error("Ventana de tiempo inválida.");
}

export async function GET(request: NextRequest) {
  try {
    const open = request.nextUrl.searchParams.get("open") === "1";
    const mine = request.nextUrl.searchParams.get("mine") === "1";

    if (open) {
      // Open feed is public. If auth token is invalid, fall back to anonymous view.
      const actorToken = await resolveAuthToken(request).catch(() => null);
      const modality = parseOpenModality(request.nextUrl.searchParams.get("modality"));
      const window = parseOpenWindow(request.nextUrl.searchParams.get("window"));
      const matches = await padelService.listOpenFeed({
        modality,
        window,
        actorToken: actorToken ?? undefined,
      });
      return responseOk({ matches });
    }

    const token = (await resolveAuthToken(request)) ?? undefined;
    const matches = mine && token ? await padelService.listMine(token) : await padelService.listHome(token);
    return responseOk({ matches });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await resolveAuthToken(request);
    if (!token) {
      throw new Error("No autorizado");
    }
    const body = await request.json();
    const match = await padelService.createMatch(token, body);
    return responseOk({ match }, 201);
  } catch (error) {
    return responseError(error);
  }
}
