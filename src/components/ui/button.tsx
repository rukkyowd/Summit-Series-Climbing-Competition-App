import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "compact";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const buttonBase =
  "inline-flex items-center justify-center rounded-full text-center font-semibold transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 hover:-translate-y-0.5 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

export function buttonStyles({
  variant = "secondary",
  size = "default",
  fullWidth = false,
}: ButtonStyleOptions = {}) {
  return cn(
    buttonBase,
    size === "default" ? "min-h-12 px-4 py-3 text-sm sm:px-6" : "min-h-10 px-4 py-2.5 text-sm",
    fullWidth && "w-full",
    variant === "primary" &&
      "bg-[linear-gradient(135deg,#0f8ae8,#1d6fd8)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_26px_rgba(14,116,215,0.18)] hover:shadow-[0_18px_36px_rgba(14,116,215,0.22)]",
    variant === "secondary" &&
      "border border-slate-200/90 bg-white/80 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-white",
    variant === "ghost" &&
      "border border-slate-200/70 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900",
    variant === "danger" &&
      "border border-red-200 bg-[linear-gradient(180deg,#fff5f5,#ffe3e3)] text-red-700 shadow-[0_10px_24px_rgba(220,38,38,0.08)] hover:border-red-300"
  );
}

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleOptions
>;

export function Button({
  children,
  className,
  variant,
  size,
  fullWidth,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
