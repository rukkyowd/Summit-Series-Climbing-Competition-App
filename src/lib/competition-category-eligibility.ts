import {
  isQualifierEligibleCategory,
  type Competition,
  type CompetitionCategory,
} from "./scoring";

export type FinalsEligibilityOption = {
  ageGroup: string;
  categoryIds: string[];
  displayCategories: string[];
};

export function getSelectedQualifierCategories(competition: Competition) {
  return competition.categories.filter((category) =>
    isQualifierEligibleCategory(competition, category.age_group)
  );
}

export function getFinalsEligibilityOptionsFromCategories(categories: CompetitionCategory[]) {
  const grouped = new Map<string, FinalsEligibilityOption>();

  for (const category of categories) {
    const current =
      grouped.get(category.age_group) ??
      {
        ageGroup: category.age_group,
        categoryIds: [],
        displayCategories: [],
      };

    current.categoryIds.push(category.id);
    current.displayCategories.push(category.display_name);
    grouped.set(category.age_group, current);
  }

  return Array.from(grouped.values());
}

export function getFinalsEligibilityOptions(competition: Competition) {
  return getFinalsEligibilityOptionsFromCategories(getSelectedQualifierCategories(competition));
}

export function getAllowedFinalsAgeGroupsFromSelectedCategories(competition: Competition) {
  return new Set(getFinalsEligibilityOptions(competition).map((option) => option.ageGroup));
}

export function constrainFinalsEligibleAgeGroupsToSelectedCategories(competition: Competition) {
  const allowedAgeGroups = getAllowedFinalsAgeGroupsFromSelectedCategories(competition);
  return competition.finals_eligible_age_groups.filter((ageGroup) => allowedAgeGroups.has(ageGroup));
}

export function finalsEligibilityUsesSelectedCategories(competition: Competition) {
  const allowedAgeGroups = getAllowedFinalsAgeGroupsFromSelectedCategories(competition);
  return competition.finals_eligible_age_groups.every((ageGroup) => allowedAgeGroups.has(ageGroup));
}
