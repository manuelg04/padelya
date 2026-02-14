import { memo } from "react";
import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { formatFeedSchedule } from "@/src/domain/match";
import { MAX_PLAYERS, type MatchView, type Modality } from "@/src/domain/types";
import { cn } from "@/src/lib/utils";

const MODALITY_LABEL: Record<Modality, string> = {
  mixto: "Mixto",
  masc: "Masc",
  fem: "Fem",
};

type OpenMatchCardProps = {
  match: MatchView;
  isNew?: boolean;
  isHighlighted?: boolean;
};

export const OpenMatchCard = memo(function OpenMatchCard({
  match,
  isNew = false,
  isHighlighted = false,
}: OpenMatchCardProps) {
  const schedule = formatFeedSchedule(match.startsAtUtc);
  const participantCount = match.participants.length;

  return (
    <Card
      data-testid={`open-match-card-${match.publicId}`}
      className={cn(isHighlighted && "ring-2 ring-emerald-300/80 bg-emerald-50/50")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{match.club}</CardTitle>
          <div className="flex items-center gap-1.5">
            {isNew ? (
              <Badge variant="success" data-testid={`new-badge-${match.publicId}`}>
                Nuevo
              </Badge>
            ) : null}
            <Badge variant="neutral">{MODALITY_LABEL[match.modality]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-zinc-600">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
          <span>{schedule}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-zinc-700">
            <Users className="h-4 w-4 text-zinc-400" />
            <span className="font-medium">Cupos</span>
            <span>{participantCount}/{MAX_PLAYERS}</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/partido/${match.publicId}`} aria-label={`Ver ${match.club}`}>
              Ver
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
