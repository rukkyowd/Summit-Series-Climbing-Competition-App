"use client";

import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

type DemoGuideAction =
  | {
      label: string;
      href: string;
      primary?: boolean;
      disabled?: never;
      onClick?: never;
    }
  | {
      label: string;
      onClick: () => void;
      primary?: boolean;
      disabled?: boolean;
      href?: never;
    };

type DemoGuideBannerProps = {
  title: string;
  body: string;
  eyebrow?: string;
  actions?: DemoGuideAction[];
  tone?: "info" | "success";
  className?: string;
};

export function DemoGuideBanner({
  title,
  body,
  eyebrow = "Summit Series Demo",
  actions = [],
  tone = "info",
  className,
}: DemoGuideBannerProps) {
  return (
    <Surface
      variant="card"
      className={cn(
        "border-sky-200 bg-sky-50/80 p-5 sm:p-6",
        tone === "success" && "border-emerald-200 bg-emerald-50/90",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className={cn("results-kicker text-sky-700", tone === "success" && "text-emerald-700")}>
            {eyebrow}
          </div>
          <h2 className="break-words text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-700">{body}</p>
        </div>
        {actions.length ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions.map((action) =>
              action.href ? (
                <Link
                  key={action.label}
                  href={action.href}
                  className={buttonStyles({
                    variant: action.primary ? "primary" : "secondary",
                    size: "compact",
                  })}
                >
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={buttonStyles({
                    variant: action.primary ? "primary" : "secondary",
                    size: "compact",
                  })}
                >
                  {action.label}
                </button>
              )
            )}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
