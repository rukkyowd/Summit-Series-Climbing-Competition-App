"use client";

import { useEffect, useState } from "react";

export interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
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
  expectedValue,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const requiresMatch = Boolean(expectedValue?.trim());
  const canConfirm = !requiresMatch || typedValue.trim() === expectedValue?.trim();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="results-kicker">Confirmation required</div>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-slate-600">{description}</p>

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
            className="results-primary-button"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
