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
import type {
  AdminCategoryDashboard,
  PublicTournamentCategoryDetail,
  TournamentFreeMatchResultInput,
  TournamentFreeRoundCreateRequest,
  TournamentRegistrationStatus,
  TournamentSetScore,
} from "@/src/domain/types";
import {
  createAdminTournamentFreeRound,
  generateAdminTournamentGroupMatches,
  generateAdminTournamentGroups,
  getAdminTournamentCategoryDashboard,
  getTournamentCategoryBySlug,
  moveAdminTournamentTeamGroup,
  reportAdminTournamentFreeMatchResult,
  reportAdminTournamentGroupMatchResult,
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

type GroupMatchView = NonNullable<PublicTournamentCategoryDetail["groupStage"]>["matchesByGroup"][number]["matches"][number];
type FreeRoundView = NonNullable<PublicTournamentCategoryDetail["freeStage"]>["rounds"][number];
type FreeMatchView = FreeRoundView["matches"][number];
const REGISTRATION_STATUS_LABEL: Record<TournamentRegistrationStatus, string> = {
  pending: "Inscritas sin pago confirmado",
  confirmed: "Pago confirmado",
  waitlist: "Lista de espera",
  cancelled: "Bajas / canceladas",
};

function buildEditableSets(match: GroupMatchView): Array<{ teamAGames: string; teamBGames: string }> {
  const source = match.result?.sets ?? [];
  return [0, 1, 2].map((index) => ({
    teamAGames: source[index] ? String(source[index].teamAGames) : "",
    teamBGames: source[index] ? String(source[index].teamBGames) : "",
  }));
}

function formatMatchResult(match: GroupMatchView): string {
  if (!match.result) {
    return "Pendiente";
  }
  return `${match.result.sets.map((set) => `${set.teamAGames}-${set.teamBGames}`).join(" / ")}`;
}

function formatFreeMatchResult(match: FreeMatchView): string {
  if (!match.result) {
    return "Pendiente";
  }
  return match.result.scoreText;
}

function MatchResultEditor({
  match,
  onSave,
  isSubmitting,
}: {
  match: GroupMatchView;
  onSave: (matchId: string, payload: { winnerTeamId: string; sets: TournamentSetScore[] }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [winnerTeamId, setWinnerTeamId] = useState(match.result?.winnerTeamId ?? match.teamA.id);
  const [sets, setSets] = useState<Array<{ teamAGames: string; teamBGames: string }>>(() => buildEditableSets(match));
  const [localError, setLocalError] = useState<string | null>(null);

  const updateSetField = useCallback(
    (index: number, side: "teamAGames" | "teamBGames", value: string) => {
      setSets((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [side]: value,
              }
            : item,
        ),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const candidateSets = sets.filter(
      (set) => Boolean(set.teamAGames.trim()) || Boolean(set.teamBGames.trim()),
    );
    if (candidateSets.length === 0) {
      setLocalError("Debes completar al menos 1 set.");
      return;
    }

    if (candidateSets.some((set) => !set.teamAGames.trim() || !set.teamBGames.trim())) {
      setLocalError("Cada set debe tener marcador para ambos equipos.");
      return;
    }

    const parsedSets = candidateSets.map((set) => ({
      teamAGames: Number(set.teamAGames),
      teamBGames: Number(set.teamBGames),
    }));

    if (
      parsedSets.some(
        (set) =>
          !Number.isInteger(set.teamAGames) ||
          !Number.isInteger(set.teamBGames) ||
          set.teamAGames < 0 ||
          set.teamBGames < 0 ||
          set.teamAGames === set.teamBGames,
      )
    ) {
      setLocalError("El marcador debe usar enteros >= 0 y sin empates por set.");
      return;
    }

    try {
      setLocalError(null);
      await onSave(match.id, { winnerTeamId, sets: parsedSets });
    } catch {
      return;
    }
  }, [match.id, onSave, sets, winnerTeamId]);

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3">
      <p className="text-sm font-medium">
        {match.teamA.teamName} vs {match.teamB.teamName}
      </p>
      <p className="text-xs text-zinc-500">Estado: {match.status === "completed" ? "Completado" : "Pendiente"}</p>
      <p className="text-xs text-zinc-600">Marcador actual: {formatMatchResult(match)}</p>

      <div className="space-y-1.5">
        <Label htmlFor={`winner-${match.id}`} className="text-xs text-zinc-500">
          Ganador
        </Label>
        <select
          id={`winner-${match.id}`}
          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
          value={winnerTeamId}
          onChange={(event) => setWinnerTeamId(event.target.value)}
          disabled={isSubmitting}
        >
          <option value={match.teamA.id}>{match.teamA.teamName}</option>
          <option value={match.teamB.id}>{match.teamB.teamName}</option>
        </select>
      </div>

      {sets.map((set, index) => (
        <div key={`${match.id}-set-${index + 1}`} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
          <Label className="text-xs text-zinc-500">Set {index + 1}</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={set.teamAGames}
            onChange={(event) => updateSetField(index, "teamAGames", event.target.value)}
            placeholder="0"
            disabled={isSubmitting}
          />
          <span className="text-xs text-zinc-500">-</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={set.teamBGames}
            onChange={(event) => updateSetField(index, "teamBGames", event.target.value)}
            placeholder="0"
            disabled={isSubmitting}
          />
        </div>
      ))}

      {localError ? <p className="text-xs text-rose-700">{localError}</p> : null}

      <Button className="w-full" size="sm" disabled={isSubmitting} onClick={() => void handleSave()}>
        {match.status === "completed" ? "Actualizar resultado" : "Guardar resultado"}
      </Button>
    </div>
  );
}

function FreeMatchResultEditor({
  match,
  onSave,
  isSubmitting,
}: {
  match: FreeMatchView;
  onSave: (matchId: string, payload: TournamentFreeMatchResultInput) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [winnerTeamId, setWinnerTeamId] = useState(
    match.result?.winnerTeamId ?? match.teamB?.id ?? match.teamA.id,
  );
  const [scoreText, setScoreText] = useState(match.result?.scoreText ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const normalized = scoreText.trim();
    if (!normalized) {
      setLocalError("Debes ingresar el resultado.");
      return;
    }

    try {
      setLocalError(null);
      await onSave(match.id, {
        winnerTeamId,
        scoreText: normalized,
      });
    } catch {
      return;
    }
  }, [match.id, onSave, scoreText, winnerTeamId]);

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3">
      <p className="text-sm font-medium">
        {match.teamA.teamName} vs {match.teamB?.teamName ?? "BYE"}
      </p>
      <p className="text-xs text-zinc-500">Estado: {match.status === "completed" ? "Completado" : "Pendiente"}</p>
      <p className="text-xs text-zinc-600">Marcador actual: {formatFreeMatchResult(match)}</p>

      <div className="space-y-1.5">
        <Label htmlFor={`free-winner-${match.id}`} className="text-xs text-zinc-500">
          Ganador
        </Label>
        <select
          id={`free-winner-${match.id}`}
          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
          value={winnerTeamId}
          onChange={(event) => setWinnerTeamId(event.target.value)}
          disabled={isSubmitting || !match.teamB}
        >
          <option value={match.teamA.id}>{match.teamA.teamName}</option>
          {match.teamB ? <option value={match.teamB.id}>{match.teamB.teamName}</option> : null}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`free-score-${match.id}`} className="text-xs text-zinc-500">
          Resultado libre
        </Label>
        <Input
          id={`free-score-${match.id}`}
          value={scoreText}
          onChange={(event) => setScoreText(event.target.value)}
          placeholder="Ej: 6-4, 6-3 / W.O."
          disabled={isSubmitting}
        />
      </div>

      {localError ? <p className="text-xs text-rose-700">{localError}</p> : null}

      <Button className="w-full" size="sm" disabled={isSubmitting} onClick={() => void handleSave()}>
        {match.status === "completed" ? "Actualizar resultado" : "Guardar resultado"}
      </Button>
    </div>
  );
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
  onReportMatchResult,
  onCreateFreeRound,
  onReportFreeMatchResult,
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
  onReportMatchResult: (matchId: string, payload: { winnerTeamId: string; sets: TournamentSetScore[] }) => Promise<void>;
  onCreateFreeRound: (payload: TournamentFreeRoundCreateRequest) => Promise<void>;
  onReportFreeMatchResult: (matchId: string, payload: TournamentFreeMatchResultInput) => Promise<void>;
  error: string | null;
  feedback: string | null;
  isSubmitting: boolean;
}) {
  const categoryUrl = buildTournamentCategoryUrl(
    typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin,
    dashboard.tournament.slug,
    dashboard.category.slug,
  );

  const competitionMode = categoryDetail.category.competitionMode;
  const groupStage = categoryDetail.groupStage;
  const freeStage = categoryDetail.freeStage;
  const categoryFrozen = Boolean(groupStage || freeStage);
  const fixtureGenerated = hasGeneratedGroupMatches(categoryDetail);
  const canGenerateGroups = !groupStage;
  const canGenerateMatches = Boolean(groupStage) && !fixtureGenerated && groupsReadyForFixture(categoryDetail);
  const confirmedTeams = dashboard.registrations.confirmed.map((registration) => ({
    id: registration.teamId,
    name: registration.teamName,
  }));
  const latestFreeRound = freeStage?.rounds[freeStage.rounds.length - 1] ?? null;

  const [manualRoundName, setManualRoundName] = useState("");
  const [manualPairings, setManualPairings] = useState<Array<{ teamAId: string; teamBId: string }>>([
    { teamAId: "", teamBId: "" },
  ]);

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
            <p>Cupos disponibles {categoryDetail.category.slotsRemaining}</p>
            <p>
              Sin pago confirmado {dashboard.category.counts.pending} · Lista de espera {dashboard.category.counts.waitlist} · Bajas {dashboard.category.counts.cancelled}
            </p>
            {categoryFrozen ? (
              <p className="text-amber-700">
                Categoría congelada: no se permiten cambios de inscripción después de iniciar la competencia.
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

        {competitionMode === "groups" ? (
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
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operación libre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() =>
                  void onCreateFreeRound({
                    sourceType: "random",
                    sourceRoundId: latestFreeRound?.id,
                  })
                }
                disabled={isSubmitting || confirmedTeams.length === 0}
              >
                {latestFreeRound ? "Crear siguiente ronda aleatoria (ganadores)" : "Crear ronda aleatoria"}
              </Button>

              <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-semibold">Ronda manual</p>
                <Input
                  value={manualRoundName}
                  onChange={(event) => setManualRoundName(event.target.value)}
                  placeholder="Nombre ronda (opcional)"
                  disabled={isSubmitting}
                />

                {manualPairings.map((pairing, index) => (
                  <div key={`pairing-${index}`} className="grid grid-cols-2 gap-2">
                    <select
                      className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                      value={pairing.teamAId}
                      disabled={isSubmitting}
                      onChange={(event) =>
                        setManualPairings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, teamAId: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      <option value="">Equipo A</option>
                      {confirmedTeams.map((team) => (
                        <option key={`team-a-${index}-${team.id}`} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
                      value={pairing.teamBId}
                      disabled={isSubmitting}
                      onChange={(event) =>
                        setManualPairings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, teamBId: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      <option value="">BYE</option>
                      {confirmedTeams.map((team) => (
                        <option key={`team-b-${index}-${team.id}`} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={() => setManualPairings((current) => [...current, { teamAId: "", teamBId: "" }])}
                >
                  Agregar cruce manual
                </Button>

                <Button
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={() =>
                    void onCreateFreeRound({
                      name: manualRoundName || undefined,
                      sourceType: "manual",
                      sourceRoundId: latestFreeRound?.id,
                      manualPairings: manualPairings
                        .filter((pairing) => pairing.teamAId)
                        .map((pairing) => ({
                          teamAId: pairing.teamAId,
                          teamBId: pairing.teamBId || null,
                        })),
                    })
                  }
                >
                  {latestFreeRound ? "Crear siguiente ronda manual (ganadores)" : "Crear ronda manual"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {competitionMode === "groups" && groupStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultados de grupos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fixtureGenerated ? (
                groupStage.matchesByGroup.map((group) => (
                  <div key={`result-${group.groupId}`} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-semibold">Grupo {group.groupName}</p>
                    {group.matches.map((match) => (
                      <MatchResultEditor
                        key={`${match.id}-${match.status}-${match.result?.winnerTeamId ?? "none"}-${match.result?.sets.map((set) => `${set.teamAGames}-${set.teamBGames}`).join("_") ?? "none"}`}
                        match={match}
                        onSave={onReportMatchResult}
                        isSubmitting={isSubmitting}
                      />
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-600">Genera el fixture para empezar a reportar resultados.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {competitionMode === "free" && freeStage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultados libres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {freeStage.rounds.map((round) => (
                <div key={`free-round-${round.id}`} className="space-y-2 rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold">
                    {round.name} · {round.sourceType === "random" ? "Aleatoria" : "Manual"}
                  </p>
                  {round.matches.length === 0 ? (
                    <p className="text-sm text-zinc-500">Sin cruces.</p>
                  ) : (
                    round.matches.map((match) => (
                      <FreeMatchResultEditor
                        key={`${match.id}-${match.status}-${match.result?.winnerTeamId ?? "none"}-${match.result?.scoreText ?? "none"}`}
                        match={match}
                        onSave={onReportFreeMatchResult}
                        isSubmitting={isSubmitting}
                      />
                    ))
                  )}
                </div>
              ))}
            </CardContent>
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
              <CardTitle className="text-base">{REGISTRATION_STATUS_LABEL[status]}</CardTitle>
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
                        En espera
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onChangeStatus(registration.id, "pending")}
                        disabled={isSubmitting || categoryFrozen}
                      >
                        Sin pago
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

      if (categoryDetail?.groupStage || categoryDetail?.freeStage) {
        setError("La categoría está congelada después de iniciar la competencia.");
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
    [categoryDetail?.freeStage, categoryDetail?.groupStage, reload, token],
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

  const onReportMatchResult = useCallback(
    async (matchId: string, payload: { winnerTeamId: string; sets: TournamentSetScore[] }) => {
      if (!token) {
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        await reportAdminTournamentGroupMatchResult(token, tournamentSlug, categorySlug, matchId, payload);
        setFeedback("Resultado guardado.");
        await reload();
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [categorySlug, reload, token, tournamentSlug],
  );

  const onCreateFreeRound = useCallback(
    async (payload: TournamentFreeRoundCreateRequest) => {
      if (!token) {
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        await createAdminTournamentFreeRound(token, tournamentSlug, categorySlug, payload);
        setFeedback("Ronda libre creada.");
        await reload();
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [categorySlug, reload, token, tournamentSlug],
  );

  const onReportFreeMatchResult = useCallback(
    async (matchId: string, payload: TournamentFreeMatchResultInput) => {
      if (!token) {
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);
        await reportAdminTournamentFreeMatchResult(token, tournamentSlug, categorySlug, matchId, payload);
        setFeedback("Resultado libre guardado.");
        await reload();
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setIsSubmitting(false);
      }
    },
    [categorySlug, reload, token, tournamentSlug],
  );

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
    onReportMatchResult,
    onCreateFreeRound,
    onReportFreeMatchResult,
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
      onReportMatchResult={actions.onReportMatchResult}
      onCreateFreeRound={actions.onCreateFreeRound}
      onReportFreeMatchResult={actions.onReportFreeMatchResult}
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
      onReportMatchResult={actions.onReportMatchResult}
      onCreateFreeRound={actions.onCreateFreeRound}
      onReportFreeMatchResult={actions.onReportFreeMatchResult}
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
