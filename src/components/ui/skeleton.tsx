import { cn } from "@/src/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70", className)} {...props} />;
}
