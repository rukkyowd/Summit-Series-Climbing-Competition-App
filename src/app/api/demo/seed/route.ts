import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/server-supabase";
import { buildDisplayCategory, createCategoryKey } from "@/lib/scoring";

type DemoSeedRequest = {
  competitionId?: string;
};

type CompetitionRow = {
  id: string;
  slug: string;
  is_demo: boolean;
};

type CategoryRow = {
  id: string;
  competition_id: string;
  gender_division: string;
  age_group: string;
  display_name: string;
};

type RoundRow = {
  id: string;
  round_type: string | null;
  scoring_bucket: string | null;
};

type ScheduleBlockRow = {
  id: string;
  round_id: string | null;
  phase_type: string;
  eligible_category_ids: unknown;
  capacity: number | null;
  sort_order: number | null;
};

const SAMPLE_CLIMBERS = [
  { name: "Leo Grant", number: "101", province: "NS" },
  { name: "Noah Patel", number: "102", province: "NB" },
  { name: "Milo Fraser", number: "103", province: "PE" },
  { name: "Maya Chen", number: "104", province: "NS", target: true },
  { name: "Declan White", number: "105", province: "NL" },
  { name: "Isaac Green", number: "106", province: "QC" },
] as const;

function createId() {
  return crypto.randomUUID();
}

function sampleToken(competitionId: string, number: string) {
  return `scorecard-demo-seed-${competitionId}-${number}`;
}

function scoreFor(climberNumber: string, climbNumber: number) {
  if (climberNumber === "104" && climbNumber === 3) {
    return {
      attempt_count: 3,
      zone: true,
      topped: true,
      attempts_to_top: 3,
      attempts_to_zone: 1,
    };
  }

  const numeric = Number(climberNumber);
  const topped = (numeric + climbNumber) % 3 !== 0;
  const zone = true;
  const attemptCount = 1 + ((numeric + climbNumber) % 3);

  return {
    attempt_count: attemptCount,
    zone,
    topped,
    attempts_to_top: topped ? attemptCount : null,
    attempts_to_zone: zone ? Math.max(1, Math.min(attemptCount, 2)) : null,
  };
}

async function ensureCategory(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const categoryId = createCategoryKey("Men", "Youth B");
  const { data: existing, error: loadError } = await supabase
    .from("competition_categories")
    .select("id, competition_id, gender_division, age_group, display_name")
    .eq("competition_id", competitionId)
    .eq("id", categoryId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (existing) {
    return existing as CategoryRow;
  }

  const row = {
    id: categoryId,
    competition_id: competitionId,
    gender_division: "Men",
    age_group: "Youth B",
    display_name: buildDisplayCategory("Men", "Youth B"),
    sort_order: 0,
  };
  const { error } = await supabase.from("competition_categories").upsert(row, {
    onConflict: "competition_id,id",
  });

  if (error) {
    throw new Error(error.message);
  }

  return row;
}

async function getQualifierRoundId(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const { data, error } = await supabase
    .from("competition_rounds")
    .select("id, round_type, scoring_bucket")
    .eq("competition_id", competitionId)
    .or("round_type.eq.qualifier,scoring_bucket.eq.qualifier")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RoundRow | null)?.id ?? null;
}

