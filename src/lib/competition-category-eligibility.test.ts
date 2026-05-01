import { describe, expect, it } from "vitest";
import {
  constrainFinalsEligibleAgeGroupsToSelectedCategories,
  finalsEligibilityUsesSelectedCategories,
  getFinalsEligibilityOptions,
} from "./competition-category-eligibility";
import { DEFAULT_COMPETITION, getDefaultCompetitionCategories, normalizeCompetition } from "./scoring";

describe("competition category eligibility", () => {
  it("derives finals options from selected category rows with ids and display names", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "category-options",
        qualifier_eligible_age_groups: ["Youth B", "Open"],
        finals_eligible_age_groups: ["Open"],
      },
      getDefaultCompetitionCategories("category-options"),
      [],
      []
    );

    const options = getFinalsEligibilityOptions(competition);

    expect(options.map((option) => option.ageGroup)).toEqual(["Youth B", "Open"]);
    expect(options.find((option) => option.ageGroup === "Open")?.categoryIds).toEqual([
      "Men::Open",
      "Women::Open",
      "X::Open",
    ]);
    expect(options.find((option) => option.ageGroup === "Open")?.displayCategories).toEqual([
      "Men / Open",
      "Women / Open",
      "X / Open",
    ]);
  });

  it("constrains finals age groups to categories selected for qualifiers", () => {
    const competition = normalizeCompetition(
      {
        ...DEFAULT_COMPETITION,
        id: "category-constraint",
        qualifier_eligible_age_groups: ["Rec"],
        finals_eligible_age_groups: ["Rec", "Open"],
      },
      getDefaultCompetitionCategories("category-constraint"),
      [],
      []
    );

    expect(finalsEligibilityUsesSelectedCategories(competition)).toBe(false);
    expect(constrainFinalsEligibleAgeGroupsToSelectedCategories(competition)).toEqual(["Rec"]);
  });
});
