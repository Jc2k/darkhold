import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "react-bootstrap";
import { apiGet } from "../api/client";
import type { MealPlan, Recipe } from "../api/tandoor-types";
import { LoadingMascot } from "../components/LoadingMascot";
import { RecipeDetailContent, useRecipeJsonLd } from "./RecipeDetail";

export function MealPlanEntryDetail() {
  const { entryId } = useParams<{ entryId: string }>();

  const {
    data: entry,
    isLoading: entryLoading,
    isError: entryError,
  } = useQuery({
    queryKey: ["meal-plan-entry", entryId],
    queryFn: () => apiGet<MealPlan>(`/meal-plan/${entryId}/`),
    enabled: !!entryId,
  });

  const recipeId = entry
    ? typeof entry.recipe === "object"
      ? entry.recipe.id
      : entry.recipe
    : undefined;

  const {
    data: recipe,
    isLoading: recipeLoading,
    isError: recipeError,
  } = useQuery({
    queryKey: ["recipe", String(recipeId)],
    queryFn: () => apiGet<Recipe>(`/recipe/${recipeId}/`),
    enabled: recipeId != null,
  });

  useRecipeJsonLd(recipe);

  if ((entryLoading || recipeLoading) && !recipe) {
    return <LoadingMascot />;
  }

  if (entryError) {
    return <Alert variant="danger">Failed to load meal plan entry.</Alert>;
  }

  if (recipeError || !recipe) {
    return <Alert variant="danger">Failed to load recipe.</Alert>;
  }

  const note = entry?.note ?? null;
  const servingsOverride = entry?.servings ?? null;

  return (
    <>
      <RecipeDetailContent
        recipe={recipe}
        servingsOverride={servingsOverride}
        mealPlanNote={note}
      />
    </>
  );
}
