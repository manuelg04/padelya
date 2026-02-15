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
  getAdminTournamentCategoryDashboard,
  getTournamentCategoryBySlug,
  setAdminTournamentRegistrationStatus,
  updateAdminClubPaymentInstructions,
} from "@/src/lib/api/client";
import { ENABLE_CONVEX_REALTIME } from "@/src/lib/env";
import { toErrorMessage } from "@/src/lib/utils";

function AdminCategoryContent({
  dashboard,
  categoryDetail,
  paymentInstructions,
  setPaymentInstructions,
  onSavePayment,
  onChangeStatus,
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
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
}) {
  const categoryUrl = buildTournamentCategoryUrl(
    typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin,
    dashboard.tournament.slug,
    dashboard.category.slug,
  );

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
                        disabled={isSubmitting}
                      >
                        Confirmar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "waitlist")}
                        disabled={isSubmitting}
                      >
                        Waitlist
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "pending")}
                        disabled={isSubmitting}
                      >
                        Pending
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "cancelled")}
                        disabled={isSubmitting}
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
    [reload, token],
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

  return {
    paymentInstructions,
    setPaymentInstructions,
    error,
    feedback,
    isSubmitting,
    onChangeStatus,
    onSavePayment,
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

  const actions = useAdminActions(dashboard ?? null, async () => {
    return;
  });

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

  const actions = useAdminActions(dashboard, reload);

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
