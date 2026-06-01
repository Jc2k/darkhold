import type { RecipeCreationDateCandidate } from '../api/housekeeping';

const SCRIPT_FILENAME = 'fix_recipe_creation_dates.py';

export function buildRecipeCreationDateScript(candidates: RecipeCreationDateCandidate[]): string {
  const corrections = candidates.map((candidate) => [
    candidate.recipeId,
    candidate.currentCreatedAt,
    candidate.proposedCreatedAt,
  ]);

  return `"""Repair Tandoor recipe creation dates selected in Darkhold.

Run once with APPLY = False and review the output. After creating a backup,
change APPLY to True and run the script again with:

    python manage.py shell < ${SCRIPT_FILENAME}
"""

from django.db import transaction
from django.utils.dateparse import parse_datetime
from django_scopes import scopes_disabled

from cookbook.models import Recipe

APPLY = False

# recipe id, expected current timestamp, proposed timestamp
CORRECTIONS = ${JSON.stringify(corrections, null, 4)}

with scopes_disabled(), transaction.atomic():
    for recipe_id, expected_raw, proposed_raw in CORRECTIONS:
        expected = parse_datetime(expected_raw)
        proposed = parse_datetime(proposed_raw)
        recipe = Recipe.objects.get(pk=recipe_id)

        if recipe.created_at != expected:
            raise RuntimeError(
                f"Recipe #{recipe_id} changed since the Darkhold scan: "
                f"expected {expected!r}, found {recipe.created_at!r}"
            )

        print(
            f"{'APPLY' if APPLY else 'DRY RUN'}: recipe #{recipe_id}: "
            f"{expected.isoformat()} -> {proposed.isoformat()}"
        )

        if APPLY:
            updated = Recipe.objects.filter(pk=recipe_id, created_at=expected).update(
                created_at=proposed
            )
            if updated != 1:
                raise RuntimeError(f"Recipe #{recipe_id} was not updated exactly once")

    if not APPLY:
        transaction.set_rollback(True)

print(f"{'Applied' if APPLY else 'Previewed'} {len(CORRECTIONS)} corrections.")
`;
}

export function downloadRecipeCreationDateScript(candidates: RecipeCreationDateCandidate[]): void {
  const url = URL.createObjectURL(
    new Blob([buildRecipeCreationDateScript(candidates)], { type: 'text/x-python;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = SCRIPT_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
}
