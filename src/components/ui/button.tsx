import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "linearPrimary"
  | "linearSecondary"
  | "linearGhost";
type ButtonSize = "default" | "compact" | "sm" | "md" | "lg" | "touch";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const buttonBase =
  "inline-flex items-center justify-center rounded-full text-center font-semibold transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 hover:-translate-y-0.5 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const buttonSizes: Record<ButtonSize, string> = {
  default: "min-h-12 px-4 py-3 text-sm sm:px-6",
  compact: "min-h-10 px-4 py-2.5 text-sm",
  sm: "min-h-8 px-3 py-2 text-xs",
  md: "min-h-10 px-4 py-2.5 text-sm",
  lg: "min-h-12 px-5 py-3 text-base sm:px-6",
  touch: "min-h-14 px-6 py-4 text-lg",
};

export function buttonStyles({
  variant = "secondary",
  size = "default",
  fullWidth = false,
}: ButtonStyleOptions = {}) {
  return cn(
    buttonBase,
    buttonSizes[size],
    fullWidth && "w-full",
    variant === "primary" &&
      "bg-[linear-gradient(135deg,#0f8ae8,#1d6fd8)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_26px_rgba(14,116,215,0.18)] hover:shadow-[0_18px_36px_rgba(14,116,215,0.22)]",
    variant === "secondary" &&
      "border border-slate-200/90 bg-white/80 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-white",
    variant === "ghost" &&
      "border border-slate-200/70 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900",
    variant === "danger" &&
      "border border-red-200 bg-[linear-gradient(180deg,#fff5f5,#ffe3e3)] text-red-700 shadow-[0_10px_24px_rgba(220,38,38,0.08)] hover:border-red-300",
    variant === "linearPrimary" &&
      "border border-[rgba(94,106,210,0.55)] bg-[linear-gradient(180deg,#6872d9,#5e6ad2_55%,#5360c7)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_0_1px_rgba(94,106,210,0.3),0_12px_30px_rgba(94,106,210,0.28),0_0_48px_rgba(94,106,210,0.18)] hover:border-[rgba(104,114,217,0.72)] hover:bg-[linear-gradient(180deg,#727ce0,#6872d9_55%,#5a66cf)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_rgba(104,114,217,0.34),0_18px_38px_rgba(94,106,210,0.34),0_0_72px_rgba(94,106,210,0.24)] focus-visible:ring-[rgba(94,106,210,0.45)] focus-visible:ring-offset-[#050506]",
    variant === "linearSecondary" &&
      "border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] text-[#edecef] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.28)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_16px_34px_rgba(0,0,0,0.34)] focus-visible:ring-[rgba(94,106,210,0.38)] focus-visible:ring-offset-[#050506]",
    variant === "linearGhost" &&
      "border border-transparent bg-transparent text-[#8a8f98] hover:border-[rgba(255,255,255,0.08)] hover:bg-white/[0.05] hover:text-[#edecef] focus-visible:ring-[rgba(94,106,210,0.38)] focus-visible:ring-offset-[#050506]"
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
