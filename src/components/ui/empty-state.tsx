import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-slate-600",
        className
      )}
      {...props}
    >
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p> : null}
      <h2 className="mt-2 text-xl font-bold text-slate-950">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
