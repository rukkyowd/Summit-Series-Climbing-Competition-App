"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import FinalsResultsTable from "@/components/finals-results-table";
import { getCompetitionSnapshot, type CompetitionSnapshot } from "@/lib/db";

export default function CompetitionDisplayPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedFinalsCategory, setSelectedFinalsCategory] = useState("");

  useEffect(() => {
    const load = () => void getCompetitionSnapshot(slug).then((nextSnapshot) => setSnapshot(nextSnapshot));
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [slug]);

  const qualifierCategories = useMemo(() => snapshot?.competition.categories ?? [], [snapshot]);
  const qualifierRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.qualifierLeaderboard.filter((entry) => selectedCategory === "all" || entry.category_id === selectedCategory);
  }, [selectedCategory, snapshot]);

  const finalsGroups = useMemo(() => {
    const groups = new Map<string, CompetitionSnapshot["finalsLeaderboard"]>();
    snapshot?.finalsLeaderboard.forEach((entry) => {
      const next = groups.get(entry.display_category) ?? [];
      next.push(entry);
      groups.set(entry.display_category, next);
    });
    return groups;
  }, [snapshot]);

  const finalsCategories = useMemo(() => Array.from(finalsGroups.keys()).sort(), [finalsGroups]);

  useEffect(() => {
    if (!selectedFinalsCategory && finalsCategories.length) {
      setSelectedFinalsCategory(finalsCategories[0]);
    }
  }, [finalsCategories, selectedFinalsCategory]);

  return (
    <main className="results-page min-h-screen">
      <div className="content-frame space-y-6">
        <section className="results-card">
          <div className="results-kicker">Live display</div>
          <h1 className="mt-2 text-5xl font-semibold text-slate-950">{snapshot?.competition.name ?? "Loading competition..."}</h1>
          <p className="mt-3 text-lg text-slate-600">Projector view for public rankings and finals results.</p>
        </section>

        {snapshot?.competition.current_phase === "finals_open" || snapshot?.competition.current_phase === "finals_closed" || snapshot?.competition.current_phase === "results" ? (
          <>
            <section className="results-card">
              <div className="finals-category-picker">
                {finalsCategories.map((category) => (
                  <button key={category} type="button" onClick={() => setSelectedFinalsCategory(category)} className={category === selectedFinalsCategory ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                    {category}
                  </button>
                ))}
              </div>
            </section>
            <FinalsResultsTable title={selectedFinalsCategory} rows={finalsGroups.get(selectedFinalsCategory) ?? []} />
          </>
        ) : (
          <section className="results-card">
            <div className="finals-category-picker">
              <button type="button" onClick={() => setSelectedCategory("all")} className={selectedCategory === "all" ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                All categories
              </button>
              {qualifierCategories.map((category) => (
                <button key={category.id} type="button" onClick={() => setSelectedCategory(category.id)} className={selectedCategory === category.id ? "finals-category-pill finals-category-pill-active" : "finals-category-pill"}>
                  {category.display_name}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              {qualifierRows.map((entry) => (
                <div key={entry.climber_id} className="results-admin-list-item">
                  <div className="text-3xl font-semibold text-slate-950">{selectedCategory === "all" ? entry.overall_rank : entry.category_rank}</div>
                  <div className="flex-1">
                    <div className="text-2xl font-semibold text-slate-950">{entry.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{entry.display_category} · #{entry.climber_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-slate-950">{entry.total_score}</div>
                    <div className="mt-1 text-sm text-slate-600">{entry.topped_count} tops</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
