"use client";

import { useEffect, useState } from "react";

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
  const isAdvanceWorkflow = title.toLowerCase().includes("advance to finals");

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  const requiresMatch = Boolean(expectedValue?.trim());
  const canConfirm = !requiresMatch || typedValue.trim() === expectedValue?.trim();

  return (
    open ? (
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8">
        <div aria-hidden="true" className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" />
        <div className="relative w-full max-w-lg rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="results-kicker">Confirmation required</div>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>

          <div className={isAdvanceWorkflow ? "mt-4 rounded-[1.35rem] border border-sky-100 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(255,255,255,0.96))] px-4 py-4 shadow-[0_16px_32px_rgba(14,116,215,0.08)]" : "mt-4"}>
            <p className="text-sm leading-7 text-slate-600">{description}</p>
            {isAdvanceWorkflow ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="results-chip border-sky-200 bg-sky-50 text-sky-800">Seed finals field</span>
                <span className="results-chip border-amber-200 bg-amber-50 text-amber-800">Undo stays available</span>
                <span className="results-chip border-emerald-200 bg-emerald-50 text-emerald-800">Public state updates live</span>
              </div>
            ) : null}
          </div>

          {requiresMatch ? (
            <label className="mt-5 block space-y-2">
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
            </label>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={busy} className="results-secondary-button">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={busy || !canConfirm}
              className={confirmTone === "danger" ? "results-danger-button" : "results-primary-button"}
            >
              {busy ? "Working..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    ) : null
  );
}
