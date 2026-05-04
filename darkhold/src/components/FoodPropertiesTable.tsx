import type { FoodProperty, Property, RecipeUnit } from '../api/tandoor-types';

/**
 * Displays calculated food properties (e.g. nutrition) for a recipe.
 * Uses the food_properties field returned by the Tandoor recipe detail endpoint,
 * which aggregates property values from each ingredient's food item.
 * Values are divided by servings to show per-serving amounts.
 */
export function RecipeFoodProperties({
  foodProperties,
  servings,
}: {
  foodProperties?: Record<string, FoodProperty>;
  servings?: number | null;
}) {
  if (!foodProperties) return null;

  const props = Object.values(foodProperties)
    .filter((p) => p.total_value > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (props.length === 0) return null;

  const per = servings && servings > 0 ? servings : 1;

  const hasIncomplete = props.some((p) => p.missing_value);

  return (
    <small className="text-muted">
      {props.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ' · '}
          {p.name}: {Math.round(p.total_value / per)} {p.unit ?? ''}
        </span>
      ))}
      {servings != null && servings > 1 && <span className="ms-1">(per serving)</span>}
      {hasIncomplete && <span className="ms-1">(incomplete)</span>}
    </small>
  );
}

/**
 * Displays food property values (e.g. nutrition) for a single food item.
 * Uses the properties field returned by the Tandoor food detail endpoint.
 * Optionally shows the reference amount the values apply to.
 */
export function FoodPropertiesTable({
  properties,
  amount,
  unit,
}: {
  properties?: Property[];
  amount?: number | string | null;
  unit?: RecipeUnit | null;
}) {
  if (!properties || properties.length === 0) return null;

  const filtered = properties.filter(
    (p) => p.property_amount != null && Number(p.property_amount) !== 0,
  );

  if (filtered.length === 0) return null;

  return (
    <small className="text-muted">
      {filtered.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ' · '}
          {p.property_type.name}: {Math.round(Number(p.property_amount))} {p.property_type.unit ?? ''}
        </span>
      ))}
      {amount != null && Number(amount) > 0 && unit && (
        <span className="ms-1">(per {Number(amount)} {unit.name})</span>
      )}
    </small>
  );
}
