import { Badge } from "@/src/components/ui/badge";
import type { MatchStatus } from "@/src/domain/types";

const STATUS_CONFIG: Record<MatchStatus, { variant: "success" | "warning" | "danger"; label: string; dotColor: string }> = {
  abierta: { variant: "success", label: "Abierta", dotColor: "bg-emerald-500" },
  cerrada: { variant: "warning", label: "Cerrada", dotColor: "bg-amber-500" },
  cancelada: { variant: "danger", label: "Cancelada", dotColor: "bg-rose-500" },
  no_se_armo: { variant: "warning", label: "No se armó", dotColor: "bg-orange-500" },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const { variant, label, dotColor } = STATUS_CONFIG[status];

  return (
    <Badge variant={variant}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}
