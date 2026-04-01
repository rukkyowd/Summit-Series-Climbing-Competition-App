import type { CompetitionSnapshot } from "./db";

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildQualifierCsv(snapshot: CompetitionSnapshot) {
  const rows = [
    ["Rank", "Name", "Number", "Province", "Category", "Score", "Tops", "Zones", "Attempts"],
    ...snapshot.qualifierLeaderboard.map((entry) => [
      entry.overall_rank,
      entry.name,
      entry.climber_number,
      entry.province,
      entry.display_category,
      entry.total_score,
      entry.topped_count,
      entry.zone_count,
      entry.counting_attempt_total,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function buildFinalsCsv(snapshot: CompetitionSnapshot) {
  const problemHeaders = Array.from({ length: snapshot.competition.finals_problem_count }, (_, index) => `B${index + 1}`);
  const rows = [
    ["Rank", "Name", "Number", "Province", "Category", ...problemHeaders, "Points", "Tops", "Zones", "Attempts To Top", "Attempts To Zone"],
    ...snapshot.finalsLeaderboard.map((entry) => [
      entry.overall_rank,
      entry.name,
      entry.climber_number,
      entry.province,
      entry.display_category,
      ...entry.problem_results.map((problem) => (problem.top ? `T${problem.attempts_to_top ?? 1}` : problem.zone ? `Z${problem.attempts_to_zone ?? 1}` : "")),
      entry.total_points,
      entry.tops,
      entry.zones,
      entry.attempts_to_top,
      entry.attempts_to_zone,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
