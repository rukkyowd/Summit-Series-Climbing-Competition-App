"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { getCompetitionSnapshot, registerClimber, type CompetitionSnapshot } from "@/lib/db";
import { saveScorecardAccessToken } from "@/lib/scorecard-access";
import {
  canRegisterDuringCompetition,
  formatSchedulePhaseLabel,
  formatTimeRange,
  getActiveScheduleBlock,
  getEventWorkflowGuide,
} from "@/lib/scoring";

export default function CompetitionRegisterPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successLink, setSuccessLink] = useState("");
  const [name, setName] = useState("");
  const [climberNumber, setClimberNumber] = useState("");
  const [province, setProvince] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [timeSlotId, setTimeSlotId] = useState("");

  useEffect(() => {
    getCompetitionSnapshot(slug)
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setCategoryId(nextSnapshot.registrationChoices[0]?.category.id ?? "");
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load registration options.");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const selectedChoice = useMemo(
    () => snapshot?.registrationChoices.find((choice) => choice.category.id === categoryId) ?? null,
    [categoryId, snapshot]
  );
  const availableSlots = useMemo(() => selectedChoice?.slots ?? [], [selectedChoice]);
  const workflowGuide = useMemo(
    () => (snapshot ? getEventWorkflowGuide(snapshot.competition) : null),
    [snapshot]
  );
  const activeScheduleBlock = useMemo(
    () => (snapshot ? getActiveScheduleBlock(snapshot.competition) : null),
    [snapshot]
  );
  const registrationOpen = snapshot ? canRegisterDuringCompetition(snapshot.competition) : false;

  useEffect(() => {
    if (!availableSlots.length) {
      setTimeSlotId("");
      return;
    }

    if (!availableSlots.some((slot) => slot.id === timeSlotId && slot.remaining_capacity > 0)) {
      const nextSlot = availableSlots.find((slot) => slot.remaining_capacity > 0);
      setTimeSlotId(nextSlot?.id ?? "");
    }
  }, [availableSlots, timeSlotId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccessLink("");

    if (!snapshot) {
      return;
    }

    if (!name.trim() || !climberNumber.trim() || !province.trim() || !categoryId) {
      setError("Name, climber number, province, and category are required.");
      return;
    }

    setLoading(true);
    try {
      const climber = await registerClimber({
        competitionId: snapshot.competition.id,
        name,
        climberNumber,
        province,
        categoryId,
        timeSlotId: timeSlotId || null,
      });
      const link = climber.scorecard_path;
      saveScorecardAccessToken(climber.access_token, snapshot.competition.slug);
      setSuccessLink(link);
      setName("");
      setClimberNumber("");
      setProvince("");
      setTimeSlotId("");
      window.setTimeout(() => {
        router.push(link);
      }, 900);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="results-page">
      <div className="content-frame space-y-6">
        <SiteHeader light competitionSlug={slug} />

        <section className="results-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="results-kicker">Registration</div>
              <h1 className="mt-2 text-4xl font-semibold text-slate-950">
                {snapshot?.competition.stage_mode === "finals" ? "Registration closed" : "Register for competition"}
              </h1>
            </div>
            <div className="results-chip">
              {registrationOpen ? "Registration open" : "Registration paused"}
            </div>
          </div>

          {workflowGuide ? (
            <div className="results-meta-card mt-6">
              <div className="results-kicker">How this page works</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{workflowGuide.headline}</div>
              <p className="mt-3 text-slate-600">{workflowGuide.summary}</p>
            </div>
          ) : null}

          {activeScheduleBlock ? (
            <div className="results-meta-card mt-4">
              <div className="results-kicker">Live schedule block</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{activeScheduleBlock.label}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="results-chip">{formatSchedulePhaseLabel(activeScheduleBlock.phase_type)}</span>
                {activeScheduleBlock.audience_label ? <span className="results-chip">{activeScheduleBlock.audience_label}</span> : null}
              </div>
              <div className="mt-3 text-slate-600">{formatTimeRange(activeScheduleBlock.start_time, activeScheduleBlock.end_time)}</div>
            </div>
          ) : null}

          {error ? <div className="results-alert results-alert-error mt-4">{error}</div> : null}
          {successLink ? <div className="results-alert results-alert-success mt-4">Registration complete. Opening your private scorecard...</div> : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input value={name} onChange={(event) => setName(event.target.value)} className="results-input" placeholder="Climber name" disabled={!registrationOpen || snapshot?.competition.stage_mode === "finals"} />
              <input value={climberNumber} onChange={(event) => setClimberNumber(event.target.value)} className="results-input" placeholder="Climber number" disabled={!registrationOpen || snapshot?.competition.stage_mode === "finals"} />
            </div>
            <input value={province} onChange={(event) => setProvince(event.target.value)} className="results-input" placeholder="Province" disabled={!registrationOpen || snapshot?.competition.stage_mode === "finals"} />
            <div className="grid gap-4 md:grid-cols-2">
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="results-input" disabled={!registrationOpen || snapshot?.competition.stage_mode === "finals"}>
                <option value="">Select category</option>
                {snapshot?.registrationChoices.map((choice) => (
                  <option key={choice.category.id} value={choice.category.id}>
                    {choice.category.display_name}
                  </option>
                ))}
              </select>
              <select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)} className="results-input" disabled={!registrationOpen || snapshot?.competition.stage_mode === "finals" || !availableSlots.length}>
                <option value="">{availableSlots.length ? "Select schedule block" : "No block required"}</option>
                {availableSlots.map((slot) => (
                  <option key={slot.id} value={slot.id} disabled={slot.remaining_capacity <= 0}>
                    {slot.label} ({slot.remaining_capacity} left)
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={loading || !registrationOpen || snapshot?.competition.stage_mode === "finals"} className="results-primary-button">
              {loading ? "Working..." : "Register and open scorecard"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
