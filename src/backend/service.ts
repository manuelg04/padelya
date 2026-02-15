import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type { BackendPadelService } from "@/src/backend/contracts";
import { DomainError } from "@/src/domain/errors";
import {
  bogotaLocalToUtcIso,
  buildWhatsAppSummary,
  deriveMatchStatus,
  getOpenFeedUtcRange,
  isFutureBogotaLocalDateTime,
  isValidAlias,
  normalizeAlias,
  utcIsoToBogotaParts,
} from "@/src/domain/match";
import {
  type AdminCategoryDashboard,
  type AdminClubMembership,
  type AdminTournamentRegistrationItem,
  type AdminTournamentsResponse,
  type CreateMatchInput,
  type CreateTournamentInput,
  type EventLogRecord,
  MAX_PLAYERS,
  type MatchParticipant,
  type MatchRecord,
  type MatchView,
  type MatchViewParticipant,
  type Modality,
  type NotificationRecord,
  type OpenFeedWindow,
  type PublicTournamentCategoryDetail,
  type PublicTournamentDetail,
  type PushSubscriptionPayload,
  type PushSubscriptionState,
  type TournamentRegistrationRequest,
  type TournamentRegistrationStatus,
  type UserRecord,
} from "@/src/domain/types";
import { APP_TIMEZONE, USE_AUTH_EMULATOR } from "@/src/lib/env";

interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
}

interface OtpRecord {
  code: string;
  expiresAt: number;
  failedAttempts: number;
}

