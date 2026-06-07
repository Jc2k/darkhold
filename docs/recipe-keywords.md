# Recipe keywords and assistant signals

Darkhold uses Tandoor recipe keywords as lightweight control signals for shelves, automatic meal-type selection, and the meal planning assistant. Keep this document current whenever code changes add, remove, or reinterpret one of these keywords.

## Tandoor keyword conventions

- Treat keyword names case-insensitively in Darkhold. Most assistant matching also treats a keyword as a substring match, so `quick dinner` matches `quick`.
- Tandoor keywords can have parent/child relationships. The `dinner` keyword is the parent for the main dinner cuisine/category keywords used by this household.
- Children of `dinner` should be the broad dinner categories humans use to balance a week, such as `pasta`, `rice`, `burger`, and similar high-level buckets.
- When adding or renaming a main dinner category, update all three places together:
  1. the Tandoor `dinner` keyword's children;
  2. the meal assistant category role map in `darkhold/src/utils/mealPlanningAssistant.ts` when the assistant should explicitly plan or de-duplicate that category; and
  3. this document.
- Do not rely on the parent/child relationship alone until the app code explicitly consumes it. Current matching is based on keyword names returned on recipes, not on traversing Tandoor keyword hierarchy metadata.

## Meal-type keywords

Darkhold automatically derives the Tandoor meal type for add-to-plan flows from recipe keywords. The UI must not ask the user to pick a meal type in add-to-plan modals.

| Keyword fragment | Effect |
| --- | --- |
| `breakfast` | Selects the configured breakfast meal type. |
| `lunch` | Selects the configured lunch meal type. |
| `dessert` | Selects the configured snack meal type when present, otherwise dessert. |
| `snack` | Selects the configured snack meal type when present, otherwise dessert. |
| none of the above | Selects dinner, or the latest non-breakfast meal type as a fallback. |

## Shelf keywords and recipe books

The current shelf integration uses a Tandoor recipe book, not a keyword:

| Name | Tandoor object | Effect |
| --- | --- | --- |
| `Up Soon` | Recipe book | Recipes in this book receive a strong meal assistant boost because someone has marked them as something to cook soon. |

If a future shelf is implemented with keywords instead of recipe books, document the keyword here and update the relevant shelf hook or assistant scoring code in the same change.

## Meal planning assistant keywords

### Dinner and lunch eligibility

| Keyword or name fragment | Effect |
| --- | --- |
| `lunch` | Required for lunch planning candidates. Also excludes the recipe from dinner planning. |
| `breakfast` | Excludes the recipe from dinner planning. |
| `dessert` | Excludes the recipe from dinner planning. |
| `snack` | Excludes the recipe from dinner planning. |
| `drink` / `drinks` | Excludes the recipe from dinner planning. |
| `baking` | Excludes the recipe from dinner planning. |

Dinner planning also filters out recipes with no image, recipes rated one star or lower, and recipes planned within the assistant's recent window.

### Slot roles

The assistant assigns each empty dinner or weekend-lunch slot a role, then looks for recipes whose keywords or names match that role.

| Role | Keyword or name fragments | Effect |
| --- | --- | --- |
| Special day | `special` | Preferred for configured special dates such as birthdays and anniversaries. |
| Busy day | `busy`, `quick`, `quickies` | Preferred when calendar appointments make an evening busy. |
| Good weather day | `outdoors` | Preferred for good-weather weekend or bank-holiday slots. Also counts as an explicit summer season fit. |
| Takeaway night | `takeaway`, `placeholder` | Used when takeaway has not appeared recently and can also satisfy busy-day fallback logic. |
| Pasta | `pasta` | Current dinner child/category role; the assistant tries to include and avoid over-repeating it. |
| Rice | `rice` | Current dinner child/category role; the assistant tries to include and avoid over-repeating it. |
| Noodles | `noodles`, `noodle` | Current dinner child/category role; the assistant tries to include and avoid over-repeating it. |
| Soy-free | `soy-free`, `soy free` | Current dinner child/category role; the assistant tries to include and avoid over-repeating it. |

The `dinner` keyword's children in Tandoor may include additional household categories, such as `burger`. Add those categories to the assistant role map before expecting the assistant to explicitly reserve slots for them.

### Seasonal keywords

| Keyword | Effect |
| --- | --- |
| `winter` | Adds an explicit season-fit boost during winter. |
| `spring` | Adds an explicit season-fit boost during spring. |
| `summer` | Adds an explicit season-fit boost during summer. |
| `autumn` | Adds an explicit season-fit boost during autumn. |
| `christmas` | Adds an explicit winter season-fit boost. |
| `outdoors` | Adds an explicit summer season-fit boost and supports good-weather slots. |

### Produce repetition signals

Produce repetition is not driven by recipe keywords. When `meal_assistant_produce_category` is configured, the server fetches Tandoor foods in that supermarket category and the assistant detects recipes whose ingredients use those food IDs or normalized names. The first weekly occurrence is free; later occurrences are penalized to encourage variety.

### Precalculation and debug signals

The meal assistant precalculation stores recipe keywords, Tandoor recipe categories, produce matches, weather signals, calendar signals, affinity clusters, and flags such as `has-image` and `low-rated`. Recipe similarity and cluster calculations use keywords alongside ingredient names, ingredient food IDs, recipe categories, and recipe names.

## Agent maintenance checklist

When changing shelves, meal planning, Tandoor keyword handling, or assistant scoring:

- Update this document in the same pull request.
- Update the `dinner` parent/child guidance above if the dinner category taxonomy changes.
- Keep `AGENTS.md` pointing agents to this document.
- If code starts consuming Tandoor keyword hierarchy metadata directly, update `darkhold/src/api/tandoor-types.d.ts`, the implementation notes here, and tests for parent/child behavior.
