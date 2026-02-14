import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

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
  type CreateMatchInput,
  type EventLogRecord,
  MAX_PLAYERS,
  type MatchParticipant,
  type MatchRecord,
  type MatchView,
  type MatchViewParticipant,
  type Modality,
  type NotificationRecord,
  type OpenFeedWindow,
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

export class PadelService {
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
