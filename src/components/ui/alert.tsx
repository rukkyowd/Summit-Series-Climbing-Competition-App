import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type AlertVariant = "info" | "success" | "warning" | "error";

export function alertStyles(variant: AlertVariant = "info") {
  return cn(
    "rounded-[1.2rem] border px-4 py-3 text-sm shadow-[0_12px_24px_rgba(15,23,42,0.04)]",
    variant === "info" && "border-slate-200 bg-white/75 text-slate-700",
    variant === "success" && "border-green-200 bg-green-50 text-green-700",
    variant === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
    variant === "error" && "border-red-200 bg-red-50 text-red-700"
  );
}

type AlertProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }
>;

export function Alert({ children, className, variant = "info", ...props }: AlertProps) {
  return (
    <div className={cn(alertStyles(variant), className)} {...props}>
      {children}
    </div>
  );
}
