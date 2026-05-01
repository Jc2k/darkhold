import type { NutritionInformation } from '../api/tandoor-types';

export function NutritionBadge({ nutrition }: { nutrition?: NutritionInformation }) {
  if (!nutrition?.calories) return null;
  return (
    <small className="text-muted">
      {Math.round(nutrition.calories)} kcal
      {nutrition.proteins != null && <> · {Math.round(nutrition.proteins)}g protein</>}
      {nutrition.carbohydrates != null && <> · {Math.round(nutrition.carbohydrates)}g carbs</>}
      {nutrition.fats != null && <> · {Math.round(nutrition.fats)}g fat</>}
    </small>
  );
}
