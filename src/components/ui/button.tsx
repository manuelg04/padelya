import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500",
        secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 focus-visible:ring-zinc-400",
        outline: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 focus-visible:ring-emerald-500",
        destructive: "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500",
        ghost: "hover:bg-zinc-100 text-zinc-800",
        whatsapp: "bg-[#25D366] text-white hover:bg-[#1fb855] focus-visible:ring-[#25D366]",
      },
      size: {
        default: "min-h-[44px] px-4 py-2",
        sm: "h-9 px-3",
        lg: "min-h-[48px] px-6 py-3 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
