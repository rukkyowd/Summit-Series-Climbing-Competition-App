"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StaffEventCreationForm,
  type StaffEventCreationFormValues,
} from "@/components/staff-event-creation-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  FORMAT_TEMPLATES,
  type EventFormat,
} from "@/lib/scoring";
import {
  GUIDED_DEMO_PRESET_ID,
  getGuidedDemoPreset,
} from "@/lib/competition-presets";
import {
  buildDefaultGuidedDemoEventSetup,
  buildGuidedDemoSetupModel,
  normalizeGuidedDemoEventSetup,
  type GuidedDemoEventSetupDraft,
  type GuidedDemoSetupStepId,
} from "@/lib/guided-demo-setup";
import type { DemoStoryProgress, DemoStoryState } from "@/lib/demo-story";

const BUILD_STEPS = [
  "Saving event setup",
  "Creating categories, rounds, and schedule",
  "Simulating registrations and climbers",
  "Seeding qualifier scores and cut-line drama",
  "Opening the live judge panel",
] as const;

type DemoCreateResponse = {
  ok?: boolean;
  competitionId?: string;
  slug?: string;
  isDemo?: boolean;
  judgeUrl?: string;
  publicUrl?: string;
  leaderboardUrl?: string;
  progress?: DemoStoryProgress;
  state?: DemoStoryState;
  error?: string;
};

const GUIDE_COPY: Record<GuidedDemoSetupStepId, { title: string; body: string; why: string }> = {
  basics: {
    title: "Event basics",
    body: "Start by naming the competition and setting where it takes place.",
    why: "This is the identity organizers, judges, athletes, and spectators see throughout the event.",
  },
  preset: {
    title: "Preset",
    body: "Youth Championship with Finals is locked for this story.",
    why: "Act 3 teaches finalist advancement and finals, so the guided story must start from a finals-capable preset.",
  },
  registration: {
    title: "Registration",
    body: "Configure registration timing, capacity, and the athlete-facing setup.",
    why: "After creation, the demo simulates registrations so the judge screen and leaderboard have realistic data.",
  },
  categories: {
    title: "Categories",
    body: "Review the generated youth divisions.",
    why: "Categories drive registration, standings, finals eligibility, and public leaderboard filters.",
  },
  finals: {
    title: "Finals eligibility",
    body: "Youth B, Youth A, and Junior advance to finals by default.",
    why: "Youth D and Youth C still compete in qualifiers, but they are not finals-eligible in the story preset.",
  },
  rounds: {
    title: "Rounds/scoring",
    body: "Confirm qualifier scoring and the finals round structure.",
    why: "The judge and organizer screens use this structure to decide what can be scored or advanced.",
  },
  schedule: {
    title: "Schedule",
    body: "Review the event-day flow from check-in through awards.",
    why: "Schedule blocks connect the public page, active phases, and organizer controls.",
  },
  create: {
    title: "Create Demo Event",
    body: "Submit the real setup form and create the canonical demo event.",
    why: "Only this step creates the event and starts server-side demo data population.",
  },
};

function clearDemoRuntimeState() {
  if (typeof window === "undefined") {
    return;
  }

  [
    "summit_demo_story_progress_v1",
    "demo_sales_session_v1",
    "scorecard_demo_tour_step",
    "scorecard_demo_tour_dismissed",
    "organizer_demo_tour_state_v2",
    "organizer_demo_tour_state_v3",
  ].forEach((key) => window.localStorage.removeItem(key));
}

