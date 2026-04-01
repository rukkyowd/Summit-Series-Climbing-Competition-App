"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import CompetitionSubnav from "@/components/competition-subnav";
import { getCompetitionSnapshot, registerClimber, type CompetitionSnapshot } from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import {
  canRegisterDuringCompetition,
  CLIMBER_NUMBER_PATTERN,
  formatCompetitionPhaseLabel,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
  getRegistrationAssignmentHelpText,
  getRegistrationAssignmentLabel,
  isValidClimberNumber,
  normalizeClimberNumberInput,
} from "@/lib/scoring";

export default function CompetitionRegisterPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [successLink, setSuccessLink] = useState("");
  const [name, setName] = useState("");
  const [climberNumber, setClimberNumber] = useState("");
  const [province, setProvince] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [timeSlotId, setTimeSlotId] = useState("");
  const [step, setStep] = useState(0);

  const loadSnapshot = useCallback(async () => {
    const nextSnapshot = await getCompetitionSnapshot(slug);
    setSnapshot(nextSnapshot);
    setCategoryId((current) => current || nextSnapshot.registrationChoices[0]?.category.id || "");
    return nextSnapshot;
  }, [slug]);

  useEffect(() => {
    void loadSnapshot()
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load registration options.");
      })
      .finally(() => setLoading(false));
  }, [loadSnapshot]);

  useEffect(() => {
    if (error || fieldError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error, fieldError]);

  const selectedChoice = useMemo(
    () => snapshot?.registrationChoices.find((choice) => choice.category.id === categoryId) ?? null,
    [categoryId, snapshot]
  );
  const availableSlots = useMemo(() => selectedChoice?.slots ?? [], [selectedChoice]);
  const workflowGuide = useMemo(() => (snapshot ? getEventWorkflowGuide(snapshot.competition) : null), [snapshot]);
  const activeScheduleBlock = useMemo(() => (snapshot ? getActiveScheduleBlock(snapshot.competition) : null), [snapshot]);
  const registrationOpen = snapshot ? canRegisterDuringCompetition(snapshot.competition) : false;
  const assignmentLabel = snapshot ? getRegistrationAssignmentLabel(snapshot.competition) : "Assignment";
  const assignmentHelp = snapshot ? getRegistrationAssignmentHelpText(snapshot.competition) : "";
  const steps = useMemo(() => ["Details", "Category", assignmentLabel, "Confirm"] as const, [assignmentLabel]);

  useEffect(() => {
    if (!availableSlots.length) {
      setTimeSlotId("");
      return;
    }
    if (!availableSlots.some((slot) => slot.id === timeSlotId && slot.remaining_capacity > 0)) {
      setTimeSlotId(availableSlots.find((slot) => slot.remaining_capacity > 0)?.id ?? "");
    }
  }, [availableSlots, timeSlotId]);

  const validateCurrentStep = () => {
    setFieldError(null);
    if (step === 0) {
      if (!name.trim()) {
        setFieldError({ field: "name", message: "Enter the climber name." });
        return false;
      }
      if (!climberNumber.trim()) {
        setFieldError({ field: "climberNumber", message: "Enter the climber number." });
        return false;
      }
      if (!isValidClimberNumber(climberNumber)) {
        setFieldError({ field: "climberNumber", message: "Climber numbers must be 1 to 4 digits." });
        return false;
      }
      if (!province.trim()) {
        setFieldError({ field: "province", message: "Enter the province." });
        return false;
      }
    }
    if (step === 1 && !categoryId) {
      setFieldError({ field: "category", message: "Choose a category to continue." });
      return false;
    }
    if (step === 2 && availableSlots.length && !timeSlotId) {
      setFieldError({ field: "timeSlot", message: "Choose a time slot to continue." });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessLink("");
    setFieldError(null);

    if (!snapshot) {
      return;
    }

    setSubmitting(true);
    try {
      const refreshedSnapshot = await loadSnapshot();
      const climber = await registerClimber({
        competitionId: refreshedSnapshot.competition.id,
        name,
        climberNumber,
        province,
        categoryId,
        timeSlotId: timeSlotId || null,
      });
      const link = climber.scorecard_path;
      saveScorecardAccessToken(climber.access_token, refreshedSnapshot.competition.slug);
      setSuccessLink(link);
      setTimeout(() => router.push(link), 900);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />
        <CompetitionSubnav competitionSlug={slug} />

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Registration</div>
              <h1 className="mt-2 text-4xl font-semibold text-slate-950">
                {snapshot ? `Register for ${snapshot.competition.name}` : "Register for competition"}
              </h1>
            </div>
            <div className="results-chip">
              {snapshot ? formatCompetitionPhaseLabel(snapshot.competition.current_phase) : "Loading"}
            </div>
          </div>

            <div className="mt-5 flex flex-wrap gap-2">
            {steps.map((label, index) => (
              <div key={label} className={index === step ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                {index + 1}. {label}
              </div>
            ))}
          </div>

          {workflowGuide ? (
            <div className="results-meta-card mt-6">
              <div className="results-kicker">How this round works</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{workflowGuide.headline}</div>
              <p className="mt-3 text-slate-600">{workflowGuide.summary}</p>
            </div>
          ) : null}

          {activeScheduleBlock ? (
            <div className="results-meta-card mt-4">
              <div className="results-kicker">Live schedule context</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{activeScheduleBlock.label}</div>
            </div>
          ) : null}

          {!registrationOpen && snapshot ? (
            <div className="results-alert results-alert-error mt-4">
              Registration is currently closed during the {formatCompetitionPhaseLabel(snapshot.competition.current_phase).toLowerCase()} phase.
            </div>
          ) : null}

          {(error || fieldError || successLink) ? (
            <div ref={errorRef} aria-live="polite" className="mt-4 space-y-3">
              {error ? <div className="results-alert results-alert-error">{error}</div> : null}
              {fieldError ? <div className="results-alert results-alert-error">{fieldError.message}</div> : null}
              {successLink ? <div className="results-alert results-alert-success">Registration complete. Opening your private scorecard...</div> : null}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="skeleton-block h-28 w-full" />
              <div className="skeleton-block h-28 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {step === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Climber name</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} className="results-input" placeholder="Jordan Chen" disabled={!registrationOpen || submitting} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Climber number</span>
                    <input
                      value={climberNumber}
                      onChange={(event) => setClimberNumber(normalizeClimberNumberInput(event.target.value))}
                      className="results-input"
                      placeholder="047"
                      inputMode="numeric"
                      pattern={CLIMBER_NUMBER_PATTERN.source}
                      maxLength={4}
                      disabled={!registrationOpen || submitting}
                    />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Province</span>
                    <input value={province} onChange={(event) => setProvince(event.target.value)} className="results-input" placeholder="Nova Scotia" disabled={!registrationOpen || submitting} />
                  </label>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {snapshot?.registrationChoices.map((choice) => (
                    <button
                      key={choice.category.id}
                      type="button"
                      onClick={() => setCategoryId(choice.category.id)}
                      className={`results-admin-list-item ${categoryId === choice.category.id ? "results-admin-list-item-active" : ""}`}
                      disabled={!registrationOpen || submitting}
                    >
                      <div>
                        <div className="text-lg font-semibold text-slate-950">{choice.category.display_name}</div>
                        <div className="mt-1 text-sm text-slate-600">{choice.slots.length ? `${choice.slots.length} available slots` : "No time slot required"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === 2 ? (
                availableSlots.length ? (
                  <div className="grid gap-3">
                    <div className="results-meta-card text-slate-600">{assignmentHelp}</div>
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setTimeSlotId(slot.id)}
                        disabled={!registrationOpen || submitting || slot.remaining_capacity <= 0}
                        className={`results-admin-list-item ${timeSlotId === slot.id ? "results-admin-list-item-active" : ""}`}
                      >
                        <div>
                          <div className="text-lg font-semibold text-slate-950">{slot.label}</div>
                          <div className="mt-1 text-sm text-slate-600">{slot.remaining_capacity} spots left</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="results-meta-card text-slate-600">
                    {snapshot?.competition.format === "scramble"
                      ? "This competition does not require a time-slot selection."
                      : "Staff can assign the official start group separately. No start-group selection is required here."}
                  </div>
                )
              ) : null}

              {step === 3 ? (
                <div className="results-meta-card space-y-3">
                  <div><span className="font-semibold text-slate-950">Name:</span> {name || "Not entered"}</div>
                  <div><span className="font-semibold text-slate-950">Number:</span> {climberNumber || "Not entered"}</div>
                  <div><span className="font-semibold text-slate-950">Province:</span> {province || "Not entered"}</div>
                  <div><span className="font-semibold text-slate-950">Category:</span> {selectedChoice?.category.display_name || "Not selected"}</div>
                  <div><span className="font-semibold text-slate-950">{assignmentLabel}:</span> {availableSlots.find((slot) => slot.id === timeSlotId)?.label || (availableSlots.length ? "Not selected" : "No assignment required")}</div>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-between gap-3">
                <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || submitting} className="results-secondary-button">
                  Back
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" onClick={() => validateCurrentStep() && setStep((current) => Math.min(steps.length - 1, current + 1))} disabled={!registrationOpen || submitting} className="results-primary-button">
                    Continue
                  </button>
                ) : (
                  <button type="submit" disabled={!registrationOpen || submitting} className="results-primary-button">
                    {submitting ? "Working..." : "Register and open scorecard"}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