interface MatchWatcherRecord {
  matchId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface StoredNotificationRecord extends NotificationRecord {
  recipientUserId: string;
  dedupeKey?: string;
}

interface StoredPushSubscriptionRecord extends PushSubscriptionPayload {
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface ClubRecord {
  id: string;
  slug: string;
  name: string;
  paymentInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ClubMemberRecord {
  clubId: string;
  userId: string;
  role: "admin" | "staff";
  createdAt: string;
  updatedAt: string;
}

interface TournamentRecord {
  id: string;
  clubId: string;
  slug: string;
  name: string;
  startsAtUtc: string;
  timezone: string;
  description: string;
  prizes: string | null;
  priceInfo: string | null;
  posterUrl: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface TournamentCategoryRecord {
  id: string;
  tournamentId: string;
  slug: string;
  name: string;
  capacity: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TournamentTeamRecord {
  id: string;
  tournamentId: string;
  categoryId: string;
  primaryUserId: string;
  teamName: string;
  partnerPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TournamentRegistrationRecord {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  primaryUserId: string;
  status: TournamentRegistrationStatus;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  statusChangedByUserId: string | null;
}

const WATCHER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class AsyncLock {
  private queue = Promise.resolve();

  async withLock<T>(run: () => Promise<T> | T): Promise<T> {
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.queue;
    this.queue = previous.then(() => next);

    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PadelService implements BackendPadelService {
  private users = new Map<string, UserRecord>();
  private userByPhone = new Map<string, string>();
  private userByFirebaseUid = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private otpByPhone = new Map<string, OtpRecord>();
  private matches = new Map<string, MatchRecord>();
  private matchByPublicId = new Map<string, string>();
  private participantsByMatch = new Map<string, Map<string, MatchParticipant>>();
  private watchersByMatch = new Map<string, Map<string, MatchWatcherRecord>>();
  private notificationsByUser = new Map<string, StoredNotificationRecord[]>();
  private pushSubscriptionsByUser = new Map<string, Map<string, StoredPushSubscriptionRecord>>();
  private clubs = new Map<string, ClubRecord>();
  private clubBySlug = new Map<string, string>();
  private clubMembersByClub = new Map<string, Map<string, ClubMemberRecord>>();
  private tournaments = new Map<string, TournamentRecord>();
  private tournamentBySlug = new Map<string, string>();
  private categoriesByTournament = new Map<string, Map<string, TournamentCategoryRecord>>();
  private categoryBySlug = new Map<string, Map<string, string>>();
  private teams = new Map<string, TournamentTeamRecord>();
  private registrations = new Map<string, TournamentRegistrationRecord>();
  private registrationsByCategory = new Map<string, Map<string, TournamentRegistrationRecord>>();
  private registrationsByPrimary = new Map<string, Map<string, TournamentRegistrationRecord>>();
  private locksByMatchId = new Map<string, AsyncLock>();
  private logs: EventLogRecord[] = [];
  private events = new EventEmitter();

  resetForTests() {
    this.users.clear();
    this.userByPhone.clear();
    this.userByFirebaseUid.clear();
    this.sessions.clear();
    this.otpByPhone.clear();
    this.matches.clear();
    this.matchByPublicId.clear();
    this.participantsByMatch.clear();
    this.watchersByMatch.clear();
    this.notificationsByUser.clear();
    this.pushSubscriptionsByUser.clear();
    this.clubs.clear();
    this.clubBySlug.clear();
    this.clubMembersByClub.clear();
    this.tournaments.clear();
    this.tournamentBySlug.clear();
    this.categoriesByTournament.clear();
    this.categoryBySlug.clear();
    this.teams.clear();
    this.registrations.clear();
    this.registrationsByCategory.clear();
    this.registrationsByPrimary.clear();
    this.locksByMatchId.clear();
    this.logs = [];
  }

  private getLock(matchId: string): AsyncLock {
    let lock = this.locksByMatchId.get(matchId);
    if (!lock) {
      lock = new AsyncLock();
      this.locksByMatchId.set(matchId, lock);
    }
    return lock;
  }

  private log(event: EventLogRecord) {
    this.logs.push(event);
  }

  getEventLogs(): EventLogRecord[] {
    return [...this.logs];
  }

  requestOtp(phoneE164: string): { expiresInSeconds: number } {
    const code = USE_AUTH_EMULATOR ? "123456" : `${Math.floor(100000 + Math.random() * 900000)}`;
    this.otpByPhone.set(phoneE164, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      failedAttempts: 0,
    });
    this.log({
      type: "otp_request_started",
      createdAt: nowIso(),
      metadata: { provider: USE_AUTH_EMULATOR ? "emulator" : "firebase_web" },
    });
    return { expiresInSeconds: 300 };
  }

  verifyOtp(phoneE164: string, code: string): { token: string; user: UserRecord } {
    const otp = this.otpByPhone.get(phoneE164);
    if (!otp || otp.expiresAt < Date.now()) {
      this.log({ type: "otp_failed", createdAt: nowIso(), metadata: { reason: "expired" } });
      throw new DomainError("OTP_EXPIRED", "El código expiró. Solicita uno nuevo.");
    }
    if (otp.code !== code) {
      otp.failedAttempts += 1;
      this.log({ type: "otp_failed", createdAt: nowIso(), metadata: { reason: "invalid" } });
      throw new DomainError("OTP_INVALID", "Código incorrecto.");
    }

    let userId = this.userByPhone.get(phoneE164);
    if (!userId) {
      userId = randomUUID();
      const createdAt = nowIso();
      this.users.set(userId, {
        id: userId,
        firebaseUid: `mock:${phoneE164}`,
        phoneE164,
        alias: null,
        avatarUrl: null,
        createdAt,
        updatedAt: createdAt,
      });
      this.userByPhone.set(phoneE164, userId);
      this.userByFirebaseUid.set(`mock:${phoneE164}`, userId);
    }

    const token = randomUUID();
    this.sessions.set(token, { token, userId, createdAt: nowIso() });
    const user = this.mustGetUser(userId);
    this.log({ type: "otp_verified", createdAt: nowIso(), actorUserId: userId });
    return { token, user };
  }

  getUserByToken(token: string): UserRecord {
    const firebaseActorId = this.resolveFirebaseActorId(token);
    if (firebaseActorId) {
      return this.mustGetUser(firebaseActorId);
    }

    const session = this.sessions.get(token);
    if (!session) {
      throw new DomainError("UNAUTHORIZED", "Sesión inválida.");
    }
    return this.mustGetUser(session.userId);
  }

  updateAlias(token: string, alias: string): UserRecord {
    if (!isValidAlias(alias)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "El alias debe tener entre 3 y 24 caracteres (letras, números y espacios).",
      );
    }
    const user = this.getUserByToken(token);
    const now = nowIso();
    const normalizedAlias = normalizeAlias(alias);
    const next: UserRecord = {
      ...user,
      alias: normalizedAlias,
      updatedAt: now,
    };
    this.users.set(user.id, next);
    return next;
  }

  async generateAvatarUploadUrl(token: string): Promise<string> {
    void token;
    throw new DomainError("VALIDATION_ERROR", "Foto disponible con backend Convex.");
  }

  async setAvatar(token: string, storageId: string): Promise<UserRecord> {
    void token;
    void storageId;
    throw new DomainError("VALIDATION_ERROR", "Foto disponible con backend Convex.");
  }

  async removeAvatar(token: string): Promise<UserRecord> {
    void token;
    throw new DomainError("VALIDATION_ERROR", "Foto disponible con backend Convex.");
  }

  createMatch(token: string, input: CreateMatchInput): MatchView {
    const actor = this.getUserByToken(token);
    this.ensureAlias(actor);
    if (!isFutureBogotaLocalDateTime(input.startsAtLocal)) {
      throw new DomainError("VALIDATION_ERROR", "Selecciona una fecha futura en bloques exactos de 1 hora.");
    }

    const now = nowIso();
    const matchId = randomUUID();
    const publicId = randomUUID().replace(/-/g, "").slice(0, 10);
    const startsAtUtc = bogotaLocalToUtcIso(input.startsAtLocal);

    const match: MatchRecord = {
      id: matchId,
      publicId,
      organizerUserId: actor.id,
      club: input.club.trim(),
      startsAtUtc,
      timezone: APP_TIMEZONE,
      category: input.category.trim(),
      modality: input.modality,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.matches.set(matchId, match);
    this.matchByPublicId.set(publicId, matchId);

    const participants = new Map<string, MatchParticipant>();
    participants.set(actor.id, {
      matchId,
      userId: actor.id,
      joinedAt: now,
    });
    this.participantsByMatch.set(matchId, participants);

    this.log({ type: "match_created", actorUserId: actor.id, matchId, createdAt: now });
    this.events.emit(`match:${publicId}`);
    return this.toMatchView(match, actor.id);
  }

  listHome(actorToken?: string): MatchView[] {
    const actorId = actorToken ? this.resolveActorId(actorToken) : null;
    return [...this.matches.values()]
      .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))
      .map((match) => this.toMatchView(match, actorId));
  }

  listMine(token: string): MatchView[] {
    const actor = this.getUserByToken(token);
    return [...this.matches.values()]
      .filter((match) => {
        if (match.organizerUserId === actor.id) {
          return true;
        }
        const participants = this.participantsByMatch.get(match.id);
        return Boolean(participants?.has(actor.id));
      })
      .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))
      .map((match) => this.toMatchView(match, actor.id));
  }

  listOpenFeed(filters: { modality?: Modality; window: OpenFeedWindow; now?: Date }): MatchView[] {
    const now = filters.now ?? new Date();
    const { fromInclusiveUtc, toInclusiveUtc } = getOpenFeedUtcRange(filters.window, now);

    return [...this.matches.values()]
      .filter((match) => {
        if (match.canceledAt) {
          return false;
        }

        if (filters.modality && match.modality !== filters.modality) {
          return false;
        }

        if (match.startsAtUtc < fromInclusiveUtc || match.startsAtUtc > toInclusiveUtc) {
          return false;
        }

        const participantsCount = this.mustGetParticipants(match.id).size;
        return participantsCount < MAX_PLAYERS;
      })
      .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))
      .map((match) => this.toMatchView(match, null));
  }

  getMatch(publicId: string, token?: string): MatchView {
    const actorId = token ? this.resolveActorId(token) : null;
    const match = this.mustGetMatchByPublicId(publicId);
    return this.toMatchView(match, actorId);
  }

