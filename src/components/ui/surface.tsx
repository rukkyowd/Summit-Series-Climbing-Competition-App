import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type SurfaceVariant =
  | "card"
  | "panel"
  | "feature"
  | "meta"
  | "row"
  | "linearCard"
  | "linearPanel"
  | "linearFeature"
  | "linearMeta";

export function surfaceStyles(variant: SurfaceVariant = "card") {
  return cn(
    variant === "card" &&
      "relative min-w-0 overflow-hidden rounded-[1.9rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:rounded-[2.2rem] sm:p-8",
    variant === "panel" &&
      "min-w-0 rounded-[1.8rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,250,252,0.76))] p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur-md",
    variant === "feature" &&
      "relative min-w-0 rounded-[1.9rem] border border-white/60 bg-white/75 p-6 shadow-[0_10px_34px_rgba(15,23,42,0.1)] backdrop-blur-md",
    variant === "meta" &&
      "min-w-0 rounded-[1.6rem] border border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] backdrop-blur-md",
    variant === "row" &&
      "relative min-w-0 rounded-[1.8rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,250,252,0.78))] px-5 py-5 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-200 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:px-6 sm:py-6",
    variant === "linearCard" &&
      "relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 text-[#edecef] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_2px_20px_rgba(0,0,0,0.42),0_0_40px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:p-8",
    variant === "linearPanel" &&
      "relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(10,10,12,0.92),rgba(7,7,9,0.88))] p-6 text-[#edecef] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_16px_40px_rgba(0,0,0,0.4),0_0_80px_rgba(94,106,210,0.08)] backdrop-blur-xl",
    variant === "linearFeature" &&
      "relative min-w-0 overflow-hidden rounded-2xl border border-[rgba(94,106,210,0.18)] bg-[radial-gradient(circle_at_top,rgba(94,106,210,0.18),transparent_46%),linear-gradient(180deg,rgba(14,14,18,0.96),rgba(7,7,9,0.92))] p-6 text-[#edecef] shadow-[0_0_0_1px_rgba(94,106,210,0.16),0_16px_44px_rgba(0,0,0,0.48),0_0_80px_rgba(94,106,210,0.12)] backdrop-blur-xl",
    variant === "linearMeta" &&
      "relative min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-4 text-[#b8bcc4] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_28px_rgba(0,0,0,0.26)] backdrop-blur-lg"
  );
}

type SurfaceProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }
>;

export function Surface({ children, className, variant = "card", ...props }: SurfaceProps) {
  return (
    <div className={cn(surfaceStyles(variant), className)} {...props}>
      {children}
    </div>
  );
}
