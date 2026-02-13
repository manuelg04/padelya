import { cn } from "@/src/lib/utils";

interface ProgressProps extends React.ComponentProps<"div"> {
  value: number;
  max?: number;
}

export function Progress({ value, max = 100, className, ...props }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-zinc-200", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
