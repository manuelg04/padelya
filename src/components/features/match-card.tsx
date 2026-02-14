import { memo } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Users } from "lucide-react";

import type { MatchStatus, MatchView } from "@/src/domain/types";
import { MAX_PLAYERS } from "@/src/domain/types";
import { utcIsoToBogotaParts } from "@/src/domain/match";
import { StatusBadge } from "@/src/components/features/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

const STATUS_BORDER_COLOR: Record<MatchStatus, string> = {
  abierta: "border-l-emerald-500",
  cerrada: "border-l-amber-500",
  cancelada: "border-l-rose-400",
  no_se_armo: "border-l-orange-400",
};

const PLAYER_SLOT_INDEXES = Array.from({ length: MAX_PLAYERS }, (_, index) => index);

export const MatchCard = memo(function MatchCard({ match }: { match: MatchView }) {
  const { date, time } = utcIsoToBogotaParts(match.startsAtUtc);
  const borderColor = STATUS_BORDER_COLOR[match.status];
  const participantCount = match.participants.length;

  return (
    <Link href={`/partido/${match.publicId}`} className="block group">
      <Card className={`border-l-[3px] ${borderColor} transition-all hover:border-l-4 hover:shadow-md`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base group-hover:text-emerald-700 transition-colors">{match.club}</CardTitle>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={match.status} />
              <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>{date} · {time}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="capitalize">{match.category} · {match.modality}</span>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-zinc-400" />
              <div className="flex gap-0.5">
                {PLAYER_SLOT_INDEXES.map((slotIndex) => (
                  <div
                    key={slotIndex}
                    className={`h-2 w-2 rounded-full ${
                      slotIndex < participantCount ? "bg-emerald-500" : "bg-zinc-200"
                    }`}
                  />
                ))}
              </div>
              <span className="ml-0.5 text-xs font-semibold text-zinc-700">
                {participantCount}/{MAX_PLAYERS}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
