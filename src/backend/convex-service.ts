import { EventEmitter } from "node:events";

import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BackendPadelService } from "@/src/backend/contracts";
import { DomainError, type DomainErrorCode } from "@/src/domain/errors";
import { buildWhatsAppSummary } from "@/src/domain/match";
import type {
  AdminCategoryDashboard,
  AdminClubMembership,
  AdminTournamentsResponse,
  CreateMatchInput,
  CreateTournamentInput,
  EventLogRecord,
  MatchView,
  Modality,
  NotificationRecord,
  OpenFeedWindow,
  PublicTournamentCategoryDetail,
  PublicTournamentDetail,
  PushSubscriptionPayload,
  PushSubscriptionState,
  TournamentFreeMatchResultInput,
  TournamentFreeRoundCreateRequest,
  TournamentRegistrationRequest,
  TournamentRegistrationStatus,
  TournamentSetScore,
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
  TOURNAMENT_ALREADY_REGISTERED: "Ya tienes una inscripción activa en esta categoría.",
  TOURNAMENT_CAPACITY_REACHED: "No hay cupos disponibles para confirmar.",
  TOURNAMENT_CATEGORY_FROZEN: "La categoría ya está cerrada para cambios de inscripción.",
  FORBIDDEN: "No autorizado para esta operación.",
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

export class ConvexPadelService implements BackendPadelService {
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
    return;
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

  private createAuthedClient(idToken: string): ConvexHttpClient {
    return new ConvexHttpClient(this.convexUrl, { auth: idToken });
  }

  private getClientForToken(idToken?: string): ConvexHttpClient {
    if (!idToken) {
      return this.client;
    }
    return this.createAuthedClient(idToken);
  }

  private isMissingLegacyActorError(error: unknown): boolean {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    return raw.includes("ArgumentValidationError") && raw.includes("required field `actor`");
  }

  private buildLegacyActor(idToken: string): { firebaseUid: string; phoneE164?: string } | null {
    try {
      const segments = idToken.split(".");
      if (segments.length < 2) {
        return null;
      }
      const payloadRaw = Buffer.from(segments[1]!, "base64url").toString("utf8");
      const payload = JSON.parse(payloadRaw) as {
        sub?: unknown;
        user_id?: unknown;
        phone_number?: unknown;
      };
      const firebaseUid =
        typeof payload.user_id === "string"
          ? payload.user_id
          : typeof payload.sub === "string"
            ? payload.sub
            : null;
      if (!firebaseUid) {
        return null;
      }

      const actor: { firebaseUid: string; phoneE164?: string } = { firebaseUid };
      if (typeof payload.phone_number === "string" && payload.phone_number.trim().length > 0) {
        actor.phoneE164 = payload.phone_number;
      }
      return actor;
    } catch {
      return null;
    }
  }

  private withLegacyActorArgs(
    idToken: string,
    args: object,
  ): (Record<string, unknown> & { actor: { firebaseUid: string; phoneE164?: string } }) | null {
    const baseArgs = args as Record<string, unknown>;
    if ("actor" in baseArgs) {
      return null;
    }
    const actor = this.buildLegacyActor(idToken);
    if (!actor) {
      return null;
    }
    return {
      ...baseArgs,
      actor,
    };
  }

  private async authedMutation<TResult>(
    idToken: string,
    mutationRef: unknown,
    args: object,
  ): Promise<TResult> {
    const client = this.createAuthedClient(idToken);
    try {
      return (await client.mutation(mutationRef as never, args as never)) as TResult;
    } catch (error) {
      if (!this.isMissingLegacyActorError(error)) {
        throw error;
      }
      const fallbackArgs = this.withLegacyActorArgs(idToken, args);
      if (!fallbackArgs) {
        throw error;
      }
      return (await client.mutation(mutationRef as never, fallbackArgs as never)) as TResult;
    }
  }

  private async authedQuery<TResult>(
    idToken: string,
    queryRef: unknown,
    args: object,
  ): Promise<TResult> {
    const client = this.createAuthedClient(idToken);
    try {
      return (await client.query(queryRef as never, args as never)) as TResult;
    } catch (error) {
      if (!this.isMissingLegacyActorError(error)) {
        throw error;
      }
      const fallbackArgs = this.withLegacyActorArgs(idToken, args);
      if (!fallbackArgs) {
        throw error;
      }
      return (await client.query(queryRef as never, fallbackArgs as never)) as TResult;
    }
  }

  async getUserByToken(token: string): Promise<UserRecord> {
    try {
      return await this.authedMutation<UserRecord>(token, api.padel.upsertUser, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async updateAlias(token: string, alias: string): Promise<UserRecord> {
    try {
      return await this.authedMutation<UserRecord>(token, api.padel.updateAlias, { alias });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async generateAvatarUploadUrl(idToken: string): Promise<string> {
    try {
      return await this.authedMutation<string>(idToken, api.padel.generateAvatarUploadUrl, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async setAvatar(idToken: string, storageId: string): Promise<UserRecord> {
    try {
      return await this.authedMutation<UserRecord>(idToken, api.padel.setMyAvatar, {
        storageId: storageId as Id<"_storage">,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async removeAvatar(idToken: string): Promise<UserRecord> {
    try {
      return await this.authedMutation<UserRecord>(idToken, api.padel.removeMyAvatar, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async createMatch(token: string, input: CreateMatchInput): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.createMatch, {
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
    try {
      return await this.getClientForToken(actorToken).query(api.padel.listHome, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listMine(token: string): Promise<MatchView[]> {
    try {
      return await this.authedQuery<MatchView[]>(token, api.padel.listMine, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listOpenFeed(filters: {
    modality?: Modality;
    window: OpenFeedWindow;
    now?: Date;
    actorToken?: string;
  }): Promise<MatchView[]> {
    try {
      return await this.getClientForToken(filters.actorToken).query(api.padel.listOpenFeed, {
        modality: filters.modality,
        window: filters.window,
        nowIso: filters.now?.toISOString(),
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getMatch(publicId: string, token?: string): Promise<MatchView> {
    try {
      return await this.getClientForToken(token).query(api.padel.getMatch, { publicId });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async followMatchWatch(publicId: string, token: string): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.followMatchWatch, { publicId });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async unfollowMatchWatch(publicId: string, token: string): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.unfollowMatchWatch, { publicId });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async join(publicId: string, token: string): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.join, { publicId });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async leave(publicId: string, token: string): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.leave, { publicId });
      this.events.emit(`match:${publicId}`);
      return match;
    } catch (error) {
      return normalizeError(error);
    }
  }

  async cancel(publicId: string, token: string): Promise<MatchView> {
    try {
      const match = await this.authedMutation<MatchView>(token, api.padel.cancel, { publicId });
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
    try {
      return await this.authedQuery<NotificationRecord[]>(token, api.padel.listNotificationsForMe, { limit });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getPushSubscriptionState(token: string): Promise<PushSubscriptionState> {
    try {
      return await this.authedQuery<PushSubscriptionState>(token, api.padel.getPushSubscriptionState, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async upsertPushSubscription(token: string, subscription: PushSubscriptionPayload): Promise<PushSubscriptionState> {
    try {
      return await this.authedMutation<PushSubscriptionState>(token, api.padel.upsertPushSubscription, {
        subscription,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async removePushSubscription(
    token: string,
    options?: { endpoint?: string; all?: boolean },
  ): Promise<PushSubscriptionState> {
    try {
      return await this.authedMutation<PushSubscriptionState>(token, api.padel.removePushSubscription, {
        endpoint: options?.endpoint,
        all: options?.all,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getTournamentBySlug(tournamentSlug: string, token?: string): Promise<PublicTournamentDetail> {
    try {
      return await this.getClientForToken(token).query(api.tournaments.getTournamentBySlug, { tournamentSlug });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getTournamentCategoryBySlug(
    tournamentSlug: string,
    categorySlug: string,
    token?: string,
  ): Promise<PublicTournamentCategoryDetail> {
    try {
      return await this.getClientForToken(token).query(api.tournaments.getTournamentCategoryBySlug, {
        tournamentSlug,
        categorySlug,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listAdminClubs(token: string): Promise<AdminClubMembership[]> {
    try {
      return await this.authedQuery<AdminClubMembership[]>(token, api.tournaments.listAdminClubs, {});
    } catch (error) {
      return normalizeError(error);
    }
  }

  async listAdminTournaments(token: string, clubSlug: string): Promise<AdminTournamentsResponse> {
    try {
      return await this.authedQuery<AdminTournamentsResponse>(token, api.tournaments.listAdminTournaments, { clubSlug });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async getAdminCategoryDashboard(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
  ): Promise<AdminCategoryDashboard> {
    try {
      return await this.authedQuery<AdminCategoryDashboard>(token, api.tournaments.getAdminCategoryDashboard, {
        tournamentSlug,
        categorySlug,
      });
    } catch (error) {
      return normalizeError(error);
    }
  }

  async createTournament(
    token: string,
    input: CreateTournamentInput,
  ): Promise<{ tournamentSlug: string; categorySlugs: string[] }> {
    try {
      return await this.authedMutation<{ tournamentSlug: string; categorySlugs: string[] }>(
        token,
        api.tournaments.createTournament,
        input,
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async generateTournamentGroups(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    input?: { groupCount?: number },
  ): Promise<{ groupCount: number; teamsCount: number }> {
    try {
      return await this.authedMutation<{ groupCount: number; teamsCount: number }>(
        token,
        api.tournaments.generateCategoryGroups,
        {
        tournamentSlug,
        categorySlug,
        groupCount: input?.groupCount,
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async moveTournamentTeamGroup(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    teamId: string,
    targetGroupName: string,
  ): Promise<{ ok: true }> {
    try {
      await this.authedMutation<void>(token, api.tournaments.moveCategoryTeamToGroup, {
        tournamentSlug,
        categorySlug,
        teamId: teamId as Id<"tournamentTeams">,
        targetGroupName,
      });
      return { ok: true };
    } catch (error) {
      return normalizeError(error);
    }
  }

  async generateTournamentGroupMatches(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
  ): Promise<{ groupsCount: number; matchesCount: number }> {
    try {
      return await this.authedMutation<{ groupsCount: number; matchesCount: number }>(
        token,
        api.tournaments.generateCategoryGroupMatches,
        {
        tournamentSlug,
        categorySlug,
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async reportTournamentGroupMatchResult(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    matchId: string,
    payload: { winnerTeamId: string; sets: TournamentSetScore[] },
  ): Promise<{ matchId: string; status: "completed" }> {
    try {
      return await this.authedMutation<{ matchId: string; status: "completed" }>(
        token,
        api.tournaments.reportCategoryGroupMatchResult,
        {
        tournamentSlug,
        categorySlug,
        matchId: matchId as Id<"tournamentMatches">,
        winnerTeamId: payload.winnerTeamId as Id<"tournamentTeams">,
        sets: payload.sets,
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async createTournamentFreeRound(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    payload: TournamentFreeRoundCreateRequest,
  ): Promise<{ roundId: string; matchesCount: number; byeCount: number }> {
    try {
      return await this.authedMutation<{ roundId: string; matchesCount: number; byeCount: number }>(
        token,
        api.tournaments.createCategoryFreeRound,
        {
          tournamentSlug,
          categorySlug,
          name: payload.name,
          sourceType: payload.sourceType,
          sourceRoundId: payload.sourceRoundId ? (payload.sourceRoundId as Id<"tournamentFreeRounds">) : undefined,
          manualPairings: payload.manualPairings?.map((pairing) => ({
            teamAId: pairing.teamAId as Id<"tournamentTeams">,
            teamBId: pairing.teamBId ? (pairing.teamBId as Id<"tournamentTeams">) : undefined,
          })),
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async reportTournamentFreeMatchResult(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    matchId: string,
    payload: TournamentFreeMatchResultInput,
  ): Promise<{ matchId: string; status: "completed" }> {
    try {
      return await this.authedMutation<{ matchId: string; status: "completed" }>(
        token,
        api.tournaments.reportCategoryFreeMatchResult,
        {
          tournamentSlug,
          categorySlug,
          matchId: matchId as Id<"tournamentFreeMatches">,
          winnerTeamId: payload.winnerTeamId as Id<"tournamentTeams">,
          scoreText: payload.scoreText,
          resultMeta: payload.resultMeta ?? undefined,
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async registerForCategory(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    payload: TournamentRegistrationRequest,
  ): Promise<{ registrationId: string; status: TournamentRegistrationStatus }> {
    try {
      const result = await this.authedMutation<{ registrationId: string; status: string }>(
        token,
        api.tournaments.registerForCategory,
        {
          tournamentSlug,
          categorySlug,
          teamName: payload.teamName,
          partnerPhone: payload.partnerPhone,
        },
      );
      return {
        registrationId: result.registrationId,
        status: result.status as TournamentRegistrationStatus,
      };
    } catch (error) {
      return normalizeError(error);
    }
  }

  async cancelTournamentRegistration(
    token: string,
    registrationId: string,
  ): Promise<{ registrationId: string; status: "cancelled" }> {
    try {
      return await this.authedMutation<{ registrationId: string; status: "cancelled" }>(
        token,
        api.tournaments.cancelMyRegistration,
        {
        registrationId: registrationId as Id<"tournamentRegistrations">,
        },
      );
    } catch (error) {
      return normalizeError(error);
    }
  }

  async setTournamentRegistrationStatus(
    token: string,
    registrationId: string,
    status: TournamentRegistrationStatus,
  ): Promise<{ registrationId: string; status: TournamentRegistrationStatus }> {
    try {
      const result = await this.authedMutation<{ registrationId: string; status: string }>(
        token,
        api.tournaments.setRegistrationStatus,
        {
          registrationId: registrationId as Id<"tournamentRegistrations">,
          status,
        },
      );
      return {
        registrationId: result.registrationId,
        status: result.status as TournamentRegistrationStatus,
      };
    } catch (error) {
      return normalizeError(error);
    }
  }

  async updateClubPaymentInstructions(
    token: string,
    clubSlug: string,
    paymentInstructions: string,
  ): Promise<{ ok: true }> {
    try {
      await this.authedMutation<void>(token, api.tournaments.updateClubPaymentInstructions, {
        clubSlug,
        paymentInstructions,
      });
      return { ok: true };
    } catch (error) {
      return normalizeError(error);
    }
  }

  async seedClubAndMembers(input: {
    clubSlug: string;
    clubName: string;
    adminFirebaseUids: string[];
    staffFirebaseUids: string[];
    seedToken: string;
  }): Promise<{ clubSlug: string; memberCount: number }> {
    try {
      return await this.client.mutation(api.tournaments.seedClubAndMembers, input);
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
