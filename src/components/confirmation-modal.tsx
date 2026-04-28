"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  expectedValue?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  confirmTone = "default",
  expectedValue,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  const [typedValue, setTypedValue] = useState("");
  const reduceMotion = useReducedMotion();
  const isAdvanceWorkflow = title.toLowerCase().includes("advance to finals");

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  const requiresMatch = Boolean(expectedValue?.trim());
  const canConfirm = !requiresMatch || typedValue.trim() === expectedValue?.trim();
  const overlayTransition = reduceMotion ? { duration: 0.12 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const panelTransition = reduceMotion
    ? { duration: 0.16 }
    : { type: "spring", stiffness: 280, damping: 26, mass: 0.9 } as const;
  const contentVariants = {
    closed: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    open: { opacity: 1, y: 0 },
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8"
          initial="closed"
          animate="open"
          exit="closed"
        >
          <motion.div
            aria-hidden="true"
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            variants={{
              open: { opacity: 1 },
              closed: { opacity: 0 },
            }}
            transition={overlayTransition}
          />
          <motion.div
            className="motion-aurora-panel relative w-full max-w-lg rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
            variants={{
              open: reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
              closed: reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 18, scale: 0.97, filter: "blur(6px)" },
            }}
            transition={panelTransition}
          >
            <motion.div
              className="space-y-4"
              variants={{
                open: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
                closed: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
              }}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <motion.div variants={contentVariants}>
                <div className="results-kicker">Confirmation required</div>
                <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>
              </motion.div>

              <motion.div
                variants={contentVariants}
                className={isAdvanceWorkflow ? "rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(255,255,255,0.96))] px-4 py-4 shadow-[0_16px_32px_rgba(14,116,215,0.08)]" : ""}
              >
                <p className="text-sm leading-7 text-slate-600">{description}</p>
                {isAdvanceWorkflow ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="results-chip border-sky-200 bg-sky-50 text-sky-800">Seed finals field</span>
                    <span className="results-chip border-amber-200 bg-amber-50 text-amber-800">Undo stays available</span>
                    <span className="results-chip border-emerald-200 bg-emerald-50 text-emerald-800">Public state updates live</span>
                  </div>
                ) : null}
              </motion.div>

              {requiresMatch ? (
                <motion.label variants={contentVariants} className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">
                    Type <span className="font-semibold text-slate-950">{expectedValue}</span> to continue
                  </span>
                  <input
                    value={typedValue}
                    onChange={(event) => setTypedValue(event.target.value)}
                    className="results-input"
                    placeholder={expectedValue}
                    aria-label="Confirmation text"
                  />
                </motion.label>
              ) : null}

              <motion.div variants={contentVariants} className="mt-2 flex flex-wrap justify-end gap-3">
                <motion.button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="results-secondary-button"
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => void onConfirm()}
                  disabled={busy || !canConfirm}
                  className={confirmTone === "danger" ? "results-danger-button" : "results-primary-button"}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  animate={busy ? { opacity: 0.92 } : { opacity: 1 }}
                  transition={{ duration: 0.16 }}
                >
                  {busy ? "Working..." : confirmLabel}
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