  async followMatchWatch(publicId: string, token: string): Promise<MatchView> {
    const actor = this.getUserByToken(token);
    const match = this.mustGetMatchByPublicId(publicId);

    return this.getLock(match.id).withLock(() => {
      const participants = this.mustGetParticipants(match.id);
      const status = deriveMatchStatus(match.startsAtUtc, participants.size, match.canceledAt, new Date());
      if (match.canceledAt) {
        throw new DomainError("MATCH_CANCELED", "El partido está cancelado.");
      }
      if (status === "no_se_armo") {
        throw new DomainError("VALIDATION_ERROR", "Este partido no se armó.");
      }
      if (match.organizerUserId === actor.id) {
        throw new DomainError("VALIDATION_ERROR", "El organizador no puede activar avisos en su propio partido.");
      }
      if (participants.has(actor.id)) {
        throw new DomainError("VALIDATION_ERROR", "Ya estás en este partido.");
      }
      if (participants.size !== MAX_PLAYERS) {
        throw new DomainError("VALIDATION_ERROR", "Solo puedes activar avisos cuando el partido está lleno.");
      }

      const now = nowIso();
      const expiresAt = this.getWatcherExpiresAt(match.startsAtUtc, now);
      const watchers = this.mustGetWatchers(match.id);
      watchers.set(actor.id, {
        matchId: match.id,
        userId: actor.id,
        createdAt: now,
        expiresAt,
      });

      this.events.emit(`match:${publicId}`);
      return this.toMatchView(match, actor.id);
    });
  }

  async unfollowMatchWatch(publicId: string, token: string): Promise<MatchView> {
    const actor = this.getUserByToken(token);
    const match = this.mustGetMatchByPublicId(publicId);

    return this.getLock(match.id).withLock(() => {
      this.removeWatcher(match.id, actor.id);
      this.events.emit(`match:${publicId}`);
      return this.toMatchView(match, actor.id);
    });
  }

