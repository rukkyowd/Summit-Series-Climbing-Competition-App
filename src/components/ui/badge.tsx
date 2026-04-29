import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "live" | "contrast" | "linear" | "linearMuted";

export function badgeStyles(variant: BadgeVariant = "default") {
  return cn(
    "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] sm:px-3 sm:py-1.5 sm:text-xs sm:tracking-[0.2em]",
    variant === "default" &&
      "border border-white bg-white/80 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)]",
    variant === "live" &&
      "border border-red-200 bg-red-50 text-red-700 shadow-[0_10px_22px_rgba(239,68,68,0.08)]",
    variant === "contrast" &&
      "border border-white/30 bg-white/15 text-white shadow-none",
    variant === "linear" &&
      "border border-[rgba(94,106,210,0.3)] bg-[rgba(94,106,210,0.14)] text-[#cfd5ff] shadow-[0_0_0_1px_rgba(94,106,210,0.14),0_10px_24px_rgba(26,33,82,0.18)]",
    variant === "linearMuted" &&
      "border border-white/[0.08] bg-white/[0.05] text-[#a0a5af] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
  );
}

type BadgeProps = PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }
>;

export function Badge({ children, className, variant = "default", ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles(variant), className)} {...props}>
      {children}
    </span>
  );
}
