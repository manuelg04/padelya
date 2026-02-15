"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { PublicTournamentCategoryDetail } from "@/src/domain/types";
import {
  cancelTournamentRegistration,
  getTournamentCategoryBySlug,
  registerForTournamentCategory,
} from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

function LoadingView() {
  return (
    <AppShell>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </AppShell>
  );
}

type GroupMatchView = NonNullable<PublicTournamentCategoryDetail["groupStage"]>["matchesByGroup"][number]["matches"][number];

function formatMatchScore(match: GroupMatchView): string {
  if (!match.result) {
    return "Pendiente";
  }
  return match.result.sets.map((set) => `${set.teamAGames}-${set.teamBGames}`).join(" / ");
}

function CategoryContent({
  data,
  onRegister,
  onCancel,
  isAuthenticated,
  hasAlias,
  teamName,
  setTeamName,
  partnerPhone,
  setPartnerPhone,
  isSubmitting,
  feedback,
  error,
}: {
  data: PublicTournamentCategoryDetail;
  onRegister: () => Promise<void>;
  onCancel: () => Promise<void>;
  isAuthenticated: boolean;
  hasAlias: boolean;
  teamName: string;
  setTeamName: (value: string) => void;
  partnerPhone: string;
  setPartnerPhone: (value: string) => void;
  isSubmitting: boolean;
  feedback: string | null;
  error: string | null;
}) {
  const categoryClosed = Boolean(data.groupStage);
  const canRegister = !data.myRegistration && !categoryClosed && isAuthenticated && hasAlias;
  const canStartRegistration = !data.myRegistration && !categoryClosed && !isAuthenticated;
  const mustCompleteProfile = !data.myRegistration && !categoryClosed && isAuthenticated && !hasAlias;

  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{data.category.name}</CardTitle>
            <CardDescription>{data.tournament.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-700">
            <p>Club: {data.club.name}</p>
            <p>
              Cupos confirmados: {data.category.counts.confirmed}/{data.category.capacity}
            </p>
            <p>Pendientes: {data.category.counts.pending} · Lista espera: {data.category.counts.waitlist}</p>
            {data.category.note ? <p>{data.category.note}</p> : null}
            {categoryClosed ? (
              <p className="text-amber-700">La categoría ya cerró inscripciones y está en fase de grupos.</p>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-4 text-sm text-rose-700">{error}</CardContent>
          </Card>
        ) : null}

        {feedback ? (
          <Card>
            <CardContent className="py-4 text-sm text-emerald-700">{feedback}</CardContent>
          </Card>
        ) : null}

        {data.myGroupMatches.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mis partidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.myGroupMatches.map((match) => (
                <div key={match.id} className="rounded-md border border-zinc-200 p-2">
                  <p className="font-medium">Grupo {match.groupName}</p>
                  <p>
                    {match.teamA.teamName} vs {match.teamB.teamName}
                  </p>
                  <p className="text-xs text-zinc-600">Resultado: {formatMatchScore(match)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {data.groupStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grupos y partidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.groupStage.groups.map((group) => {
                const groupMatches =
                  data.groupStage?.matchesByGroup.find((entry) => entry.groupId === group.id)?.matches ?? [];
                return (
                  <div key={group.id} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-semibold">Grupo {group.name}</p>
                    {group.teams.length > 0 ? (
                      <div className="space-y-1 text-sm">
                        {group.teams.map((team) => (
                          <p key={team.id}>{team.teamName}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500">Sin equipos.</p>
                    )}

                    <div className="space-y-1">
                      <p className="text-xs uppercase text-zinc-500">Partidos</p>
                      {groupMatches.length > 0 ? (
                        groupMatches.map((match) => (
                          <div key={match.id} className="text-sm">
                            <p>
                              {match.teamA.teamName} vs {match.teamB.teamName}
                            </p>
                            <p className="text-xs text-zinc-600">Resultado: {formatMatchScore(match)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-500">Pendientes de generación.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {data.groupStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tabla de posiciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.groupStage.standingsByGroup.map((groupStanding) => (
                <div key={`standing-${groupStanding.groupId}`} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold">Grupo {groupStanding.groupName}</p>
                  {groupStanding.rows.map((row, index) => (
                    <p key={`${groupStanding.groupId}-${row.team.id}`} className="text-sm">
                      {index + 1}. {row.team.teamName} · W/L {row.wins}/{row.losses} · SetDiff {row.setDiff} · GameDiff{" "}
                      {row.gameDiff} {row.qualified ? "· Clasificado" : ""}
                    </p>
                  ))}
                  {groupStanding.hasUnresolvedTieAtQualificationCutoff ? (
                    <p className="text-xs text-amber-700">
                      Empate no resuelto automáticamente en el corte de clasificación.
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {data.groupStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clasificados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.groupStage.qualifiedTeams.length === 0 ? (
                <p className="text-zinc-500">Sin clasificados todavía.</p>
              ) : (
                data.groupStage.qualifiedTeams.map((team) => (
                  <p key={`${team.groupId}-${team.team.id}-${team.position}`}>
                    Grupo {team.groupName} · #{team.position} · {team.team.teamName}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {data.myRegistration ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mi inscripción</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Estado: <strong>{data.myRegistration.status}</strong>
              </p>
              <p>Pareja: {data.myRegistration.teamName}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void onCancel()}
                disabled={isSubmitting || categoryClosed}
              >
                Cancelar inscripción
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canStartRegistration ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inscribirme en esta categoría</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-zinc-600">Inicia sesión para completar la inscripción de tu pareja.</p>
              <Button className="w-full" onClick={() => void onRegister()} disabled={isSubmitting}>
                Iniciar sesión para inscribirme
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {mustCompleteProfile ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inscribirme en esta categoría</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-zinc-600">Completa tu alias para continuar con la inscripción.</p>
              <Button className="w-full" onClick={() => void onRegister()} disabled={isSubmitting}>
                Completar perfil para inscribirme
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canRegister ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inscribirme en esta categoría</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="team-name">Nombre de pareja</Label>
                <Input
                  id="team-name"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Ej: Ana / Luisa"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partner-phone">Teléfono de pareja (opcional)</Label>
                <Input
                  id="partner-phone"
                  value={partnerPhone}
                  onChange={(event) => setPartnerPhone(event.target.value)}
                  placeholder="3001234567"
                />
              </div>
              <Button className="w-full" onClick={() => void onRegister()} disabled={isSubmitting || !teamName.trim()}>
                {isSubmitting ? "Enviando..." : "Solicitar cupo"}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </AppShell>
  );
}

function useCategoryActions(
  tournamentSlug: string,
  categorySlug: string,
  data: PublicTournamentCategoryDetail | null,
  reload: () => Promise<void>,
) {
  const { token, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [teamName, setTeamName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user && !user.alias) {
      router.push(`/perfil?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (data?.groupStage) {
      setError("La categoría ya está cerrada para inscripciones.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      const result = await registerForTournamentCategory(token, tournamentSlug, categorySlug, {
        teamName,
        partnerPhone,
      });
      setFeedback(result.status === "waitlist" ? "Te agregamos a lista de espera." : "Solicitud enviada.");
      await reload();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }, [categorySlug, data?.groupStage, partnerPhone, pathname, reload, router, teamName, token, tournamentSlug, user]);

  const handleCancel = useCallback(async () => {
    if (!token || !data?.myRegistration) {
      return;
    }

    if (data.groupStage) {
      setError("La categoría ya está cerrada para cambios de inscripción.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      await cancelTournamentRegistration(token, data.myRegistration.id);
      setFeedback("Inscripción cancelada.");
      await reload();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }, [data, reload, token]);

  return {
    teamName,
    setTeamName,
    partnerPhone,
    setPartnerPhone,
    isSubmitting,
    feedback,
    error,
    handleRegister,
    handleCancel,
  };
}

function ConvexTournamentCategoryPage() {
  const params = useParams<{ tournamentSlug: string; categorySlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");
  const categorySlug = decodeURIComponent(params.categorySlug ?? "");
  const { token, user } = useAuth();

  const data = useQuery(api.tournaments.getTournamentCategoryBySlug, {
    tournamentSlug,
    categorySlug,
  });

  const actions = useCategoryActions(
    tournamentSlug,
    categorySlug,
    data ?? null,
    async () => {
      return;
    },
  );

  if (data === undefined) {
    return <LoadingView />;
  }

  return (
    <CategoryContent
      data={data}
      onRegister={actions.handleRegister}
      onCancel={actions.handleCancel}
      isAuthenticated={Boolean(token)}
      hasAlias={Boolean(user?.alias)}
      teamName={actions.teamName}
      setTeamName={actions.setTeamName}
      partnerPhone={actions.partnerPhone}
      setPartnerPhone={actions.setPartnerPhone}
      isSubmitting={actions.isSubmitting}
      feedback={actions.feedback}
      error={actions.error}
    />
  );
}

function MockTournamentCategoryPage() {
  const params = useParams<{ tournamentSlug: string; categorySlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");
  const categorySlug = decodeURIComponent(params.categorySlug ?? "");
  const { token, user } = useAuth();

  const [data, setData] = useState<PublicTournamentCategoryDetail | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await getTournamentCategoryBySlug(tournamentSlug, categorySlug, token ?? undefined);
    setData(next);
  }, [categorySlug, token, tournamentSlug]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        setLoading(true);
        setErrorState(null);
        const next = await getTournamentCategoryBySlug(tournamentSlug, categorySlug, token ?? undefined);
        if (!disposed) {
          setData(next);
        }
      } catch (nextError) {
        if (!disposed) {
          setErrorState(toErrorMessage(nextError));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [categorySlug, token, tournamentSlug]);

  const actions = useCategoryActions(tournamentSlug, categorySlug, data, reload);

  if (loading) {
    return <LoadingView />;
  }

  if (errorState || !data) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-5 text-sm text-rose-700">{errorState ?? "No se encontró la categoría."}</CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <CategoryContent
      data={data}
      onRegister={actions.handleRegister}
      onCancel={actions.handleCancel}
      isAuthenticated={Boolean(token)}
      hasAlias={Boolean(user?.alias)}
      teamName={actions.teamName}
      setTeamName={actions.setTeamName}
      partnerPhone={actions.partnerPhone}
      setPartnerPhone={actions.setPartnerPhone}
      isSubmitting={actions.isSubmitting}
      feedback={actions.feedback}
      error={actions.error}
    />
  );
}

export default function TournamentCategoryPage() {
  if (ENABLE_CONVEX_REALTIME) {
    return <ConvexTournamentCategoryPage />;
  }
  return <MockTournamentCategoryPage />;
}
