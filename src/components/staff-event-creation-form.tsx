"use client";

import { slugifyCompetitionName, type EventFormat } from "@/lib/scoring";
import type {
  GuidedDemoSetupModel,
  GuidedDemoSetupStepId,
} from "@/lib/guided-demo-setup";

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
  lockFormat?: boolean;
  showCapacity?: boolean;
  showRegistrationStory?: boolean;
  hideSubmit?: boolean;
  activeGuideStepId?: GuidedDemoSetupStepId;
  guidedSetupModel?: GuidedDemoSetupModel;
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

function guidedSectionClass(stepId: GuidedDemoSetupStepId, activeGuideStepId?: GuidedDemoSetupStepId) {
  const isActive = activeGuideStepId === stepId;

  return [
    "rounded-[1.4rem] border p-4 transition",
    isActive
      ? "border-sky-300 bg-sky-50 shadow-[0_18px_40px_-30px_rgba(14,116,215,0.5)]"
      : "border-slate-200 bg-white/70",
  ].join(" ");
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
  lockFormat = false,
  showCapacity = false,
  showRegistrationStory = false,
  hideSubmit = false,
  activeGuideStepId,
  guidedSetupModel,
  onChange,
  onSubmit,
  importedLinksSummary,
}: StaffEventCreationFormProps) {
  const formDisabled = disabled || pending;

  return (
    <fieldset disabled={formDisabled} className={formDisabled ? "mt-4 grid gap-3 opacity-70" : "mt-4 grid gap-3"}>
      {mode === "guided-demo" && lockedPresetLabel ? (
        <div id="guided-act1-preset" className={guidedSectionClass("preset", activeGuideStepId)}>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Required story preset
          </div>
          <div className="mt-2 text-sm leading-6 text-emerald-950">
            <span className="font-semibold">Locked preset:</span> {lockedPresetLabel}. This is the
            same event creation form staff use, with the preset locked because the guided story needs
            qualifier scoring, finalist advancement, finals, and public results.
          </div>
        </div>
      ) : null}

      <div
        id="guided-act1-basics"
        className={mode === "guided-demo" ? `${guidedSectionClass("basics", activeGuideStepId)} grid gap-3` : "grid gap-3"}
      >
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
            disabled={lockFormat || mode === "guided-demo" || formDisabled}
          >
            {formatOptions.map((template) => (
              <option key={template.value} value={template.value}>
                {template.label}
              </option>
            ))}
          </select>
          {mode === "guided-demo" || lockFormat ? (
            <span className="text-xs leading-5 text-slate-500">
              {lockedPresetLabel
                ? `${lockedPresetLabel} is locked for the guided story.`
                : "Qualifier-only formats are disabled in the guided story."}
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
      </div>

      <div
        id="guided-act1-registration"
        className={mode === "guided-demo" ? `${guidedSectionClass("registration", activeGuideStepId)} grid gap-3` : "grid gap-3"}
      >
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
      </div>

      {mode === "guided-demo" && guidedSetupModel ? (
        <>
          <div id="guided-act1-categories" className={guidedSectionClass("categories", activeGuideStepId)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Categories
                </div>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  Athlete registration divisions
                </h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {guidedSetupModel.categories.length} categories
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {guidedSetupModel.categories.map((category) => (
                <span
                  key={category.id}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                >
                  {category.displayName}
                </span>
              ))}
            </div>
          </div>

          <div id="guided-act1-finals" className={guidedSectionClass("finals", activeGuideStepId)}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Finals eligibility
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              Youth B, Youth A, and Junior advance by default
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Youth D and Youth C compete in qualifiers only. The finals-eligible categories are
              selected from the generated categories, not free-floating age-group strings.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {guidedSetupModel.finalsEligibleCategories.map((category) => (
                <span
                  key={category.id}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"
                >
                  {category.displayName}
                </span>
              ))}
            </div>
          </div>

          <div id="guided-act1-rounds" className={guidedSectionClass("rounds", activeGuideStepId)}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Rounds and scoring
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {guidedSetupModel.rounds.map((round) => (
                <div key={round.title} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-950">{round.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{round.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div id="guided-act1-schedule" className={guidedSectionClass("schedule", activeGuideStepId)}>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Schedule
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              Event-day structure
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {guidedSetupModel.scheduleBlocks.map((block) => (
                <div key={`${block.label}-${block.phaseType}`} className="rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-sm font-semibold text-slate-950">{block.label}</div>
                  <div className="text-xs text-slate-500">{block.audienceLabel}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {importedLinksSummary ? (
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {importedLinksSummary}
        </div>
      ) : null}

      {!hideSubmit ? (
        <div
          id="guided-act1-create"
          className={mode === "guided-demo" ? guidedSectionClass("create", activeGuideStepId) : undefined}
        >
          {mode === "guided-demo" ? (
            <div className="mb-3 text-sm leading-6 text-slate-600">
              {activeGuideStepId === "create"
                ? "Now create the event. After this, the demo will populate realistic climbers and scores so you can continue to the judge screen."
                : "Review the guided setup steps first. The create action unlocks on the final Create Demo Event step."}
            </div>
          ) : null}
          <button
            type="button"
            disabled={formDisabled || !canSubmit}
            onClick={onSubmit}
            className="results-primary-button"
            data-demo-anchor="organizer-create-submit"
          >
            {pending ? submittingLabel : submitLabel}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
