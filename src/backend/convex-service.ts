import { EventEmitter } from "node:events";

import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DomainError, type DomainErrorCode } from "@/src/domain/errors";
import { buildWhatsAppSummary } from "@/src/domain/match";
import type {
  CreateMatchInput,
  EventLogRecord,
  MatchView,
  Modality,
  NotificationRecord,
  OpenFeedWindow,
  UserRecord,
} from "@/src/domain/types";

const DOMAIN_ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  MATCH_FULL: "El partido ya está completo.",
  MATCH_CANCELED: "El partido está cancelado.",
  ORGANIZER_MUST_CANCEL: "El organizador no puede salir. Debe cancelar el partido.",
  ALREADY_JOINED: "Ya estás confirmado en este partido.",
  NOT_JOINED: "No estabas en este partido.",
  ALIAS_REQUIRED: "Debes definir tu alias antes de continuar.",
  UNAUTHORIZED: "No autorizado.",
  NOT_FOUND: "Partido no encontrado.",
  VALIDATION_ERROR: "Datos inválidos.",
  OTP_INVALID: "Código OTP incorrecto.",
  OTP_EXPIRED: "Código OTP expirado.",
};

function extractDomainCode(error: unknown): DomainErrorCode | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  const knownCodes = Object.keys(DOMAIN_ERROR_MESSAGES) as DomainErrorCode[];
  for (const code of knownCodes) {
    if (raw.includes(code)) {
      return code;
    }
  }

  return null;
}

function normalizeError(error: unknown): never {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const code = extractDomainCode(error);
  if (code) {
    if (code === "VALIDATION_ERROR" && raw.includes("Este partido no se armó.")) {
      throw new DomainError(code, "Este partido no se armó.");
    }
    throw new DomainError(code, DOMAIN_ERROR_MESSAGES[code]);
  }

  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Error desconocido.");
}

function parseFirebaseActorToken(token: string): { firebaseUid: string; phoneE164?: string } {
  if (!token.startsWith("firebase:")) {
    throw new DomainError("UNAUTHORIZED", "Token inválido.");
  }

  const payload = token.slice("firebase:".length);
  const separatorIndex = payload.indexOf(":");
  const firebaseUid = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;
  const encodedPhone = separatorIndex >= 0 ? payload.slice(separatorIndex + 1) : "";

  if (!firebaseUid) {
    throw new DomainError("UNAUTHORIZED", "Token inválido.");
  }

  const phoneE164 = decodeURIComponent(encodedPhone || "");
  return {
    firebaseUid,
    phoneE164: phoneE164 || undefined,
  };
}

export class ConvexPadelService {
  private readonly convexUrl: string;
  private readonly client: ConvexHttpClient;
  private readonly events = new EventEmitter();

  constructor() {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("Falta NEXT_PUBLIC_CONVEX_URL para usar persistencia Convex.");
    }
    this.convexUrl = convexUrl;
    this.client = new ConvexHttpClient(convexUrl);
  }

  resetForTests() {
    // No-op in real DB mode.
  }

  getEventLogs(): EventLogRecord[] {
    return [];
  }

  requestOtp(): { expiresInSeconds: number } {
    throw new DomainError(
      "VALIDATION_ERROR",
      "OTP local deshabilitado. Usa Firebase Phone Auth desde el cliente.",
    );
  }

  verifyOtp(): { token: string; user: UserRecord } {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Verificación OTP local deshabilitada. Usa Firebase Phone Auth desde el cliente.",
    );
  }

  async getUserByToken(token: string): Promise<UserRecord> {
    const actor = parseFirebaseActorToken(token);
    try {
      return await this.client.mutation(api.padel.upsertUser, { actor });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async updateAlias(token: string, alias: string): Promise<UserRecord> {
    const actor = parseFirebaseActorToken(token);
    try {
      return await this.client.mutation(api.padel.updateAlias, { actor, alias });
    } catch (error) {
      return normalizeError(error);
    }
  }

  private createAuthedClient(idToken: string): ConvexHttpClient {
    return new ConvexHttpClient(this.convexUrl, { auth: idToken });
  }

  async generateAvatarUploadUrl(idToken: string): Promise<string> {
    try {
      return await this.createAuthedClient(idToken).mutation(api.padel.generateAvatarUploadUrl, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async setAvatar(idToken: string, storageId: string): Promise<UserRecord> {
    try {
      return await this.createAuthedClient(idToken).mutation(api.padel.setMyAvatar, {
        storageId: storageId as Id<"_storage">,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async removeAvatar(idToken: string): Promise<UserRecord> {
    try {
      return await this.createAuthedClient(idToken).mutation(api.padel.removeMyAvatar, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async createMatch(token: string, input: CreateMatchInput): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.createMatch, {
        actor,
        input,
        timezone: "America/Bogota",
      });
      this.events.emit(`match:${match.publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listHome(actorToken?: string): Promise<MatchView[]> {
    const actor = actorToken ? parseFirebaseActorToken(actorToken) : undefined;
    try {
      return await this.client.query(api.padel.listHome, { actor });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listMine(token: string): Promise<MatchView[]> {
    const actor = parseFirebaseActorToken(token);
    try {
      return await this.client.query(api.padel.listMine, { actor });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listOpenFeed(filters: {
    modality?: Modality;
    window: OpenFeedWindow;
    now?: Date;
  }): Promise<MatchView[]> {
    try {
      return await this.client.query(api.padel.listOpenFeed, {
        modality: filters.modality,
        window: filters.window,
        nowIso: filters.now?.toISOString(),
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getMatch(publicId: string, token?: string): Promise<MatchView> {
    const actor = token ? parseFirebaseActorToken(token) : undefined;
    try {
      return await this.client.query(api.padel.getMatch, { publicId, actor });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async followMatchWatch(publicId: string, token: string): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.followMatchWatch, { publicId, actor });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async unfollowMatchWatch(publicId: string, token: string): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.unfollowMatchWatch, { publicId, actor });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async join(publicId: string, token: string): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.join, { publicId, actor });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async leave(publicId: string, token: string): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.leave, { publicId, actor });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async cancel(publicId: string, token: string): Promise<MatchView> {
    const actor = parseFirebaseActorToken(token);
    try {
      const match = await this.client.mutation(api.padel.cancel, { publicId, actor });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getWhatsAppSummary(publicId: string, token?: string, origin?: string): Promise<string> {
    const match = await this.getMatch(publicId, token);
    const shareUrl = origin ? `${origin}/partido/${publicId}` : `/partido/${publicId}`;
    return buildWhatsAppSummary(match, shareUrl);
  }

  async listNotifications(token: string, limit = 50): Promise<NotificationRecord[]> {
    const actor = parseFirebaseActorToken(token);
    try {
      return await this.client.query(api.padel.listNotificationsForActor, { actor, limit });
    } catch (error) {
      return normalizeError(error);
    }
  }

  subscribeToMatch(publicId: string, listener: () => void): () => void {
    const eventName = `match:${publicId}`;
    this.events.on(eventName, listener);
    return () => {
      this.events.off(eventName, listener);
    };
  }
}

const globalWithConvex = globalThis as typeof globalThis & {
  __convexPadelService?: ConvexPadelService;
};

export const convexPadelService =
  globalWithConvex.__convexPadelService ??
  (globalWithConvex.__convexPadelService = new ConvexPadelService());