export function GuidedDemoEventBuilder() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const setupModel = useMemo(() => buildGuidedDemoSetupModel(), []);
  const preset = useMemo(() => getGuidedDemoPreset(), []);
  const defaults = useMemo(() => buildDefaultGuidedDemoEventSetup(), []);
  const [activeStepId, setActiveStepId] = useState<GuidedDemoSetupStepId>("basics");
  const [setupDraft, setSetupDraft] = useState<GuidedDemoEventSetupDraft>(defaults);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Start with organizer setup. No climbers or scores are generated until you create the event.");
  const [buildActive, setBuildActive] = useState(false);
  const [buildStepIndex, setBuildStepIndex] = useState(0);
  const activeStepIndex = setupModel.steps.findIndex((step) => step.id === activeStepId);
  const activeGuide = GUIDE_COPY[activeStepId];
  const normalizedSetup = normalizeGuidedDemoEventSetup(setupDraft);
  const canSubmit =
    activeStepId === "create" &&
    Boolean(normalizedSetup.name.trim()) &&
    Boolean(normalizedSetup.locationName.trim()) &&
    Boolean(normalizedSetup.startDate.trim()) &&
    !buildActive;
  const formValues: StaffEventCreationFormValues = {
    name: setupDraft.name,
    format: preset.format as EventFormat,
    location: setupDraft.locationName,
    startDate: setupDraft.startDate,
    endDate: setupDraft.endDate,
    registrationOpensAt: setupDraft.registrationOpensAt,
    registrationClosesAt: setupDraft.registrationClosesAt,
    description: setupDraft.description,
    maxClimbers: setupDraft.maxClimbers,
  };

  function moveGuide(delta: number) {
    const nextStep = setupModel.steps[Math.min(setupModel.steps.length - 1, Math.max(0, activeStepIndex + delta))];
    if (nextStep) {
      setActiveStepId(nextStep.id);
      document.getElementById(`guided-act1-${nextStep.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }

  async function createDemoEvent() {
    if (!canSubmit) {
      setMessage("Review the setup steps first. Create Demo Event unlocks on the final step.");
      return;
    }

    setError("");
    setMessage("");
    setBuildActive(true);
    setBuildStepIndex(0);

    try {
      const createPromise = fetch("/api/demo/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ setup: normalizedSetup }),
      }).then(async (response) => {
        const payload = (await response.json().catch(() => null)) as DemoCreateResponse | null;
        if (!response.ok || !payload?.ok || !payload.judgeUrl || !payload.slug) {
          throw new Error(payload?.error ?? "Demo event creation failed.");
        }
        return payload;
      });

      for (let index = 0; index < BUILD_STEPS.length; index += 1) {
        setBuildStepIndex(index);
        await new Promise((resolve) => setTimeout(resolve, index === 0 ? 280 : 520));
      }

      const payload = await createPromise;
      clearDemoRuntimeState();
      setMessage("Demo event created. Opening Act 2 on the real judge route.");
      startTransition(() => {
        router.push(payload.judgeUrl!);
      });
    } catch (nextError) {
      setBuildActive(false);
      setBuildStepIndex(0);
      setError(nextError instanceof Error ? nextError.message : "Demo event creation failed.");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#f8fafc,#eef6ff_46%,#fff7ed)] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-sky-200 bg-sky-50/90 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">Demo Mode</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                Act 1 uses the real staff event creation form. The demo guide only explains and highlights.
              </p>
            </div>
            <a href="/demo" className={buttonStyles({ variant: "secondary", size: "compact" })}>
              Back to Demo Home
            </a>
          </div>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert>{message}</Alert> : null}

        {buildActive ? (
          <Surface variant="card" className="border-sky-200 bg-sky-50/80">
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="results-kicker text-sky-700">Creating the live demo event</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  The organizer setup is becoming a live comp.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  The demo is creating the event first, then simulating registrations, seeded scores,
                  and target metadata before opening the judge route.
                </p>
              </div>
              <div className="space-y-3 rounded-[2rem] border border-sky-200/80 bg-white/90 p-5">
                {BUILD_STEPS.map((step, index) => {
                  const active = index === buildStepIndex;
                  const done = index < buildStepIndex;
                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 ${
                        active
                          ? "border-sky-300 bg-sky-100 text-sky-950"
                          : done
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black">
                        {done ? "OK" : index + 1}
                      </span>
                      <span className="text-sm font-bold">{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Surface>
        ) : null}

        <Surface variant="card" className="border-emerald-200 bg-emerald-50/80">
          <Badge>Act 1 - Organizer: Build Event</Badge>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">
            Create the demo event through the real organizer workflow.
          </h1>
          <p className="mt-3 max-w-4xl text-base leading-7 text-slate-700">
            You are acting as the organizer. Configure the event basics, registration, preset,
            categories, finals eligibility, rounds, and schedule. Only the final Create Demo Event
            action creates the canonical demo and populates scores.
          </p>
        </Surface>

        <section className="grid gap-6 xl:grid-cols-[minmax(17rem,0.36fr)_minmax(0,1fr)] xl:items-start">
          <Surface variant="meta" density="organizer" className="space-y-5 xl:sticky xl:top-6">
            <div>
              <div className="results-kicker text-sky-700">Guided organizer walkthrough</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {activeGuide.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{activeGuide.body}</p>
              <p className="mt-3 rounded-[1.2rem] border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                <span className="font-bold text-slate-950">Why this matters:</span> {activeGuide.why}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {setupModel.steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                    step.id === activeStepId
                      ? "border-sky-300 bg-sky-100 text-sky-950"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {index + 1}. {step.title}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" size="compact" onClick={() => moveGuide(-1)} disabled={activeStepIndex <= 0 || buildActive}>
                Back
              </Button>
              <Button type="button" variant="primary" size="compact" onClick={() => moveGuide(1)} disabled={activeStepIndex >= setupModel.steps.length - 1 || buildActive}>
                Next guide step
              </Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Guide navigation never saves, writes scores, or creates data. Only the real Create Demo
              Event button submits the form.
            </p>
          </Surface>

          <Surface variant="card" className="border-slate-200 bg-white/95">
            <StaffEventCreationForm
              values={formValues}
              formatOptions={FORMAT_TEMPLATES.filter((template) => template.value === preset.format)}
              disabled={buildActive || isPending}
              pending={buildActive || isPending}
              submitLabel="Create Demo Event"
              submittingLabel="Creating demo event..."
              canSubmit={canSubmit}
              mode="guided-demo"
              lockedPresetLabel={preset.name}
              showCapacity
              showRegistrationStory
              activeGuideStepId={activeStepId}
              guidedSetupModel={setupModel}
              onChange={(values) =>
                setSetupDraft({
                  ...setupDraft,
                  name: values.name,
                  locationName: values.location,
                  startDate: values.startDate,
                  endDate: values.endDate,
                  description: values.description,
                  registrationOpensAt: values.registrationOpensAt,
                  registrationClosesAt: values.registrationClosesAt,
                  maxClimbers: values.maxClimbers ?? setupDraft.maxClimbers,
                  presetId: GUIDED_DEMO_PRESET_ID,
                })
              }
              onSubmit={createDemoEvent}
            />
          </Surface>
        </section>
      </div>
    </main>
  );
}
