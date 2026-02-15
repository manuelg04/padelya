"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  buildCategoryAnnouncementMessage,
  buildCategoryConfirmedListMessage,
  buildCategoryPaymentMessage,
  buildCategoryReminderMessage,
  buildTournamentCategoryUrl,
} from "@/src/domain/tournament";
import type { AdminCategoryDashboard, PublicTournamentCategoryDetail, TournamentRegistrationStatus } from "@/src/domain/types";
import {
  generateAdminTournamentGroupMatches,
  generateAdminTournamentGroups,
  getAdminTournamentCategoryDashboard,
  getTournamentCategoryBySlug,
  moveAdminTournamentTeamGroup,
  setAdminTournamentRegistrationStatus,
  updateAdminClubPaymentInstructions,
} from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

function hasGeneratedGroupMatches(categoryDetail: PublicTournamentCategoryDetail): boolean {
  return Boolean(
    categoryDetail.groupStage?.matchesByGroup.some((group) => group.matches.length > 0),
  );
}

function groupsReadyForFixture(categoryDetail: PublicTournamentCategoryDetail): boolean {
  const stage = categoryDetail.groupStage;
  if (!stage) {
    return false;
  }
  return stage.groups.length > 0 && stage.groups.every((group) => group.teams.length === 4);
}

