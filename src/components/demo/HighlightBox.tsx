"use client";

import type { PropsWithChildren } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

type HighlightBoxProps = PropsWithChildren<{
  active?: boolean;
  className?: string;
  id?: string;
}>;

export function HighlightBox({ active = false, children, className, id }: HighlightBoxProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id={id}
      className={cn("relative min-w-0 rounded-[1.45rem]", className)}
      animate={
        active
          ? {
              boxShadow: reduceMotion
                ? "0 0 0 2px rgba(14,116,215,0.32)"
                : [
                    "0 0 0 2px rgba(14,116,215,0.24), 0 0 0 rgba(14,116,215,0)",
                    "0 0 0 2px rgba(14,116,215,0.42), 0 0 34px rgba(14,116,215,0.22)",
                    "0 0 0 2px rgba(14,116,215,0.24), 0 0 0 rgba(14,116,215,0)",
                  ],
            }
          : { boxShadow: "0 0 0 0 rgba(14,116,215,0)" }
      }
      transition={active && !reduceMotion ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
    >
      {active ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-sky-300/80"
          initial={false}
          animate={reduceMotion ? { opacity: 1 } : { opacity: [0.58, 1, 0.58] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      {children}
    </motion.div>
  );
}
