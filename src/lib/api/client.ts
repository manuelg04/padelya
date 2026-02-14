import type {
  CreateMatchInput,
  MatchView,
  Modality,
  NotificationRecord,
  OpenFeedWindow,
  PushSubscriptionPayload,
  PushSubscriptionState,
  UserRecord,
} from "@/src/domain/types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiResponseError {
  error?: {
    code?: string;
    message?: string;
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiResponseError;
  if (!response.ok) {
    const code = body.error?.code ?? "REQUEST_ERROR";
    const message = body.error?.message ?? "Error al procesar la solicitud";
    throw new ApiError(code, message);
  }
  return body;
}

function authHeaders(token?: string): HeadersInit {
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function requestOtp(phone: string): Promise<void> {
  const response = await fetch("/api/auth/request-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone }),
  });
  await parseJson(response);
}

export async function verifyOtp(phone: string, code: string): Promise<{ token: string; user: UserRecord }> {
  const response = await fetch("/api/auth/verify-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone, code }),
  });
  return parseJson<{ token: string; user: UserRecord }>(response);
}

export async function getMe(token?: string): Promise<UserRecord | null> {
  const response = await fetch("/api/me", {
    headers: {
      ...authHeaders(token),
    },
    cache: "no-store",
  });
  const payload = await parseJson<{ user: UserRecord | null }>(response);
  return payload.user;
}

export async function updateAlias(token: string, alias: string): Promise<UserRecord> {
  const response = await fetch("/api/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ alias }),
  });
  const payload = await parseJson<{ user: UserRecord }>(response);
  return payload.user;
}

export async function listMatches(options?: {
  token?: string;
  mine?: boolean;
  open?: boolean;
  modality?: Modality;
  window?: OpenFeedWindow;
}): Promise<MatchView[]> {
  const params = new URLSearchParams();
  if (options?.mine) {
    params.set("mine", "1");
  }
  if (options?.open) {
    params.set("open", "1");
  }
  if (options?.modality) {
    params.set("modality", options.modality);
  }
  if (options?.window) {
    params.set("window", options.window);
  }
  const response = await fetch(`/api/matches${params.size ? `?${params.toString()}` : ""}`, {
    headers: {
      ...authHeaders(options?.token),
    },
    cache: "no-store",
  });
  const payload = await parseJson<{ matches: MatchView[] }>(response);
  return payload.matches;
}

export async function createMatch(token: string, input: CreateMatchInput): Promise<MatchView> {
  const response = await fetch("/api/matches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function getMatch(publicId: string, token?: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}`, {
    headers: {
      ...authHeaders(token),
    },
    cache: "no-store",
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function joinMatch(publicId: string, token: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/join`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function leaveMatch(publicId: string, token: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/leave`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function cancelMatch(publicId: string, token: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/cancel`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function getMatchSummary(publicId: string, token?: string): Promise<string> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/summary`, {
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ summary: string }>(response);
  return payload.summary;
}

export async function followMatchWatch(publicId: string, token: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/watch`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function unfollowMatchWatch(publicId: string, token: string): Promise<MatchView> {
  const response = await fetch(`/api/matches/${encodeURIComponent(publicId)}/watch`, {
    method: "DELETE",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ match: MatchView }>(response);
  return payload.match;
}

export async function listNotifications(token: string, limit = 50): Promise<NotificationRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/notifications?${params.toString()}`, {
    headers: {
      ...authHeaders(token),
    },
    cache: "no-store",
  });
  const payload = await parseJson<{ notifications: NotificationRecord[] }>(response);
  return payload.notifications;
}

export async function getPushSubscriptionState(token: string): Promise<PushSubscriptionState> {
  const response = await fetch("/api/push/subscription", {
    headers: {
      ...authHeaders(token),
    },
    cache: "no-store",
  });
  const payload = await parseJson<{ state: PushSubscriptionState }>(response);
  return payload.state;
}

export async function upsertPushSubscription(
  token: string,
  subscription: PushSubscriptionPayload,
): Promise<PushSubscriptionState> {
  const response = await fetch("/api/push/subscription", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(subscription),
  });
  const payload = await parseJson<{ state: PushSubscriptionState }>(response);
  return payload.state;
}

export async function removePushSubscription(
  token: string,
  options?: { endpoint?: string; all?: boolean },
): Promise<PushSubscriptionState> {
  const response = await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({
      endpoint: options?.endpoint,
      all: options?.all,
    }),
  });
  const payload = await parseJson<{ state: PushSubscriptionState }>(response);
  return payload.state;
}

export async function generateAvatarUploadUrl(token: string): Promise<string> {
  const response = await fetch("/api/me/avatar/upload-url", {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ uploadUrl: string }>(response);
  return payload.uploadUrl;
}

export async function uploadAvatarFile(uploadUrl: string, file: File): Promise<string> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new ApiError("REQUEST_ERROR", "No se pudo subir la imagen.");
  }

  const payload = (await response.json()) as { storageId?: string };
  if (typeof payload.storageId !== "string" || payload.storageId.length === 0) {
    throw new ApiError("REQUEST_ERROR", "Respuesta inválida de upload.");
  }

  return payload.storageId;
}

export async function setAvatar(token: string, storageId: string): Promise<UserRecord> {
  const response = await fetch("/api/me/avatar", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ storageId }),
  });
  const payload = await parseJson<{ user: UserRecord }>(response);
  return payload.user;
}

export async function removeAvatar(token: string): Promise<UserRecord> {
  const response = await fetch("/api/me/avatar", {
    method: "DELETE",
    headers: {
      ...authHeaders(token),
    },
  });
  const payload = await parseJson<{ user: UserRecord }>(response);
  return payload.user;
}