function AdminCategoryContent({
  dashboard,
  categoryDetail,
  paymentInstructions,
  setPaymentInstructions,
  onSavePayment,
  onChangeStatus,
  onGenerateGroups,
  onMoveTeamGroup,
  onGenerateMatches,
  error,
  feedback,
  isSubmitting,
}: {
  dashboard: AdminCategoryDashboard;
  categoryDetail: PublicTournamentCategoryDetail;
  paymentInstructions: string;
  setPaymentInstructions: (value: string) => void;
  onSavePayment: () => Promise<void>;
  onChangeStatus: (registrationId: string, status: TournamentRegistrationStatus) => Promise<void>;
  onGenerateGroups: () => Promise<void>;
  onMoveTeamGroup: (teamId: string, targetGroupName: string) => Promise<void>;
  onGenerateMatches: () => Promise<void>;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
}) {
  const categoryUrl = buildTournamentCategoryUrl(
    typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin,
    dashboard.tournament.slug,
    dashboard.category.slug,
  );

  const groupStage = categoryDetail.groupStage;
  const categoryFrozen = Boolean(groupStage);
  const fixtureGenerated = hasGeneratedGroupMatches(categoryDetail);
  const canGenerateGroups = !groupStage;
  const canGenerateMatches = Boolean(groupStage) && !fixtureGenerated && groupsReadyForFixture(categoryDetail);

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <AppShell>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {dashboard.tournament.name} · {dashboard.category.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Confirmados {dashboard.category.counts.confirmed}/{dashboard.category.capacity}
            </p>
            <p>
              Pending {dashboard.category.counts.pending} · Waitlist {dashboard.category.counts.waitlist} · Cancelled {dashboard.category.counts.cancelled}
            </p>
            {categoryFrozen ? (
              <p className="text-amber-700">
                Categoría congelada: no se permiten cambios de inscripción después de generar grupos.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-3 text-sm text-rose-700">{error}</CardContent>
          </Card>
        ) : null}

        {feedback ? (
          <Card>
            <CardContent className="py-3 text-sm text-emerald-700">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operación de grupos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canGenerateGroups ? (
              <Button className="w-full" onClick={() => void onGenerateGroups()} disabled={isSubmitting}>
                Generar grupos
              </Button>
            ) : null}

            {groupStage ? (
              <div className="space-y-3">
                {groupStage.groups.map((group) => (
                  <div key={group.id} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-semibold">Grupo {group.name}</p>
                    {group.teams.length === 0 ? (
                      <p className="text-xs text-zinc-500">Sin equipos.</p>
                    ) : (
                      group.teams.map((team) => (
                        <div key={team.id} className="space-y-1 rounded-md border border-zinc-100 p-2">
                          <p className="text-sm">{team.teamName}</p>
                          <Label htmlFor={`group-${team.id}`} className="text-xs text-zinc-500">
                            Grupo
                          </Label>
                          <select
                            id={`group-${team.id}`}
                            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                            value={group.name}
                            disabled={isSubmitting || fixtureGenerated}
                            onChange={(event) => void onMoveTeamGroup(team.id, event.target.value)}
                          >
                            {groupStage.groups.map((optionGroup) => (
                              <option key={`${team.id}-${optionGroup.id}`} value={optionGroup.name}>
                                {optionGroup.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                ))}

                {fixtureGenerated ? (
                  <p className="text-sm text-zinc-700">Partidos de grupos ya generados.</p>
                ) : (
                  <Button
                    className="w-full"
                    disabled={isSubmitting || !canGenerateMatches}
                    onClick={() => void onGenerateMatches()}
                  >
                    Generar partidos de grupos
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mensajes WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => void copyText(buildCategoryAnnouncementMessage(categoryDetail, categoryUrl))}
            >
              Copiar anuncio
            </Button>
            <Button variant="outline" onClick={() => void copyText(buildCategoryConfirmedListMessage(dashboard))}>
              Copiar confirmados
            </Button>
            <Button variant="outline" onClick={() => void copyText(buildCategoryPaymentMessage(dashboard))}>
              Copiar pago
            </Button>
            <Button
              variant="outline"
              onClick={() => void copyText(buildCategoryReminderMessage(categoryDetail, categoryUrl))}
            >
              Copiar recordatorio
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instrucciones de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="payment">Texto pago</Label>
            <Input id="payment" value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} />
            <Button className="w-full" onClick={() => void onSavePayment()} disabled={isSubmitting}>
              Guardar instrucciones
            </Button>
          </CardContent>
        </Card>

        {(["pending", "confirmed", "waitlist", "cancelled"] as const).map((status) => (
          <Card key={status}>
            <CardHeader>
              <CardTitle className="text-base uppercase">{status}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.registrations[status].length === 0 ? (
                <p className="text-sm text-zinc-500">Sin registros.</p>
              ) : (
                dashboard.registrations[status].map((registration) => (
                  <div key={registration.id} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-medium">{registration.teamName}</p>
                    <p className="text-xs text-zinc-500">
                      {registration.primaryAlias ?? "Sin alias"} · {registration.primaryPhone ?? "Sin teléfono"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "confirmed")}
                        disabled={isSubmitting || categoryFrozen}
                      >
                        Confirmar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "waitlist")}
                        disabled={isSubmitting || categoryFrozen}
                      >
                        Waitlist
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "pending")}
                        disabled={isSubmitting || categoryFrozen}
                      >
                        Pending
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "cancelled")}
                        disabled={isSubmitting || categoryFrozen}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}

function useAdminActions(
  dashboard: AdminCategoryDashboard | null,
  categoryDetail: PublicTournamentCategoryDetail | null,
  tournamentSlug: string,
  categorySlug: string,
  reload: () => Promise<void>,
) {
  const { token } = useAuth();
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPaymentInstructions(dashboard?.club.paymentInstructions ?? "");
  }, [dashboard?.club.paymentInstructions]);

  const onChangeStatus = useCallback(
    async (registrationId: string, status: TournamentRegistrationStatus) => {
      if (!token) {
        return;
      }

      if (categoryDetail?.groupStage) {
        setError("La categoría está congelada después de generar grupos.");
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        await setAdminTournamentRegistrationStatus(token, registrationId, status);
        setFeedback("Estado actualizado.");
        await reload();
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [categoryDetail?.groupStage, reload, token],
  );

  const onSavePayment = useCallback(async () => {
    if (!token || !dashboard) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await updateAdminClubPaymentInstructions(token, dashboard.club.slug, paymentInstructions);
      setFeedback("Instrucciones de pago actualizadas.");
      await reload();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }, [dashboard, paymentInstructions, reload, token]);

  const onGenerateGroups = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await generateAdminTournamentGroups(token, tournamentSlug, categorySlug);
      setFeedback("Grupos generados.");
      await reload();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }, [categorySlug, reload, token, tournamentSlug]);

  const onMoveTeamGroup = useCallback(
    async (teamId: string, targetGroupName: string) => {
      if (!token) {
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        await moveAdminTournamentTeamGroup(token, tournamentSlug, categorySlug, teamId, targetGroupName);
        setFeedback("Equipo movido de grupo.");
        await reload();
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [categorySlug, reload, token, tournamentSlug],
  );

  const onGenerateMatches = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await generateAdminTournamentGroupMatches(token, tournamentSlug, categorySlug);
      setFeedback("Partidos de grupos generados.");
      await reload();
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }, [categorySlug, reload, token, tournamentSlug]);

  return {
    paymentInstructions,
    setPaymentInstructions,
    error,
    feedback,
    isSubmitting,
    onChangeStatus,
    onSavePayment,
    onGenerateGroups,
    onMoveTeamGroup,
    onGenerateMatches,
  };
}

function ConvexAdminCategoryPage() {
  const params = useParams<{ tournamentSlug: string; categorySlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");
  const categorySlug = decodeURIComponent(params.categorySlug ?? "");
  const { token, loading } = useAuth();
  const router = useRouter();

  const dashboard = useQuery(
    api.tournaments.getAdminCategoryDashboard,
    token ? { tournamentSlug, categorySlug } : "skip",
  );
  const categoryDetail = useQuery(api.tournaments.getTournamentCategoryBySlug, {
    tournamentSlug,
    categorySlug,
  });

  useEffect(() => {
    if (!loading && !token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/admin/torneos/${tournamentSlug}/categorias/${categorySlug}`)}`);
    }
  }, [categorySlug, loading, router, token, tournamentSlug]);

  const actions = useAdminActions(
    dashboard ?? null,
    categoryDetail ?? null,
    tournamentSlug,
    categorySlug,
    async () => {
      return;
    },
  );

  if (!dashboard || !categoryDetail) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-5 text-sm text-zinc-500">Cargando...</CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AdminCategoryContent
      dashboard={dashboard}
      categoryDetail={categoryDetail}
      paymentInstructions={actions.paymentInstructions}
      setPaymentInstructions={actions.setPaymentInstructions}
      onSavePayment={actions.onSavePayment}
      onChangeStatus={actions.onChangeStatus}
      onGenerateGroups={actions.onGenerateGroups}
      onMoveTeamGroup={actions.onMoveTeamGroup}
      onGenerateMatches={actions.onGenerateMatches}
      error={actions.error}
      feedback={actions.feedback}
      isSubmitting={actions.isSubmitting}
    />
  );
}

function MockAdminCategoryPage() {
  const params = useParams<{ tournamentSlug: string; categorySlug: string }>();
  const tournamentSlug = decodeURIComponent(params.tournamentSlug ?? "");
  const categorySlug = decodeURIComponent(params.categorySlug ?? "");
  const { token, loading } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<AdminCategoryDashboard | null>(null);
  const [categoryDetail, setCategoryDetail] = useState<PublicTournamentCategoryDetail | null>(null);

  useEffect(() => {
    if (!loading && !token) {
      router.replace(`/login?redirect=${encodeURIComponent(`/admin/torneos/${tournamentSlug}/categorias/${categorySlug}`)}`);
    }
  }, [categorySlug, loading, router, token, tournamentSlug]);

  const reload = useMemo(() => {
    return async () => {
      if (!token) {
        return;
      }

      const [nextDashboard, nextCategory] = await Promise.all([
        getAdminTournamentCategoryDashboard(token, tournamentSlug, categorySlug),
        getTournamentCategoryBySlug(tournamentSlug, categorySlug, token),
      ]);

      setDashboard(nextDashboard);
      setCategoryDetail(nextCategory);
    };
  }, [categorySlug, token, tournamentSlug]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        await reload();
      } catch {
        if (!disposed) {
          setDashboard(null);
          setCategoryDetail(null);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [reload]);

  const actions = useAdminActions(dashboard, categoryDetail, tournamentSlug, categorySlug, reload);

  if (!dashboard || !categoryDetail) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-5 text-sm text-zinc-500">Cargando...</CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AdminCategoryContent
      dashboard={dashboard}
      categoryDetail={categoryDetail}
      paymentInstructions={actions.paymentInstructions}
      setPaymentInstructions={actions.setPaymentInstructions}
      onSavePayment={actions.onSavePayment}
      onChangeStatus={actions.onChangeStatus}
      onGenerateGroups={actions.onGenerateGroups}
      onMoveTeamGroup={actions.onMoveTeamGroup}
      onGenerateMatches={actions.onGenerateMatches}
      error={actions.error}
      feedback={actions.feedback}
      isSubmitting={actions.isSubmitting}
    />
  );
}

export default function AdminCategoryPage() {
  if (ENABLE_CONVEX_REALTIME) {
    return <ConvexAdminCategoryPage />;
  }
  return <MockAdminCategoryPage />;
}
