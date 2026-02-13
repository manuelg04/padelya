export const MAX_PLAYERS = 4;

export type MatchStatus = "abierta" | "cerrada" | "cancelada";
export type Modality = "mixto" | "masc" | "fem";
export type OpenFeedWindow = "today" | "next7";

export interface UserRecord {
  id: string;
  firebaseUid: string;
  phoneE164: string;
  alias: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRecord {
  id: string;
  publicId: string;
  organizerUserId: string;
  club: string;
  startsAtUtc: string;
  timezone: string;
  category: string;
  modality: Modality;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchParticipant {
  matchId: string;
  userId: string;
  joinedAt: string;
}

export interface MatchViewParticipant {
  userId: string;
  alias: string;
  joinedAt: string;
  avatarUrl: string | null;
}

export interface MatchView {
  publicId: string;
  organizerUserId: string;
  club: string;
  startsAtUtc: string;
  timezone: string;
  category: string;
  modality: Modality;
  status: MatchStatus;
  participants: MatchViewParticipant[];
  isOrganizer: boolean;
  canJoin: boolean;
  canLeave: boolean;
  isCanceled: boolean;
  isWatchingReleaseSpot: boolean;
}

export interface CreateMatchInput {
  club: string;
  startsAtLocal: string;
  category: string;
  modality: Modality;
}

export interface EventLogRecord {
  type:
    | "match_created"
    | "match_joined"
    | "match_left"
    | "match_canceled"
    | "otp_request_started"
    | "otp_verified"
    | "otp_failed";
  actorUserId?: string;
  matchId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export type NotificationType =
  | "TU_CUPO_CONFIRMADO"
  | "PARTIDO_LLENO"
  | "CUPO_LIBERADO"
  | "PARTIDO_CANCELADO"
  | "PARTICIPANTE_SE_UNIO"
  | "PARTICIPANTE_SE_SALIO";

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  matchPublicId: string | null;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}
