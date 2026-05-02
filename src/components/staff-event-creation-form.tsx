"use client";

import { slugifyCompetitionName, type EventFormat } from "@/lib/scoring";

export type StaffEventCreationFormValues = {
  name: string;
  format: EventFormat;
  location: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  description: string;
  maxClimbers?: number;
};

type FormatOption = {
  value: EventFormat;
  label: string;
};

type StaffEventCreationFormProps = {
  values: StaffEventCreationFormValues;
  formatOptions: readonly FormatOption[];
  disabled?: boolean;
  pending?: boolean;
  submitLabel: string;
  submittingLabel?: string;
  canSubmit?: boolean;
  mode?: "staff" | "guided-demo";
  lockedPresetLabel?: string;
  showCapacity?: boolean;
  showRegistrationStory?: boolean;
  hideSubmit?: boolean;
  onChange: (values: StaffEventCreationFormValues) => void;
  onSubmit: () => void;
  importedLinksSummary?: string | null;
};

function formatDateTimeLocalInput(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function parseDateTimeLocalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function StaffEventCreationForm({
  values,
  formatOptions,
  disabled = false,
  pending = false,
  submitLabel,
  submittingLabel = "Creating...",
  canSubmit = true,
  mode = "staff",
  lockedPresetLabel,
  showCapacity = false,
  showRegistrationStory = false,
  hideSubmit = false,
  onChange,
  onSubmit,
  importedLinksSummary,
}: StaffEventCreationFormProps) {
  const formDisabled = disabled || pending;

  return (
    <fieldset disabled={formDisabled} className={formDisabled ? "mt-4 grid gap-3 opacity-70" : "mt-4 grid gap-3"}>
      {mode === "guided-demo" && lockedPresetLabel ? (
        <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
          <span className="font-semibold">Locked preset:</span> {lockedPresetLabel}. This is the
          same event creation form staff use, with the preset locked because the guided story needs
          qualifier scoring, finalist advancement, finals, and public results.
        </div>
      ) : null}

      <label className="results-field-group" htmlFor="create-event-name">
        <span className="results-field-label">Event name</span>
        <input
          id="create-event-name"
          aria-label="Event name"
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          className="results-input"
          placeholder="Spring Send"
          data-demo-anchor="organizer-create-name"
        />
      </label>

      <label className="results-field-group" htmlFor="create-event-slug-preview">
        <span className="results-field-label">Link preview</span>
        <input
          id="create-event-slug-preview"
          aria-label="Event link preview"
          value={slugifyCompetitionName(values.name)}
          readOnly
          className="results-input bg-slate-50 text-slate-500"
          placeholder="spring-send"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="results-field-group" htmlFor="create-event-format">
          <span className="results-field-label">Format</span>
          <select
            id="create-event-format"
            aria-label="Event format"
            value={values.format}
            onChange={(event) => onChange({ ...values, format: event.target.value as EventFormat })}
            className="results-input"
            disabled={mode === "guided-demo" || formDisabled}
          >
            {formatOptions.map((template) => (
              <option key={template.value} value={template.value}>
                {template.label}
              </option>
            ))}
          </select>
          {mode === "guided-demo" ? (
            <span className="text-xs leading-5 text-slate-500">
              Qualifier-only formats are disabled in the guided story.
            </span>
          ) : null}
        </label>

        <label className="results-field-group" htmlFor="create-event-location">
          <span className="results-field-label">Location</span>
          <input
            id="create-event-location"
            aria-label="Event location"
            value={values.location}
            onChange={(event) => onChange({ ...values, location: event.target.value })}
            className="results-input"
            placeholder="North Summit Climbing"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="results-field-group" htmlFor="create-event-start-date">
          <span className="results-field-label">Start date</span>
          <input
            id="create-event-start-date"
            aria-label="Event start date"
            type="date"
            value={values.startDate}
            onChange={(event) =>
              onChange({
                ...values,
                startDate: event.target.value,
                endDate: values.endDate || event.target.value,
              })
            }
            className="results-input"
          />
        </label>

        <label className="results-field-group" htmlFor="create-event-end-date">
          <span className="results-field-label">End date</span>
          <input
            id="create-event-end-date"
            aria-label="Event end date"
            type="date"
            value={values.endDate}
            onChange={(event) => onChange({ ...values, endDate: event.target.value })}
            className="results-input"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="results-field-group" htmlFor="create-event-registration-opens">
          <span className="results-field-label">Registration opens</span>
          <input
            id="create-event-registration-opens"
            aria-label="Registration opens"
            type="datetime-local"
            value={formatDateTimeLocalInput(values.registrationOpensAt)}
            onChange={(event) =>
              onChange({
                ...values,
                registrationOpensAt: parseDateTimeLocalInput(event.target.value),
              })
            }
            className="results-input"
          />
        </label>

        <label className="results-field-group" htmlFor="create-event-registration-deadline">
          <span className="results-field-label">Registration closes</span>
          <input
            id="create-event-registration-deadline"
            aria-label="Registration closes"
            type="datetime-local"
            value={formatDateTimeLocalInput(values.registrationClosesAt)}
            onChange={(event) =>
              onChange({
                ...values,
                registrationClosesAt: parseDateTimeLocalInput(event.target.value),
              })
            }
            className="results-input"
          />
        </label>
      </div>

      {showCapacity ? (
        <label className="results-field-group" htmlFor="create-event-capacity">
          <span className="results-field-label">Max climbers</span>
          <input
            id="create-event-capacity"
            aria-label="Max climbers"
            type="number"
            min={1}
            value={values.maxClimbers ?? ""}
            onChange={(event) =>
              onChange({
                ...values,
                maxClimbers: Number(event.target.value) || values.maxClimbers,
              })
            }
            className="results-input"
          />
        </label>
      ) : null}

      <label className="results-field-group" htmlFor="create-event-description">
        <span className="results-field-label">Notes</span>
        <textarea
          id="create-event-description"
          aria-label="Event notes"
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          className="results-input min-h-[120px] resize-y"
          placeholder="A short note about the day, the crowd, or anything staff should know."
        />
      </label>

      {showRegistrationStory ? (
        <div className="rounded-[1.4rem] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-950">
          In a real event, athletes register through the public registration page, choose a
          category, and receive private scorecard links. For this guided demo, we simulate
          registrations after creation so the judge screen and leaderboard have realistic data.
        </div>
      ) : null}

      {importedLinksSummary ? (
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {importedLinksSummary}
        </div>
      ) : null}

      {!hideSubmit ? (
        <button
          type="button"
          disabled={formDisabled || !canSubmit}
          onClick={onSubmit}
          className="results-primary-button"
          data-demo-anchor="organizer-create-submit"
        >
          {pending ? submittingLabel : submitLabel}
        </button>
      ) : null}
    </fieldset>
  );
}
