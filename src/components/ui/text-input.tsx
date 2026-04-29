import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-[1.3rem] border border-slate-200/90 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_8px_20px_rgba(15,23,42,0.03)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  );
}
