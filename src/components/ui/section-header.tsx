import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionHeaderProps = {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "default" | "wide";
  className?: string;
};

export function SectionHeader({
  kicker,
  title,
  description,
  align = "default",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("min-w-0", className)}>
      {kicker ? <div className="results-kicker">{kicker}</div> : null}
      <div
        className={cn(
          "mt-2 break-words font-semibold tracking-tight text-slate-950",
          align === "wide" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
        )}
      >
        {title}
      </div>
      {description ? (
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </div>
  );
}