  listNotifications(token: string, limit = 50): NotificationRecord[] {
    const actor = this.getUserByToken(token);
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 50;
    const safeLimit = Math.max(1, Math.min(parsedLimit, 100));
    const notifications = this.notificationsByUser.get(actor.id) ?? [];

    return [...notifications]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        matchPublicId: notification.matchPublicId,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
        isRead: notification.isRead,
      }));
  }

  async getPushSubscriptionState(token: string): Promise<PushSubscriptionState> {
    const actor = this.getUserByToken(token);
    return this.toPushSubscriptionState(actor.id);
  }

  async upsertPushSubscription(token: string, subscription: PushSubscriptionPayload): Promise<PushSubscriptionState> {
    const actor = this.getUserByToken(token);
    const endpoint = subscription.endpoint.trim();
    const p256dh = subscription.keys.p256dh.trim();
    const auth = subscription.keys.auth.trim();

    if (!endpoint || !p256dh || !auth) {
      throw new DomainError("VALIDATION_ERROR", "Suscripción push inválida.");
    }

    const now = nowIso();
    const byEndpoint = this.mustGetPushSubscriptionsByUser(actor.id);
    const existing = byEndpoint.get(endpoint);

    byEndpoint.set(endpoint, {
      endpoint,
      keys: { p256dh, auth },
      expirationTime: subscription.expirationTime,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      isActive: true,
    });

    return this.toPushSubscriptionState(actor.id);
  }

  async removePushSubscription(
    token: string,
    options?: { endpoint?: string; all?: boolean },
  ): Promise<PushSubscriptionState> {
    const actor = this.getUserByToken(token);
    const byEndpoint = this.mustGetPushSubscriptionsByUser(actor.id);
    const now = nowIso();

    if (options?.all || !options?.endpoint) {
      for (const [endpoint, row] of byEndpoint.entries()) {
        byEndpoint.set(endpoint, {
          ...row,
          isActive: false,
          updatedAt: now,
        });
      }
      return this.toPushSubscriptionState(actor.id);
    }

    const endpoint = options.endpoint.trim();
    const existing = byEndpoint.get(endpoint);
    if (existing) {
      byEndpoint.set(endpoint, {
        ...existing,
        isActive: false,
        updatedAt: now,
      });
    }

    return this.toPushSubscriptionState(actor.id);
  }

  async join(publicId: string, token: string): Promise<MatchView> {
    const actor = this.getUserByToken(token);
    this.ensureAlias(actor);

    const match = this.mustGetMatchByPublicId(publicId);
    return this.getLock(match.id).withLock(async () => {
      const participants = this.mustGetParticipants(match.id);
      const joinedAt = nowIso();
      const status = deriveMatchStatus(match.startsAtUtc, participants.size, match.canceledAt, new Date());
      if (match.canceledAt) {
        throw new DomainError("MATCH_CANCELED", "El partido está cancelado.");
      }
      if (status === "no_se_armo") {
        throw new DomainError("VALIDATION_ERROR", "Este partido no se armó.");
      }
      if (participants.has(actor.id)) {
        throw new DomainError("ALREADY_JOINED", "Ya estás confirmado en este partido.");
      }
      if (participants.size >= MAX_PLAYERS) {
        throw new DomainError("MATCH_FULL", "El partido ya está completo.");
      }

      participants.set(actor.id, {
        matchId: match.id,
        userId: actor.id,
        joinedAt,
      });
      this.removeWatcher(match.id, actor.id);
      this.log({ type: "match_joined", actorUserId: actor.id, matchId: match.id, createdAt: joinedAt });
      this.events.emit(`match:${publicId}`);
      return this.toMatchView(match, actor.id);
    });
  }

  async leave(publicId: string, token: string): Promise<MatchView> {
    const actor = this.getUserByToken(token);
    const match = this.mustGetMatchByPublicId(publicId);

    return this.getLock(match.id).withLock(async () => {
      const participants = this.mustGetParticipants(match.id);
      const participantsBefore = participants.size;
      const status = deriveMatchStatus(match.startsAtUtc, participants.size, match.canceledAt, new Date());
      if (match.canceledAt) {
        throw new DomainError("MATCH_CANCELED", "El partido está cancelado.");
      }
      if (status === "no_se_armo") {
        throw new DomainError("VALIDATION_ERROR", "Este partido no se armó.");
      }
      if (match.organizerUserId === actor.id) {
        throw new DomainError(
          "ORGANIZER_MUST_CANCEL",
          "El organizador no puede salir. Debe cancelar el partido.",
        );
      }
      if (!participants.has(actor.id)) {
        throw new DomainError("NOT_JOINED", "No estabas en este partido.");
      }
      const now = nowIso();
      participants.delete(actor.id);
      this.removeWatcher(match.id, actor.id);

      if (participantsBefore === MAX_PLAYERS && participants.size === MAX_PLAYERS - 1) {
        const { date, time } = utcIsoToBogotaParts(match.startsAtUtc);
        const watcherUserIds = this.getActiveWatcherUserIds({
          match,
          participants,
          now,
        });

        this.notifyUsers({
          recipientUserIds: watcherUserIds,
          type: "CUPO_LIBERADO",
          title: "Cupo liberado",
          message: `${match.club} · ${date} ${time}`,
          matchPublicId: match.publicId,
          dedupeKeyBase: `release:${match.id}`,
          createdAt: now,
        });
      }

      this.log({ type: "match_left", actorUserId: actor.id, matchId: match.id, createdAt: now });
      this.events.emit(`match:${publicId}`);
      return this.toMatchView(match, actor.id);
    });
  }

  async cancel(publicId: string, token: string): Promise<MatchView> {
    const actor = this.getUserByToken(token);
    const match = this.mustGetMatchByPublicId(publicId);

    return this.getLock(match.id).withLock(async () => {
      const participants = this.mustGetParticipants(match.id);
      if (match.organizerUserId !== actor.id) {
        throw new DomainError("UNAUTHORIZED", "Solo el organizador puede cancelar.");
      }
      const canceledAt = nowIso();
      if (!match.canceledAt) {
        const next = {
          ...match,
          canceledAt,
          updatedAt: canceledAt,
        };
        this.matches.set(match.id, next);

        const recipientUserIds = new Set<string>([...participants.keys()]);
        const watcherUserIds = this.getActiveWatcherUserIds({
          match: next,
          participants,
          now: canceledAt,
        });
        for (const watcherUserId of watcherUserIds) {
          recipientUserIds.add(watcherUserId);
        }

        this.notifyUsers({
          recipientUserIds: [...recipientUserIds],
          type: "PARTIDO_CANCELADO",
          title: "Partido cancelado",
          message: `${match.club} fue cancelado.`,
          matchPublicId: match.publicId,
          dedupeKeyBase: `cancel:${match.id}`,
          createdAt: canceledAt,
        });
      }

      this.watchersByMatch.delete(match.id);
      this.log({ type: "match_canceled", actorUserId: actor.id, matchId: match.id, createdAt: canceledAt });
      this.events.emit(`match:${publicId}`);
      return this.getMatch(publicId, token);
    });
  }

  getWhatsAppSummary(publicId: string, token?: string, origin?: string): string {
    const match = this.getMatch(publicId, token);
    const shareUrl = origin ? `${origin}/partido/${publicId}` : `/partido/${publicId}`;
    return buildWhatsAppSummary(match, shareUrl);
  }

  subscribeToMatch(publicId: string, listener: () => void): () => void {
    const eventName = `match:${publicId}`;
    this.events.on(eventName, listener);
    return () => {
      this.events.off(eventName, listener);
    };
  }

  async getTournamentBySlug(tournamentSlug: string): Promise<PublicTournamentDetail> {
    const tournament = this.mustGetTournamentBySlug(tournamentSlug);
    const club = this.mustGetClub(tournament.clubId);
    const categories = this.listCategoriesForTournament(tournament.id);

    return {
      tournament: {
        id: tournament.id,
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
        description: tournament.description,
        prizes: tournament.prizes,
        priceInfo: tournament.priceInfo,
        posterUrl: tournament.posterUrl,
      },
      club: {
        id: club.id,
        slug: club.slug,
        name: club.name,
      },
      categories: categories.map((category) => {
        const counts = this.getCategoryCounts(category.id);
        return {
          id: category.id,
          slug: category.slug,
          name: category.name,
          capacity: category.capacity,
          note: category.note,
          counts,
          confirmedLabel: `${counts.confirmed}/${category.capacity}`,
        };
      }),
    };
  }

  async getTournamentCategoryBySlug(
    tournamentSlug: string,
    categorySlug: string,
    token?: string,
  ): Promise<PublicTournamentCategoryDetail> {
    const tournament = this.mustGetTournamentBySlug(tournamentSlug);
    const club = this.mustGetClub(tournament.clubId);
    const category = this.mustGetCategoryBySlug(tournament.id, categorySlug);
    const counts = this.getCategoryCounts(category.id);

    let myRegistration: PublicTournamentCategoryDetail["myRegistration"] = null;
    if (token) {
      try {
        const actor = this.getUserByToken(token);
        const active = this.findActiveRegistration(category.id, actor.id);
        if (active) {
          const team = this.teams.get(active.teamId);
          myRegistration = {
            id: active.id,
            status: active.status,
            teamName: team?.teamName ?? "",
            partnerPhone: team?.partnerPhone ?? null,
            createdAt: active.createdAt,
            updatedAt: active.updatedAt,
          };
        }
      } catch {
        myRegistration = null;
      }
    }

    return {
      tournament: {
        id: tournament.id,
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
        description: tournament.description,
        prizes: tournament.prizes,
        priceInfo: tournament.priceInfo,
        posterUrl: tournament.posterUrl,
      },
      club: {
        id: club.id,
        slug: club.slug,
        name: club.name,
      },
      category: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        capacity: category.capacity,
        note: category.note,
        counts,
      },
      myRegistration,
    };
  }

  async listAdminClubs(token: string): Promise<AdminClubMembership[]> {
    const actor = this.getUserByToken(token);
    const memberships: AdminClubMembership[] = [];
    for (const [clubId, membersByUser] of this.clubMembersByClub.entries()) {
      const membership = membersByUser.get(actor.id);
      if (!membership) {
        continue;
      }
      const club = this.clubs.get(clubId);
      if (!club) {
        continue;
      }

      memberships.push({
        clubSlug: club.slug,
        clubName: club.name,
        role: membership.role,
        paymentInstructions: club.paymentInstructions,
      });
    }

    memberships.sort((a, b) => a.clubName.localeCompare(b.clubName));
    return memberships;
  }

  async listAdminTournaments(token: string, clubSlug: string): Promise<AdminTournamentsResponse> {
    const actor = this.getUserByToken(token);
    const club = this.mustGetClubBySlug(clubSlug);
    this.assertClubAdmin(actor.id, club.id);

    const tournaments = [...this.tournaments.values()]
      .filter((tournament) => tournament.clubId === club.id)
      .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))
      .map((tournament) => {
        const categories = this.listCategoriesForTournament(tournament.id);
        return {
          id: tournament.id,
          slug: tournament.slug,
          name: tournament.name,
          startsAtUtc: tournament.startsAtUtc,
          timezone: tournament.timezone,
          description: tournament.description,
          categoriesCount: categories.length,
          categories: categories.map((category) => ({
            slug: category.slug,
            name: category.name,
            capacity: category.capacity,
          })),
        };
      });

    return {
      club: {
        slug: club.slug,
        name: club.name,
      },
      tournaments,
    };
  }

  async getAdminCategoryDashboard(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
  ): Promise<AdminCategoryDashboard> {
    const actor = this.getUserByToken(token);
    const tournament = this.mustGetTournamentBySlug(tournamentSlug);
    const club = this.mustGetClub(tournament.clubId);
    this.assertClubAdmin(actor.id, club.id);

    const category = this.mustGetCategoryBySlug(tournament.id, categorySlug);
    const counts = this.getCategoryCounts(category.id);
    const rows = this.listRegistrationsForCategory(category.id).map((registration) => {
      const team = this.teams.get(registration.teamId);
      const user = this.users.get(registration.primaryUserId);

      const row: AdminTournamentRegistrationItem = {
        id: registration.id,
        status: registration.status,
        createdAt: registration.createdAt,
        updatedAt: registration.updatedAt,
        primaryUserId: registration.primaryUserId,
        primaryAlias: user?.alias ?? null,
        primaryPhone: user?.phoneE164 ?? null,
        teamName: team?.teamName ?? "",
        partnerPhone: team?.partnerPhone ?? null,
      };
      return row;
    });

    return {
      tournament: {
        id: tournament.id,
        slug: tournament.slug,
        name: tournament.name,
        startsAtUtc: tournament.startsAtUtc,
        timezone: tournament.timezone,
      },
      club: {
        slug: club.slug,
        name: club.name,
        paymentInstructions: club.paymentInstructions,
      },
      category: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        capacity: category.capacity,
        note: category.note,
        counts,
      },
      registrations: {
        pending: rows.filter((row) => row.status === "pending"),
        confirmed: rows.filter((row) => row.status === "confirmed"),
        waitlist: rows.filter((row) => row.status === "waitlist"),
        cancelled: rows.filter((row) => row.status === "cancelled"),
      },
    };
  }

  async createTournament(
    token: string,
    input: CreateTournamentInput,
  ): Promise<{ tournamentSlug: string; categorySlugs: string[] }> {
    const actor = this.getUserByToken(token);
    const club = this.mustGetClubBySlug(input.clubSlug);
    this.assertClubAdmin(actor.id, club.id);

    if (!input.categories.length) {
      throw new DomainError("VALIDATION_ERROR", "Debes crear al menos una categoría.");
    }

    const now = nowIso();
    const tournamentSlug = this.makeUniqueSlug(input.name, (slug) => this.tournamentBySlug.has(slug));
    const tournamentId = randomUUID();
    const tournament: TournamentRecord = {
      id: tournamentId,
      clubId: club.id,
      slug: tournamentSlug,
      name: input.name.trim(),
      startsAtUtc: bogotaLocalToUtcIso(input.startsAtLocal),
      timezone: input.timezone?.trim() || APP_TIMEZONE,
      description: input.description.trim(),
      prizes: input.prizes?.trim() || null,
      priceInfo: input.priceInfo?.trim() || null,
      posterUrl: input.posterUrl?.trim() || null,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    };

    this.tournaments.set(tournamentId, tournament);
    this.tournamentBySlug.set(tournamentSlug, tournamentId);
    this.categoriesByTournament.set(tournamentId, new Map());
    this.categoryBySlug.set(tournamentId, new Map());

    const categorySlugs: string[] = [];
    for (const item of input.categories) {
      if (!Number.isInteger(item.capacity) || item.capacity <= 0) {
        throw new DomainError("VALIDATION_ERROR", "El cupo debe ser mayor a 0.");
      }

      const categoryId = randomUUID();
      const categorySlug = this.makeUniqueSlug(item.name, (slug) =>
        this.categoryBySlug.get(tournamentId)?.has(slug) ?? false,
      );
      const category: TournamentCategoryRecord = {
        id: categoryId,
        tournamentId,
        slug: categorySlug,
        name: item.name.trim(),
        capacity: item.capacity,
        note: item.note?.trim() || null,
        createdAt: now,
        updatedAt: now,
      };

      this.categoriesByTournament.get(tournamentId)?.set(categoryId, category);
      this.categoryBySlug.get(tournamentId)?.set(categorySlug, categoryId);
      this.registrationsByCategory.set(categoryId, new Map());
      categorySlugs.push(categorySlug);
    }

    return {
      tournamentSlug,
      categorySlugs,
    };
  }

  async registerForCategory(
    token: string,
    tournamentSlug: string,
    categorySlug: string,
    payload: TournamentRegistrationRequest,
  ): Promise<{ registrationId: string; status: TournamentRegistrationStatus }> {
    const actor = this.getUserByToken(token);
    this.ensureAlias(actor);

    const tournament = this.mustGetTournamentBySlug(tournamentSlug);
    const category = this.mustGetCategoryBySlug(tournament.id, categorySlug);

    const active = this.findActiveRegistration(category.id, actor.id);
    if (active) {
      throw new DomainError("TOURNAMENT_ALREADY_REGISTERED", "Ya tienes una inscripción activa en esta categoría.");
    }

    const counts = this.getCategoryCounts(category.id);
    const status: TournamentRegistrationStatus =
      counts.pending + counts.confirmed >= category.capacity ? "waitlist" : "pending";
    const now = nowIso();

    const teamId = randomUUID();
    const team: TournamentTeamRecord = {
      id: teamId,
      tournamentId: tournament.id,
      categoryId: category.id,
      primaryUserId: actor.id,
      teamName: payload.teamName.trim(),
      partnerPhone: payload.partnerPhone?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    this.teams.set(teamId, team);

    const registrationId = randomUUID();
    const registration: TournamentRegistrationRecord = {
      id: registrationId,
      tournamentId: tournament.id,
      categoryId: category.id,
      teamId,
      primaryUserId: actor.id,
      status,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancelledByUserId: null,
      statusChangedByUserId: actor.id,
    };

    this.registrations.set(registrationId, registration);
    this.registrationsByCategory.get(category.id)?.set(registrationId, registration);

    let byPrimary = this.registrationsByPrimary.get(category.id);
    if (!byPrimary) {
      byPrimary = new Map();
      this.registrationsByPrimary.set(category.id, byPrimary);
    }
    byPrimary.set(actor.id, registration);

    return {
      registrationId,
      status,
    };
  }

  async cancelTournamentRegistration(
    token: string,
    registrationId: string,
  ): Promise<{ registrationId: string; status: "cancelled" }> {
    const actor = this.getUserByToken(token);
    const registration = this.registrations.get(registrationId);
    if (!registration) {
      throw new DomainError("NOT_FOUND", "Inscripción no encontrada.");
    }
    if (registration.primaryUserId !== actor.id) {
      throw new DomainError("FORBIDDEN", "No puedes cancelar esta inscripción.");
    }

    if (registration.status !== "cancelled") {
      const now = nowIso();
      const next: TournamentRegistrationRecord = {
        ...registration,
        status: "cancelled",
        updatedAt: now,
        cancelledAt: now,
        cancelledByUserId: actor.id,
        statusChangedByUserId: actor.id,
      };
      this.registrations.set(registrationId, next);
      this.registrationsByCategory.get(registration.categoryId)?.set(registrationId, next);
      this.registrationsByPrimary.get(registration.categoryId)?.set(actor.id, next);
    }

    return {
      registrationId,
      status: "cancelled",
    };
  }

  async setTournamentRegistrationStatus(
    token: string,
    registrationId: string,
    status: TournamentRegistrationStatus,
  ): Promise<{ registrationId: string; status: TournamentRegistrationStatus }> {
    const actor = this.getUserByToken(token);
    const registration = this.registrations.get(registrationId);
    if (!registration) {
      throw new DomainError("NOT_FOUND", "Inscripción no encontrada.");
    }

    const tournament = this.tournaments.get(registration.tournamentId);
    const category = this.findCategoryById(registration.categoryId);
    if (!tournament || !category) {
      throw new DomainError("NOT_FOUND", "Categoría no encontrada.");
    }

    this.assertClubAdmin(actor.id, tournament.clubId);

    if (registration.status === status) {
      return { registrationId, status };
    }

    if (status === "confirmed" && registration.status !== "confirmed") {
      const counts = this.getCategoryCounts(category.id);
      if (counts.confirmed >= category.capacity) {
        throw new DomainError("TOURNAMENT_CAPACITY_REACHED", "No hay cupos para confirmar.");
      }
    }

    if (status === "pending" && registration.status !== "pending" && registration.status !== "confirmed") {
      const counts = this.getCategoryCounts(category.id);
      if (counts.pending + counts.confirmed >= category.capacity) {
        throw new DomainError("TOURNAMENT_CAPACITY_REACHED", "No hay cupos para dejar pendiente.");
      }
    }

    const now = nowIso();
    const next: TournamentRegistrationRecord = {
      ...registration,
      status,
      updatedAt: now,
      cancelledAt: status === "cancelled" ? now : null,
      cancelledByUserId: status === "cancelled" ? actor.id : null,
      statusChangedByUserId: actor.id,
    };

    this.registrations.set(registrationId, next);
    this.registrationsByCategory.get(registration.categoryId)?.set(registrationId, next);
    this.registrationsByPrimary.get(registration.categoryId)?.set(registration.primaryUserId, next);

    return {
      registrationId,
      status,
    };
  }

  async updateClubPaymentInstructions(
    token: string,
    clubSlug: string,
    paymentInstructions: string,
  ): Promise<{ ok: true }> {
    const actor = this.getUserByToken(token);
    const club = this.mustGetClubBySlug(clubSlug);
    this.assertClubAdmin(actor.id, club.id);

    this.clubs.set(club.id, {
      ...club,
      paymentInstructions: paymentInstructions.trim() || null,
      updatedAt: nowIso(),
    });

    return { ok: true };
  }

  async seedClubAndMembers(input: {
    clubSlug: string;
    clubName: string;
    adminFirebaseUids: string[];
    staffFirebaseUids: string[];
    seedToken: string;
  }): Promise<{ clubSlug: string; memberCount: number }> {
    const expectedToken = process.env.TOURNAMENTS_SEED_TOKEN ?? "test-seed-token";
    if (input.seedToken !== expectedToken) {
      throw new DomainError("UNAUTHORIZED", "Seed token inválido.");
    }

    const now = nowIso();
    const normalizedSlug = this.slugify(input.clubSlug);
    let club = this.getClubBySlug(normalizedSlug);
    if (!club) {
      const clubId = randomUUID();
      club = {
        id: clubId,
        slug: normalizedSlug,
        name: input.clubName.trim(),
        paymentInstructions: null,
        createdAt: now,
        updatedAt: now,
      };
      this.clubs.set(clubId, club);
      this.clubBySlug.set(normalizedSlug, clubId);
      this.clubMembersByClub.set(clubId, new Map());
    } else if (club.name !== input.clubName.trim()) {
      club = {
        ...club,
        name: input.clubName.trim(),
        updatedAt: now,
      };
      this.clubs.set(club.id, club);
    }

    const admins = new Set(input.adminFirebaseUids.map((uid) => uid.trim()).filter(Boolean));
    const staff = new Set(input.staffFirebaseUids.map((uid) => uid.trim()).filter(Boolean));
    const members = this.mustGetClubMembers(club.id);

    let memberCount = 0;
    for (const uid of admins) {
      const user = this.getOrCreateUserByFirebaseUid(uid);
      members.set(user.id, {
        clubId: club.id,
        userId: user.id,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      });
      memberCount += 1;
    }

    for (const uid of staff) {
      if (admins.has(uid)) {
        continue;
      }
      const user = this.getOrCreateUserByFirebaseUid(uid);
      members.set(user.id, {
        clubId: club.id,
        userId: user.id,
        role: "staff",
        createdAt: now,
        updatedAt: now,
      });
      memberCount += 1;
    }

    return {
      clubSlug: club.slug,
      memberCount,
    };
  }

  private getWatcherExpiresAt(startsAtUtc: string, now: string): string {
    const capByNow = new Date(new Date(now).getTime() + WATCHER_TTL_MS).toISOString();
    return startsAtUtc < capByNow ? startsAtUtc : capByNow;
  }

  private mustGetWatchers(matchId: string): Map<string, MatchWatcherRecord> {
    let watchers = this.watchersByMatch.get(matchId);
    if (!watchers) {
      watchers = new Map();
      this.watchersByMatch.set(matchId, watchers);
    }
    return watchers;
  }

  private removeWatcher(matchId: string, userId: string) {
    const watchers = this.watchersByMatch.get(matchId);
    if (!watchers) {
      return;
    }
    watchers.delete(userId);
    if (watchers.size === 0) {
      this.watchersByMatch.delete(matchId);
    }
  }

  private getActiveWatcherUserIds(input: {
    match: MatchRecord;
    participants: Map<string, MatchParticipant>;
    now: string;
  }): string[] {
    const watchers = this.watchersByMatch.get(input.match.id);
    if (!watchers) {
      return [];
    }

    const activeUserIds: string[] = [];
    for (const watcher of watchers.values()) {
      if (watcher.expiresAt <= input.now) {
        watchers.delete(watcher.userId);
        continue;
      }
      if (input.participants.has(watcher.userId)) {
        watchers.delete(watcher.userId);
        continue;
      }
      activeUserIds.push(watcher.userId);
    }

    if (watchers.size === 0) {
      this.watchersByMatch.delete(input.match.id);
    }

    return activeUserIds;
  }

  private notifyUsers(input: {
    recipientUserIds: string[];
    type: NotificationRecord["type"];
    title: string;
    message: string;
    matchPublicId: string | null;
    createdAt: string;
    dedupeKeyBase?: string;
  }) {
    const uniqueUserIds = [...new Set(input.recipientUserIds)];
    for (const userId of uniqueUserIds) {
      const dedupeKey = input.dedupeKeyBase ? `${input.dedupeKeyBase}:${userId}` : undefined;
      this.notifyUser({
        recipientUserId: userId,
        type: input.type,
        title: input.title,
        message: input.message,
        matchPublicId: input.matchPublicId,
        createdAt: input.createdAt,
        dedupeKey,
      });
    }
  }

  private notifyUser(input: {
    recipientUserId: string;
    type: NotificationRecord["type"];
    title: string;
    message: string;
    matchPublicId: string | null;
    createdAt: string;
    dedupeKey?: string;
  }) {
    const notifications = this.notificationsByUser.get(input.recipientUserId) ?? [];
    if (input.dedupeKey && notifications.some((notification) => notification.dedupeKey === input.dedupeKey)) {
      return;
    }

    notifications.push({
      id: randomUUID(),
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      message: input.message,
      matchPublicId: input.matchPublicId,
      createdAt: input.createdAt,
      readAt: null,
      isRead: false,
      dedupeKey: input.dedupeKey,
    });
    this.notificationsByUser.set(input.recipientUserId, notifications);
  }

  private mustGetPushSubscriptionsByUser(userId: string): Map<string, StoredPushSubscriptionRecord> {
    let byEndpoint = this.pushSubscriptionsByUser.get(userId);
    if (!byEndpoint) {
      byEndpoint = new Map<string, StoredPushSubscriptionRecord>();
      this.pushSubscriptionsByUser.set(userId, byEndpoint);
    }
    return byEndpoint;
  }

  private toPushSubscriptionState(userId: string): PushSubscriptionState {
    const byEndpoint = this.pushSubscriptionsByUser.get(userId);
    if (!byEndpoint) {
      return {
        enabled: false,
        activeCount: 0,
        updatedAt: null,
      };
    }

    const activeRows = [...byEndpoint.values()].filter((subscription) => subscription.isActive);
    const updatedAt =
      activeRows.length > 0
        ? activeRows.reduce(
            (current, row) => (row.updatedAt > current ? row.updatedAt : current),
            activeRows[0].updatedAt,
          )
        : null;

    return {
      enabled: activeRows.length > 0,
      activeCount: activeRows.length,
      updatedAt,
    };
  }

  private slugify(input: string): string {
    const base = input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return base || "item";
  }

  private makeUniqueSlug(input: string, exists: (slug: string) => boolean): string {
    const base = this.slugify(input);
    if (!exists(base)) {
      return base;
    }

    for (let i = 2; i <= 1000; i += 1) {
      const candidate = `${base}-${i}`;
      if (!exists(candidate)) {
        return candidate;
      }
    }

    throw new DomainError("VALIDATION_ERROR", "No se pudo generar un slug único.");
  }

  private getOrCreateUserByFirebaseUid(firebaseUid: string): UserRecord {
    const known = this.userByFirebaseUid.get(firebaseUid);
    if (known) {
      return this.mustGetUser(known);
    }

    const now = nowIso();
    const userId = randomUUID();
    const user: UserRecord = {
      id: userId,
      firebaseUid,
      phoneE164: "",
      alias: null,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(userId, user);
    this.userByFirebaseUid.set(firebaseUid, userId);
    return user;
  }

  private getClubBySlug(slug: string): ClubRecord | null {
    const id = this.clubBySlug.get(slug);
    if (!id) {
      return null;
    }
    return this.clubs.get(id) ?? null;
  }

  private mustGetClubBySlug(slug: string): ClubRecord {
    const club = this.getClubBySlug(slug);
    if (!club) {
      throw new DomainError("NOT_FOUND", "Club no encontrado.");
    }
    return club;
  }

  private mustGetClub(clubId: string): ClubRecord {
    const club = this.clubs.get(clubId);
    if (!club) {
      throw new DomainError("NOT_FOUND", "Club no encontrado.");
    }
    return club;
  }

  private mustGetClubMembers(clubId: string): Map<string, ClubMemberRecord> {
    let members = this.clubMembersByClub.get(clubId);
    if (!members) {
      members = new Map();
      this.clubMembersByClub.set(clubId, members);
    }
    return members;
  }

  private assertClubAdmin(userId: string, clubId: string) {
    const members = this.mustGetClubMembers(clubId);
    const membership = members.get(userId);
    if (!membership || (membership.role !== "admin" && membership.role !== "staff")) {
      throw new DomainError("FORBIDDEN", "No tienes permisos en este club.");
    }
  }

  private listCategoriesForTournament(tournamentId: string): TournamentCategoryRecord[] {
    const categories = this.categoriesByTournament.get(tournamentId);
    if (!categories) {
      return [];
    }
    return [...categories.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private mustGetTournamentBySlug(slug: string): TournamentRecord {
    const tournamentId = this.tournamentBySlug.get(slug);
    if (!tournamentId) {
      throw new DomainError("NOT_FOUND", "Torneo no encontrado.");
    }
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new DomainError("NOT_FOUND", "Torneo no encontrado.");
    }
    return tournament;
  }

  private mustGetCategoryBySlug(tournamentId: string, slug: string): TournamentCategoryRecord {
    const bySlug = this.categoryBySlug.get(tournamentId);
    const categoryId = bySlug?.get(slug);
    if (!categoryId) {
      throw new DomainError("NOT_FOUND", "Categoría no encontrada.");
    }
    const category = this.categoriesByTournament.get(tournamentId)?.get(categoryId);
    if (!category) {
      throw new DomainError("NOT_FOUND", "Categoría no encontrada.");
    }
    return category;
  }

  private findCategoryById(categoryId: string): TournamentCategoryRecord | null {
    for (const categories of this.categoriesByTournament.values()) {
      const category = categories.get(categoryId);
      if (category) {
        return category;
      }
    }
    return null;
  }

  private listRegistrationsForCategory(categoryId: string): TournamentRegistrationRecord[] {
    const registrations = this.registrationsByCategory.get(categoryId);
    if (!registrations) {
      return [];
    }
    return [...registrations.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private getCategoryCounts(categoryId: string): {
    pending: number;
    confirmed: number;
    waitlist: number;
    cancelled: number;
  } {
    const rows = this.listRegistrationsForCategory(categoryId);
    return {
      pending: rows.filter((row) => row.status === "pending").length,
      confirmed: rows.filter((row) => row.status === "confirmed").length,
      waitlist: rows.filter((row) => row.status === "waitlist").length,
      cancelled: rows.filter((row) => row.status === "cancelled").length,
    };
  }

  private findActiveRegistration(categoryId: string, userId: string): TournamentRegistrationRecord | null {
    const byUser = this.registrationsByPrimary.get(categoryId);
    const existing = byUser?.get(userId) ?? null;
    if (!existing) {
      return null;
    }
    if (existing.status === "cancelled") {
      return null;
    }
    return existing;
  }

  private mustGetUser(userId: string): UserRecord {
    const user = this.users.get(userId);
    if (!user) {
      throw new DomainError("UNAUTHORIZED", "Usuario no encontrado.");
    }
    return user;
  }

  private resolveActorId(token: string): string | null {
    const firebaseActorId = this.resolveFirebaseActorId(token);
    if (firebaseActorId) {
      return firebaseActorId;
    }
    return this.sessions.get(token)?.userId ?? null;
  }

  private resolveFirebaseActorId(token: string): string | null {
    if (!token.startsWith("firebase:")) {
      return null;
    }

    const payload = token.slice("firebase:".length);
    const separatorIndex = payload.indexOf(":");
    const firebaseUid = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;
    const encodedPhone = separatorIndex >= 0 ? payload.slice(separatorIndex + 1) : "";
    if (!firebaseUid) {
      return null;
    }

    const knownUserId = this.userByFirebaseUid.get(firebaseUid);
    if (knownUserId) {
      return knownUserId;
    }

    const now = nowIso();
    const userId = randomUUID();
    const phoneE164 = decodeURIComponent(encodedPhone);

    this.users.set(userId, {
      id: userId,
      firebaseUid,
      phoneE164,
      alias: null,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    this.userByFirebaseUid.set(firebaseUid, userId);
    if (phoneE164) {
      this.userByPhone.set(phoneE164, userId);
    }
    return userId;
  }

  private ensureAlias(user: UserRecord) {
    if (!user.alias) {
      throw new DomainError("ALIAS_REQUIRED", "Debes definir tu alias antes de continuar.");
    }
  }

  private mustGetMatchByPublicId(publicId: string): MatchRecord {
    const matchId = this.matchByPublicId.get(publicId);
    if (!matchId) {
      throw new DomainError("NOT_FOUND", "Partido no encontrado.");
    }
    const match = this.matches.get(matchId);
    if (!match) {
      throw new DomainError("NOT_FOUND", "Partido no encontrado.");
    }
    return match;
  }

  private mustGetParticipants(matchId: string): Map<string, MatchParticipant> {
    let participants = this.participantsByMatch.get(matchId);
    if (!participants) {
      participants = new Map();
      this.participantsByMatch.set(matchId, participants);
    }
    return participants;
  }

  private toMatchView(match: MatchRecord, actorUserId: string | null): MatchView {
    const participantsByUserId = this.mustGetParticipants(match.id);
    const participants = [...participantsByUserId.values()]
      .map((participant) => {
        const user = this.mustGetUser(participant.userId);
        return {
          userId: participant.userId,
          alias: user.alias ?? "Sin alias",
          joinedAt: participant.joinedAt,
          avatarUrl: user.avatarUrl,
        } satisfies MatchViewParticipant;
      })
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

    const status = deriveMatchStatus(match.startsAtUtc, participants.length, match.canceledAt, new Date());
    const isJoined = Boolean(actorUserId && participants.some((p) => p.userId === actorUserId));
    const canJoin = Boolean(actorUserId && !isJoined && status === "abierta");
    const canLeave = Boolean(
      actorUserId &&
        isJoined &&
        status !== "cancelada" &&
        status !== "no_se_armo" &&
        match.organizerUserId !== actorUserId,
    );
    const now = nowIso();

    let isWatchingReleaseSpot = false;
    if (actorUserId && !isJoined) {
      const watcher = this.watchersByMatch.get(match.id)?.get(actorUserId);
      if (watcher && watcher.expiresAt > now && !match.canceledAt) {
        isWatchingReleaseSpot = true;
      } else if (watcher) {
        this.removeWatcher(match.id, actorUserId);
      }
    } else if (actorUserId) {
      this.removeWatcher(match.id, actorUserId);
    }

    return {
      publicId: match.publicId,
      organizerUserId: match.organizerUserId,
      club: match.club,
      startsAtUtc: match.startsAtUtc,
      timezone: match.timezone,
      category: match.category,
      modality: match.modality,
      status,
      participants,
      isOrganizer: Boolean(actorUserId && match.organizerUserId === actorUserId),
      canJoin,
      canLeave,
      isCanceled: status === "cancelada",
      isWatchingReleaseSpot,
    };
  }
}

const globalWithService = globalThis as typeof globalThis & {
  __padelService?: PadelService;
};

export const padelService =
  globalWithService.__padelService ?? (globalWithService.__padelService = new PadelService());
