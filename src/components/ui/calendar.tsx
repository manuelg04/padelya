"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        caption: "relative flex items-center justify-center pt-1",
        caption_label: "text-sm font-semibold text-zinc-900",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "absolute left-1 h-8 w-8 rounded-md p-0 text-zinc-700 hover:text-zinc-900",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "absolute right-1 h-8 w-8 rounded-md p-0 text-zinc-700 hover:text-zinc-900",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs font-medium text-zinc-500",
        week: "mt-2 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 rounded-md p-0 font-normal text-zinc-900 aria-selected:opacity-100",
        ),
        selected:
          "bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white focus:bg-emerald-600 focus:text-white",
        today: "bg-emerald-100 text-emerald-900",
        outside: "text-zinc-300 aria-selected:bg-zinc-100 aria-selected:text-zinc-500",
        disabled: "text-zinc-300 opacity-60",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", className)} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", className)} />
          ),
      }}
      {...props}
    />
  );
}
