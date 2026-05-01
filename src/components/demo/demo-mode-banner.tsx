import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function DemoModeBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-sky-200 bg-sky-50/95 px-5 py-4 text-slate-900 shadow-[0_16px_38px_rgba(14,116,144,0.08)]",
        className
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">
            Demo Mode
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            Changes are safe and resettable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/demo" className={buttonStyles({ variant: "secondary", size: "compact" })}>
            View Guide
          </Link>
          <Link href="/demo" className={buttonStyles({ variant: "danger", size: "compact" })}>
            Reset Demo
          </Link>
          <Link href="/" className={buttonStyles({ variant: "ghost", size: "compact" })}>
            Exit Demo
          </Link>
        </div>
      </div>
    </div>
  );
}
