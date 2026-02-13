"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  MessageCircle,
  Share2,
  Tag,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/auth-provider";
import { StatusBadge } from "@/src/components/features/status-badge";
import { AppShell } from "@/src/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Progress } from "@/src/components/ui/progress";
import { Separator } from "@/src/components/ui/separator";
import { Skeleton } from "@/src/components/ui/skeleton";
import { MAX_PLAYERS } from "@/src/domain/types";
import { utcIsoToBogotaParts } from "@/src/domain/match";
import type { MatchView } from "@/src/domain/types";
import {
  cancelMatch,
  followMatchWatch,
  getMatch,
  getMatchSummary,
  joinMatch,
  leaveMatch,
  unfollowMatchWatch,
  type ApiError,
} from "@/src/lib/api/client";
import { getAvatarInitials } from "@/src/lib/avatar";
import { normalizePublicId } from "@/src/lib/public-id";
import { cn, toErrorMessage } from "@/src/lib/utils";

function isAliasRequired(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybe = error as ApiError;
  return maybe.code === "ALIAS_REQUIRED";
}

export default function MatchDetailPage() {
  const params = useParams<{ publicId: string }>();
  const rawPublicId = params.publicId ?? "";
  const publicId = normalizePublicId(rawPublicId);
  const { token, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [match, setMatch] = useState<MatchView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicId) {
      return;
    }
    try {
      setIsLoading(true);
      const next = await getMatch(publicId, token ?? undefined);
      setMatch(next);
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [publicId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!publicId) {
      return;
    }
    const source = new EventSource(`/api/matches/${publicId}/events`);
    source.addEventListener("update", () => {
      void refresh();
    });
    return () => source.close();
  }, [publicId, refresh]);

  useEffect(() => {
    if (rawPublicId && publicId && rawPublicId !== publicId) {
      router.replace(`/partido/${publicId}`);
    }
  }, [publicId, rawPublicId, router]);

  async function guardAuth(): Promise<boolean> {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return false;
    }
    if (!loading && user && !user.alias) {
      router.push(`/perfil?redirect=${encodeURIComponent(pathname)}`);
      return false;
    }
    return true;
  }

  async function handleJoin() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await joinMatch(publicId, token);
      setMatch(next);
      setFeedback("Te uniste al partido.");
      setError(null);
    } catch (nextError) {
      if (isAliasRequired(nextError)) {
        router.push(`/perfil?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleLeave() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await leaveMatch(publicId, token);
      setMatch(next);
      setFeedback("Saliste del partido.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCancel() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await cancelMatch(publicId, token);
      setMatch(next);
      setFeedback("Partido cancelado.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCopySummary() {
    try {
      const summary = await getMatchSummary(publicId, token ?? undefined);
      await navigator.clipboard.writeText(summary);
      setFeedback("Resumen copiado para WhatsApp.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  }

  async function handleShareLink() {
    const link = `${window.location.origin}/partido/${publicId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Partido de pádel",
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
      }
      setFeedback("Link compartido/copiado.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  }

  const dateTime = useMemo(() => (match ? utcIsoToBogotaParts(match.startsAtUtc) : null), [match]);

  const emptySlots = match ? MAX_PLAYERS - match.participants.length : 0;
  const wantsJoinCta = searchParams.get("cta") === "join";

  async function handleFollowWatch() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await followMatchWatch(publicId, token);
      setMatch(next);
      setFeedback("Te avisaremos si se libera un cupo.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleUnfollowWatch() {
    if (!(await guardAuth()) || !token) {
      return;
    }
    try {
      setIsMutating(true);
      const next = await unfollowMatchWatch(publicId, token);
      setMatch(next);
      setFeedback("Dejaste de seguir este partido.");
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <AppShell>
      {/* Feedback alerts */}
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {feedback ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {/* Skeleton loading state */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="space-y-2">
              {Array.from({ length: MAX_PLAYERS }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </CardContent>
        </Card>
      ) : null}

      {/* Main match card */}
      {match ? (
        <Card>
          {/* Header */}
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-xl font-bold">{match.club}</CardTitle>
              <StatusBadge status={match.status} />
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
                <span>{dateTime?.date}</span>
                <Clock className="ml-1 h-4 w-4 shrink-0 text-zinc-400" />
                <span>{dateTime?.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="capitalize">{match.category} · {match.modality}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <Separator />

            {/* Participants section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-800">Confirmados</h4>
                <span className="text-sm font-semibold text-emerald-600">{match.participants.length}/{MAX_PLAYERS}</span>
              </div>
              <Progress value={match.participants.length} max={MAX_PLAYERS} />

              <div className="space-y-2">
                {match.participants.map((participant, index) => {
                  const isCurrentUser = participant.userId === user?.id;
                  const isOrganizer = participant.userId === match.organizerUserId;

                  return (
                    <div
                      key={participant.userId}
                      className={cn(
                        "flex items-center gap-3 rounded-xl bg-emerald-50/60 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-100",
                        isCurrentUser && "ring-emerald-300",
                      )}
                    >
                      <div className="relative">
                        <Avatar size="default" className="ring-1 ring-emerald-200">
                          <AvatarImage src={participant.avatarUrl ?? undefined} alt={participant.alias} />
                          <AvatarFallback>{getAvatarInitials(participant.alias)}</AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white ring-2 ring-white">
                          {index + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-800">{participant.alias}</span>
                          {isCurrentUser ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Tú
                            </span>
                          ) : null}
                          {isOrganizer ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              Organizador
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                    </div>
                  );
                })}

                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-3.5 py-2.5"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-400">
                      {match.participants.length + i + 1}
                    </div>
                    <span className="text-sm text-zinc-400">Cupo disponible</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Canceled banner */}
            {match.isCanceled ? (
              <div
                className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-inset ring-rose-200"
                data-testid="canceled-banner"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Este partido fue cancelado. Puedes ver los detalles, pero no se permiten nuevas uniones.</span>
              </div>
            ) : null}

            {!match.isCanceled && match.status === "cerrada" ? (
              <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                Estado: Lleno ({MAX_PLAYERS}/{MAX_PLAYERS})
              </div>
            ) : null}

            {wantsJoinCta && !match.isCanceled && match.status === "cerrada" ? (
              <div className="flex items-start gap-2 rounded-xl bg-zinc-50 px-3.5 py-3 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>El cupo pudo haberse tomado. Si vuelve a abrirse, activa el aviso.</span>
              </div>
            ) : null}

            {/* Primary CTA */}
            <div className="space-y-2.5">
              {match.canJoin ? (
                <Button className="w-full" size="lg" onClick={handleJoin} disabled={isMutating} data-testid="join-btn">
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {isMutating ? "Procesando..." : "Unirme al partido"}
                </Button>
              ) : null}

              {match.canLeave ? (
                <Button className="w-full" variant="outline" size="lg" onClick={handleLeave} disabled={isMutating} data-testid="leave-btn">
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                  {isMutating ? "Procesando..." : "Salir del partido"}
                </Button>
              ) : null}

              {token && !match.canJoin && !match.canLeave && !match.isCanceled && match.status === "cerrada" ? (
                <>
                  {!match.isWatchingReleaseSpot ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleFollowWatch}
                      disabled={isMutating}
                      data-testid="follow-watch-btn"
                    >
                      {isMutating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      {isMutating ? "Procesando..." : "Avisarme si se libera un cupo"}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        Te avisaremos si se libera un cupo.
                      </p>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="lg"
                        onClick={handleUnfollowWatch}
                        disabled={isMutating}
                        data-testid="unfollow-watch-btn"
                      >
                        {isMutating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BellOff className="h-4 w-4" />
                        )}
                        {isMutating ? "Procesando..." : "Dejar de avisarme"}
                      </Button>
                    </div>
                  )}
                </>
              ) : null}

              {!token ? (
                <Button className="w-full" size="lg" asChild>
                  <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
                    <LogIn className="h-4 w-4" />
                    Inicia sesión para participar
                  </Link>
                </Button>
              ) : null}
            </div>

            <Separator />

            {/* Share actions */}
            <div className="space-y-2.5">
              <Button className="w-full" variant="whatsapp" onClick={handleCopySummary} data-testid="copy-summary-btn">
                <MessageCircle className="h-4 w-4" />
                Copiar para WhatsApp
              </Button>
              <Button className="w-full" variant="outline" onClick={handleShareLink}>
                <Share2 className="h-4 w-4" />
                Compartir link
              </Button>
            </div>

            {/* Organizer actions */}
            {match.isOrganizer && !match.isCanceled ? (
              <>
                <Separator />
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={isMutating}
                  data-testid="cancel-btn"
                >
                  {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Cancelar partido
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
