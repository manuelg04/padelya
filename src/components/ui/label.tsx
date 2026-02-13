import * as React from "react";

import { cn } from "@/src/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-zinc-700 leading-none peer-disabled:cursor-not-allowed", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
