/**
 * Tandoor OpenAPI Types
 * Generated TypeScript types for Tandoor Recipe Manager API
 * Schema: https://app.tandoor.dev/openapi/
 */

/** Nutrition information for a recipe */
export interface NutritionInformation {
  calories?: number | null;
  proteins?: number | null;
  carbohydrates?: number | null;
  fats?: number | null;
  fibres?: number | null;
}

/** Food item in the database */
export interface Food {
  id: number;
  name: string;
  description?: string;
  fdc_id?: string | null;
  food_onhand?: number;
  supermarket_category?: number | null;
}

/** Unit of measurement */
export interface RecipeUnit {
  id: number;
  name: string;
  plural?: string;
}

/** Recipe ingredient with amount and unit */
export interface RecipeIngredient {
  id: number;
  amount?: number | null;
  unit?: RecipeUnit | null;
  food: Food | number;
  note?: string | null;
}

/** Keyword/tag for recipes */
export interface Keyword {
  id: number;
  name: string;
  description?: string;
}

/** Recipe object */
export interface Recipe {
  id: number;
  name: string;
  description?: string;
  keywords?: Keyword[] | number[];
  image?: string | null;
  nutrition?: NutritionInformation;
  steps?: RecipeStep[];
  cooking_time?: number;
  waiting_time?: number;
  servings?: number;
  rating?: number | null;
  source_url?: string | null;
  created_by: number;
}

/** Recipe step/instruction */
export interface RecipeStep {
  id: number;
  name?: string;
  instruction: string;
  ingredients?: RecipeIngredient[];
  time?: number | null;
  order: number;
}

/** Meal type (breakfast, lunch, dinner, etc.) */
export interface MealType {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  order?: number;
}

/** Shopping list item */
export interface ShoppingListItem {
  id: number;
  amount?: number | null;
  unit?: string | null;
  food: Food | number;
  checked?: boolean;
  recipe_mealplan?: number | null;
}

/** Shopping list */
export interface ShoppingList {
  id: number;
  recipes?: number[];
  items?: ShoppingListItem[];
}

/** Meal plan entry */
export interface MealPlan {
  id: number;
  recipe: Recipe | number;
  meal_type: MealType | number;
  note?: string;
  servings?: number;
  from_date: string; // ISO 8601 date
  to_date?: string | null; // ISO 8601 date
  shopping?: boolean; // read-only: true if linked to a shopping list
  addshopping?: boolean; // write-only: set to true on create to add ingredients to shopping list
}

/** Supermarket category */
export interface SupermarketCategory {
  id: number;
  name: string;
  description?: string;
}

/** Supermarket */
export interface Supermarket {
  id: number;
  name: string;
}

/** Unit conversion */
export interface Unit {
  id: number;
  name: string;
  plural?: string;
  base_unit?: Unit | number | null;
}

/** User profile */
export interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

/** Space (workspace) */
export interface Space {
  id: number;
  name: string;
  owner?: User | number;
  members?: User[] | number[];
}

/** API Response with pagination */
export interface PaginatedResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

/** Generic error response */
export interface ErrorResponse {
  detail?: string;
  [key: string]: any;
}