function getEligibleCategoryIds(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function blockAllowsCategory(block: ScheduleBlockRow, categoryId: string) {
  const eligibleCategoryIds = getEligibleCategoryIds(block.eligible_category_ids);
  return eligibleCategoryIds.length === 0 || eligibleCategoryIds.includes(categoryId);
}

async function ensureQualifierSession(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string,
  qualifierRoundId: string | null,
  categoryId: string
) {
  if (!qualifierRoundId) {
    throw new Error("Demo seeding requires a qualifier round before climbers can be assigned to a session.");
  }

  const { data, error } = await supabase
    .from("competition_schedule_blocks")
    .select("id, round_id, phase_type, eligible_category_ids, capacity, sort_order")
    .eq("competition_id", competitionId)
    .eq("phase_type", "qualifier_round")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const blocks = (data ?? []) as ScheduleBlockRow[];
  const linkedBlock = blocks.find((block) => block.round_id === qualifierRoundId && blockAllowsCategory(block, categoryId));
  if (linkedBlock) {
    return linkedBlock.id;
  }

  const unlinkedBlock = blocks.find((block) => !block.round_id && blockAllowsCategory(block, categoryId));
  if (unlinkedBlock) {
    const update = await supabase
      .from("competition_schedule_blocks")
      .update({
        round_id: qualifierRoundId,
        capacity: Math.max(unlinkedBlock.capacity ?? 0, SAMPLE_CLIMBERS.length),
      })
      .eq("id", unlinkedBlock.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return unlinkedBlock.id;
  }

  const nextSortOrder = blocks.reduce((max, block) => Math.max(max, block.sort_order ?? 0), 0) + 1;
  const { data: inserted, error: insertError } = await supabase
    .from("competition_schedule_blocks")
    .insert({
      competition_id: competitionId,
      round_id: qualifierRoundId,
      sort_order: nextSortOrder,
      label: "Demo qualifier session",
      phase_type: "qualifier_round",
      audience_label: "Demo climbers",
      is_active: false,
      start_time: "10:00 AM",
      end_time: "12:00 PM",
      capacity: Math.max(SAMPLE_CLIMBERS.length, 20),
      eligible_category_ids: [categoryId],
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted.id as string;
}

async function clearPreviousSeed(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  competitionId: string
) {
  const sampleNumbers = SAMPLE_CLIMBERS.map((climber) => climber.number);
  const { data: existingClimbers, error } = await supabase
    .from("climbers")
    .select("id")
    .eq("competition_id", competitionId)
    .in("climber_number", sampleNumbers);

  if (error) {
    throw new Error(error.message);
  }

  const climberIds = (existingClimbers ?? []).map((climber) => climber.id as string);
  if (climberIds.length) {
    const attemptDelete = await supabase.from("qualifier_attempts").delete().in("climber_id", climberIds);
    if (attemptDelete.error) {
      throw new Error(attemptDelete.error.message);
    }

    const finalDelete = await supabase.from("final_attempts").delete().in("climber_id", climberIds);
    if (finalDelete.error) {
      throw new Error(finalDelete.error.message);
    }

    const climberDelete = await supabase.from("climbers").delete().in("id", climberIds);
    if (climberDelete.error) {
      throw new Error(climberDelete.error.message);
    }
  }
}

export async function POST(request: NextRequest) {
  let body: DemoSeedRequest;

  try {
    body = (await request.json()) as DemoSeedRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!body.competitionId) {
    return NextResponse.json({ ok: false, error: "competitionId is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, slug, is_demo")
      .eq("id", body.competitionId)
      .maybeSingle();

    if (competitionError) {
      throw new Error(competitionError.message);
    }

    const competitionRow = competition as CompetitionRow | null;
    if (!competitionRow) {
      return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
    }

    if (competitionRow.is_demo !== true) {
      return NextResponse.json(
        { ok: false, error: "Refusing to seed sample data into a non-demo competition." },
        { status: 403 }
      );
    }

    const category = await ensureCategory(supabase, competitionRow.id);
    const qualifierRoundId = await getQualifierRoundId(supabase, competitionRow.id);
    const qualifierSessionId = await ensureQualifierSession(
      supabase,
      competitionRow.id,
      qualifierRoundId,
      category.id
    );
    await clearPreviousSeed(supabase, competitionRow.id);

    const climberRows = SAMPLE_CLIMBERS.map((climber) => ({
      id: createId(),
      competition_id: competitionRow.id,
      name: climber.name,
      climber_number: climber.number,
      province: climber.province,
      category_id: category.id,
      gender_division: category.gender_division,
      age_group: category.age_group,
      display_category: category.display_name,
      time_slot_id: qualifierSessionId,
      access_token: sampleToken(competitionRow.id, climber.number),
    }));

    const { data: insertedClimbers, error: climberError } = await supabase
      .from("climbers")
      .insert(climberRows)
      .select("id, climber_number");

    if (climberError) {
      throw new Error(climberError.message);
    }

    const attempts = (insertedClimbers ?? []).flatMap((climber) =>
      [1, 2, 3, 4].map((climbNumber) => {
        const score = scoreFor(climber.climber_number as string, climbNumber);
        return {
          competition_id: competitionRow.id,
          round_id: qualifierRoundId,
          climber_id: climber.id,
          climb_number: climbNumber,
          entered_by: "staff",
          ...score,
        };
      })
    );

    const { error: attemptError } = await supabase.from("qualifier_attempts").insert(attempts);
    if (attemptError) {
      throw new Error(attemptError.message);
    }

    const target = (insertedClimbers ?? []).find((climber) => climber.climber_number === "104");

    return NextResponse.json({
      ok: true,
      competitionId: competitionRow.id,
      slug: competitionRow.slug,
      judgeUrl: `/staff/c/${competitionRow.slug}/judge`,
      publicUrl: `/c/${competitionRow.slug}`,
      leaderboardUrl: `/c/${competitionRow.slug}/leaderboard`,
      target: {
        climberId: target?.id ?? null,
        climberNumber: "104",
        name: "Maya Chen",
        climbNumber: 3,
        before: "Top in 3 attempts",
        after: "Top in 1 attempt",
      },
      inserted: {
        climbers: insertedClimbers?.length ?? 0,
        attempts: attempts.length,
      },
    });
  } catch (error) {
    console.error("DEMO SEED ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to seed demo data." },
      { status: 500 }
    );
  }
}
