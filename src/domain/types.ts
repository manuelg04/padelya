export const MAX_PLAYERS = 4;

export type MatchStatus = "abierta" | "cerrada" | "cancelada" | "no_se_armo";
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

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime: number | null;
}

export interface PushSubscriptionState {
  enabled: boolean;
  activeCount: number;
  updatedAt: string | null;
}

export type TournamentRegistrationStatus = "pending" | "confirmed" | "waitlist" | "cancelled";

export interface TournamentCategoryCounts {
  pending: number;
  confirmed: number;
  waitlist: number;
  cancelled: number;
}

export interface PublicTournamentCategorySummary {
  id: string;
  slug: string;
  name: string;
  capacity: number;
  note: string | null;
  counts: TournamentCategoryCounts;
  confirmedLabel: string;
}

export interface PublicTournamentDetail {
  tournament: {
    id: string;
    slug: string;
    name: string;
    startsAtUtc: string;
    timezone: string;
    description: string;
    prizes: string | null;
    priceInfo: string | null;
    posterUrl: string | null;
  };
  club: {
    id: string;
    slug: string;
    name: string;
  };
  categories: PublicTournamentCategorySummary[];
}

export interface TournamentMyRegistration {
  id: string;
  status: TournamentRegistrationStatus;
  teamName: string;
  partnerPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentGroupTeamView {
  id: string;
  teamName: string;
  primaryAlias: string | null;
  primaryPhone: string | null;
}

export interface TournamentGroupView {
  id: string;
  name: string;
  order: number;
  teams: TournamentGroupTeamView[];
}

export interface TournamentGroupMatchView {
  id: string;
  order: number;
  status: "pending";
  teamA: TournamentGroupTeamView;
  teamB: TournamentGroupTeamView;
}

export interface TournamentGroupMatchesByGroupView {
  groupId: string;
  groupName: string;
  matches: TournamentGroupMatchView[];
}

export interface TournamentMyGroupMatchView extends TournamentGroupMatchView {
  groupName: string;
}

export interface TournamentGroupStage {
  generatedAt: string;
  groups: TournamentGroupView[];
  matchesByGroup: TournamentGroupMatchesByGroupView[];
}

export interface PublicTournamentCategoryDetail {
  tournament: {
    id: string;
    slug: string;
    name: string;
    startsAtUtc: string;
    timezone: string;
    description: string;
    prizes: string | null;
    priceInfo: string | null;
    posterUrl: string | null;
  };
  club: {
    id: string;
    slug: string;
    name: string;
  };
  category: {
    id: string;
    slug: string;
    name: string;
    capacity: number;
    note: string | null;
    counts: TournamentCategoryCounts;
  };
  myRegistration: TournamentMyRegistration | null;
  groupStage: TournamentGroupStage | null;
  myGroupMatches: TournamentMyGroupMatchView[];
}

export interface AdminClubMembership {
  clubSlug: string;
  clubName: string;
  role: "admin" | "staff";
  paymentInstructions: string | null;
}

export interface AdminTournamentSummary {
  id: string;
  slug: string;
  name: string;
  startsAtUtc: string;
  timezone: string;
  description: string;
  categoriesCount: number;
  categories: Array<{
    slug: string;
    name: string;
    capacity: number;
  }>;
}

export interface AdminTournamentsResponse {
  club: {
    slug: string;
    name: string;
  };
  tournaments: AdminTournamentSummary[];
}

export interface AdminTournamentRegistrationItem {
  id: string;
  status: TournamentRegistrationStatus;
  createdAt: string;
  updatedAt: string;
  primaryUserId: string;
  primaryAlias: string | null;
  primaryPhone: string | null;
  teamName: string;
  partnerPhone: string | null;
}

export interface AdminCategoryDashboard {
  tournament: {
    id: string;
    slug: string;
    name: string;
    startsAtUtc: string;
    timezone: string;
  };
  club: {
    slug: string;
    name: string;
    paymentInstructions: string | null;
  };
  category: {
    id: string;
    slug: string;
    name: string;
    capacity: number;
    note: string | null;
    counts: TournamentCategoryCounts;
  };
  registrations: {
    pending: AdminTournamentRegistrationItem[];
    confirmed: AdminTournamentRegistrationItem[];
    waitlist: AdminTournamentRegistrationItem[];
    cancelled: AdminTournamentRegistrationItem[];
  };
}

export interface CreateTournamentInput {
  clubSlug: string;
  name: string;
  startsAtLocal: string;
  timezone?: string;
  description: string;
  prizes?: string;
  priceInfo?: string;
  posterUrl?: string;
  categories: Array<{
    name: string;
    capacity: number;
    note?: string;
  }>;
}

export interface TournamentRegistrationRequest {
  teamName: string;
  partnerPhone?: string;
}
