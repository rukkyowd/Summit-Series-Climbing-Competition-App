import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatCardTone = "default" | "success" | "warning" | "danger" | "live";

const toneStyles: Record<StatCardTone, string> = {
  default: "border-slate-200 bg-white/75 text-slate-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
  live: "border-sky-200 bg-sky-50 text-sky-950",
};

type StatCardProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: StatCardTone;
};

export function StatCard({ label, value, helper, tone = "default", className, ...props }: StatCardProps) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneStyles[tone], className)} {...props}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-60">{label}</p>
      <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
      {helper ? <div className="mt-2 text-sm opacity-70">{helper}</div> : null}
    </div>
  );
}
