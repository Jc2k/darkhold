import { Hono } from 'hono';
import ICAL from 'ical.js';
import { calendarQuery } from 'tsdav';
import type { DAVResponse } from 'tsdav';
import type {
  CookLog,
  Food,
  Keyword,
  MealPlan,
  PaginatedResponse,
  Recipe,
  SupermarketCategory,
} from './src/api/tandoor-types.d.ts';
import {
  buildMealAssistantPrecalculation,
  isMealAssistantPrecalculation,
  mealAssistantDayNumberToDate,
  type MealAssistantPrecalculation,
} from './src/utils/mealAssistantPrecalculation.ts';
import {
  buildYearInFoodSummary,
  validateYearInFoodYear,
  type YearInFoodSummary,
} from './src/utils/yearInFood.ts';
import { buildCalendarFeatureDay } from './src/utils/calendarFeatures.ts';
import {
  createEmptyCalendarFeatureCache,
  extendCalendarFeatureCache,
  isCalendarFeatureCache,
} from './src/utils/calendarFeatureCache.ts';
import {
  createEmptyWeatherFeatureCache,
  extendWeatherFeatureCache,
  isWeatherFeatureCache,
} from './src/utils/weatherFeatureCache.ts';

const VERSION = loadPackageVersion();

function loadPackageVersion(): string {
  const fallbackVersion = '0.0.0';
  try {
    const body = Deno.readTextFileSync('/package.json');
    const payload: unknown = JSON.parse(body);
    if (typeof payload === 'object' && payload !== null && 'version' in payload) {
      const version = (payload as { version?: unknown }).version;
      if (typeof version === 'string' && version.length > 0) return version;
    }
  } catch {
    // Tests and local development may import the server without a packaged /package.json.
  }
  return fallbackVersion;
}

type MealAssistantPrecalculationEventStatus =
  | 'started'
  | 'progress'
  | 'success'
  | 'error'
  | 'skipped'
  | 'already-running';

interface MealAssistantPrecalculationEvent {
  type: 'meal-assistant-precalculation';
  status: MealAssistantPrecalculationEventStatus;
  runId: string;
  message: string;
  updatedAt: string;
  detail?: string;
}

type MealAssistantPrecalculationReporter = (
  status: MealAssistantPrecalculationEventStatus,
  message: string,
  detail?: string,
) => void;

// ---------------------------------------------------------------------------
// Meal assistant nightly precalculation
// ---------------------------------------------------------------------------

function safeGetEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch (err) {
    if (err instanceof Deno.errors.NotCapable) return undefined;
    throw err;
  }
}

function loadMealAssistantPrecalculationPath(): string {
  return (
    safeGetEnv('MEAL_ASSISTANT_PRECALCULATION_PATH') ?? DEFAULT_MEAL_ASSISTANT_PRECALCULATION_PATH
  );
}

function loadMealAssistantStatusPath(): string {
  return safeGetEnv('MEAL_ASSISTANT_STATUS_PATH') ?? DEFAULT_MEAL_ASSISTANT_STATUS_PATH;
}

function loadWeatherFeatureCachePath(): string {
  return safeGetEnv('WEATHER_FEATURE_CACHE_PATH') ?? DEFAULT_WEATHER_FEATURE_CACHE_PATH;
}

function loadCalendarFeatureCachePath(): string {
  return safeGetEnv('CALENDAR_FEATURE_CACHE_PATH') ?? DEFAULT_CALENDAR_FEATURE_CACHE_PATH;
}

function getTandoorHeaders(): HeadersInit {
  const token = safeGetEnv('TANDOOR_DEFAULT_TOKEN') ?? '';
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

async function fetchAllTandoorPages<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  tandoorUrl = safeGetEnv('TANDOOR_URL') ?? 'http://tandoor:8080',
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = new URL(`/api${path}`, tandoorUrl);
    for (const [key, value] of Object.entries({ ...params, page_size: 100, page })) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url, { headers: getTandoorHeaders() });
    if (!res.ok) {
      throw formatFetchError(`Tandoor fetch failed for ${path}`, res.status, await res.text());
    }
    const data = (await res.json()) as PaginatedResponse<T>;
    all.push(...data.results);
    hasNext = !!data.next;
    page += 1;
  }

  return all;
}

async function fetchTandoorJson<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  tandoorUrl = safeGetEnv('TANDOOR_URL') ?? 'http://tandoor:8080',
): Promise<T> {
  const url = new URL(`/api${path}`, tandoorUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const res = await fetch(url, { headers: getTandoorHeaders() });
  if (!res.ok) {
    throw formatFetchError(`Tandoor fetch failed for ${path}`, res.status, await res.text());
  }
  return (await res.json()) as T;
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function fetchMealAssistantRecipes(): Promise<Recipe[]> {
  const recipeSummaries = await fetchAllTandoorPages<Recipe>('/recipe/');
  return mapWithConcurrency(recipeSummaries, 5, async (recipe) => {
    try {
      return await fetchTandoorJson<Recipe>(`/recipe/${recipe.id}/`);
    } catch (err) {
      console.warn(`Unable to fetch full recipe ${recipe.id}; using list payload instead.`, err);
      return recipe;
    }
  });
}

async function fetchMealAssistantProduceFoods(
  categoryName: string,
): Promise<Array<Pick<Food, 'id' | 'name'>>> {
  const normalizedCategoryName = categoryName.trim().toLowerCase();
  if (!normalizedCategoryName) return [];

  const categories = await fetchAllTandoorPages<SupermarketCategory>('/supermarket-category/');
  const category = categories.find(
    (candidate) => candidate.name.trim().toLowerCase() === normalizedCategoryName,
  );
  if (!category) return [];

  const foods = await fetchAllTandoorPages<Food>('/food/', {
    supermarket_category: category.id,
  });
  return foods
    .map((food) => ({ id: food.id, name: food.name.trim().toLowerCase() }))
    .filter((food) => food.name);
}

async function fetchMealAssistantKeywordNameById(): Promise<Record<number, string>> {
  const keywords = await fetchAllTandoorPages<Keyword>('/keyword/');
  return keywords.reduce<Record<number, string>>((acc, keyword) => {
    acc[keyword.id] = keyword.name;
    return acc;
  }, {});
}

export function getMealAssistantMealPlanQueryParams(today = new Date()): {
  from_date: string;
  to_date: string;
} {
  const maxMealPlanDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  maxMealPlanDate.setUTCDate(
    maxMealPlanDate.getUTCDate() + MEAL_ASSISTANT_MEAL_PLAN_FUTURE_HORIZON_DAYS,
  );

  return {
    from_date: MEAL_ASSISTANT_MEAL_PLAN_HISTORY_FROM_DATE,
    to_date: formatUtcDate(maxMealPlanDate),
  };
}

async function fetchMealAssistantMealPlans(): Promise<MealPlan[]> {
  return fetchAllTandoorPages<MealPlan>('/meal-plan/', getMealAssistantMealPlanQueryParams());
}

function historicalMealPlanDates(mealPlans: MealPlan[], today = new Date()): string[] {
  const todayStr = formatUtcDate(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );
  return [...new Set(mealPlans.map((mealPlan) => mealPlan.from_date.split('T')[0]).filter(Boolean))]
    .filter((date) => date <= todayStr)
    .sort((left, right) => left.localeCompare(right));
}

async function readWeatherFeatureCache(): Promise<
  ReturnType<typeof createEmptyWeatherFeatureCache>
> {
  try {
    const body = await Deno.readTextFile(loadWeatherFeatureCachePath());
    const payload: unknown = JSON.parse(body);
    return isWeatherFeatureCache(payload) ? payload : createEmptyWeatherFeatureCache();
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return createEmptyWeatherFeatureCache();
    }
    throw err;
  }
}

async function readCalendarFeatureCache(): Promise<
  ReturnType<typeof createEmptyCalendarFeatureCache>
> {
  try {
    const body = await Deno.readTextFile(loadCalendarFeatureCachePath());
    const payload: unknown = JSON.parse(body);
    return isCalendarFeatureCache(payload) ? payload : createEmptyCalendarFeatureCache();
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return createEmptyCalendarFeatureCache();
    }
    throw err;
  }
}

async function writeFileAtomically(path: string, body: string): Promise<void> {
  const lastSlash = path.lastIndexOf('/');
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash) : '.';
  await Deno.mkdir(directory || '.', { recursive: true });
  const tempPath = `${path}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(tempPath, body);
  await Deno.rename(tempPath, path);
}

async function fetchArchivedWeatherRange(
  config: WeatherConfig,
  fromDate: string,
  toDate: string,
): Promise<WeatherDayForecast[]> {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(config.latitude));
  url.searchParams.set('longitude', String(config.longitude));
  url.searchParams.set('timezone', config.timezone);
  url.searchParams.set('start_date', fromDate);
  url.searchParams.set('end_date', toDate);
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_min',
      'temperature_2m_max',
      'sunrise',
      'sunset',
      'precipitation_sum',
    ].join(','),
  );

  const res = await fetch(url);
  if (!res.ok) {
    let body = '';
    try {
      body = (await res.text()).trim();
    } catch {
      body = '';
    }
    const suffix = body ? `; ${body.slice(0, MAX_ERROR_RESPONSE_LENGTH)}` : '';
    throw new Error(`Weather archive fetch failed: HTTP ${res.status}${suffix}`);
  }

  const payload = (await res.json()) as OpenMeteoForecastResponse;
  return parseOpenMeteoDaily(payload.daily ?? {});
}

async function fetchWeatherFeatureRange(
  config: WeatherConfig,
  fromDate: string,
  toDate: string,
  today = new Date(),
): Promise<WeatherDayForecast[]> {
  const todayStr = formatUtcDate(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );
  const ranges: Promise<WeatherDayForecast[]>[] = [];

  if (fromDate < todayStr) {
    const yesterday = new Date(`${todayStr}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const archiveEndDate = toDate < todayStr ? toDate : formatUtcDate(yesterday);
    if (fromDate <= archiveEndDate) {
      ranges.push(fetchArchivedWeatherRange(config, fromDate, archiveEndDate));
    }
  }

  if (toDate >= todayStr) {
    const forecastFromDate = fromDate > todayStr ? fromDate : todayStr;
    ranges.push(fetchWeatherForecast(config, forecastFromDate, toDate));
  }

  return (await Promise.all(ranges))
    .flat()
    .sort((left, right) => left.date.localeCompare(right.date));
}

function enumerateDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (let date = new Date(`${fromDate}T00:00:00Z`); date <= new Date(`${toDate}T00:00:00Z`); ) {
    dates.push(formatUtcDate(date));
    date = new Date(date.getTime() + DAY_MS);
  }
  return dates;
}

async function fetchCalendarFeatureRange(fromDate: string, toDate: string) {
  const rangeStart = new Date(`${fromDate}T00:00:00Z`);
  const rangeEnd = new Date(`${toDate}T23:59:59Z`);
  const feeds = loadICalFeeds().filter((feed) => (feed.category ?? 'appointment') !== 'context');
  const eventsByDate = new Map<string, ParsedEvent[]>();

  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const events = await fetchFeedEvents(feed, rangeStart, rangeEnd);
        for (const event of events) {
          const date = event.start.includes('T') ? event.start.split('T')[0] : event.start;
          const current = eventsByDate.get(date) ?? [];
          current.push(event);
          eventsByDate.set(date, current);
        }
      } catch (err) {
        console.error(`Error fetching calendar feature feed "${feed.name}":`, err);
      }
    }),
  );

  return enumerateDateRange(fromDate, toDate).map((date) => ({
    date,
    ...buildCalendarFeatureDay(eventsByDate.get(date) ?? []),
  }));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function errorStack(err: unknown): string | undefined {
  return err instanceof Error && err.stack ? err.stack : undefined;
}

async function readMealAssistantLastSuccessAt(): Promise<string | undefined> {
  try {
    const raw = await Deno.readTextFile(loadMealAssistantStatusPath());
    const payload = JSON.parse(raw) as unknown;
    if (typeof payload !== 'object' || payload === null) return undefined;
    const lastSuccessAt = (payload as { lastSuccessAt?: unknown }).lastSuccessAt;
    return typeof lastSuccessAt === 'string' ? lastSuccessAt : undefined;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound || err instanceof SyntaxError) {
      return undefined;
    }
    throw err;
  }
}

async function writeMealAssistantStatus(
  status:
    | { status: 'success'; message: string; detail?: string }
    | { status: 'skipped'; message: string; detail?: string }
    | { status: 'error'; message: string; err: unknown; detail?: string },
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const lastSuccessAt =
    status.status === 'success' ? updatedAt : await readMealAssistantLastSuccessAt();
  const body = {
    status: status.status,
    updatedAt,
    ...(lastSuccessAt ? { lastSuccessAt } : {}),
    message: status.message,
    ...(status.detail ? { detail: status.detail } : {}),
    ...(status.status === 'error'
      ? {
          error: errorMessage(status.err),
          ...(errorStack(status.err) ? { stack: errorStack(status.err) } : {}),
        }
      : {}),
  };
  await writeFileAtomically(loadMealAssistantStatusPath(), `${JSON.stringify(body)}\n`);
}

async function writeMealAssistantPrecalculation(
  report: MealAssistantPrecalculationReporter = () => {},
): Promise<void> {
  if (!safeGetEnv('TANDOOR_DEFAULT_TOKEN')) {
    const message =
      'Skipping meal assistant precalculation: TANDOOR_DEFAULT_TOKEN is not configured.';
    console.warn(message);
    report('skipped', message);
    await writeMealAssistantStatus({ status: 'skipped', message });
    return;
  }

  report('progress', 'Fetching recipes, keywords, meal plans, and produce metadata from Tandoor.');
  const [recipes, keywordNameById, mealPlans, produceFoods] = await Promise.all([
    fetchMealAssistantRecipes().then((recipes) => {
      report('progress', `Fetched ${recipes.length} recipes from Tandoor.`);
      return recipes;
    }),
    fetchMealAssistantKeywordNameById().then((keywordNameById) => {
      report('progress', `Fetched ${Object.keys(keywordNameById).length} keywords from Tandoor.`);
      return keywordNameById;
    }),
    fetchMealAssistantMealPlans().then((mealPlans) => {
      report('progress', `Fetched ${mealPlans.length} meal-plan entries from Tandoor.`);
      return mealPlans;
    }),
    fetchMealAssistantProduceFoods(safeGetEnv('MEAL_ASSISTANT_PRODUCE_CATEGORY') ?? '').then(
      (produceFoods) => {
        report('progress', `Fetched ${produceFoods.length} produce foods from Tandoor.`);
        return produceFoods;
      },
    ),
  ]);

  report('progress', 'Reading weather and calendar feature caches.');
  const weatherConfig = loadWeatherConfig();
  const weatherCache = await readWeatherFeatureCache();
  const calendarCache = await readCalendarFeatureCache();
  const requiredHistoricalDates = historicalMealPlanDates(mealPlans);
  report(
    'progress',
    `Reconciling weather and calendar feature caches for ${requiredHistoricalDates.length} historical dates.`,
  );
  const nextWeatherCache =
    weatherConfig && requiredHistoricalDates.length > 0
      ? await extendWeatherFeatureCache(weatherCache, requiredHistoricalDates, (fromDate, toDate) =>
          fetchWeatherFeatureRange(weatherConfig, fromDate, toDate),
        )
      : weatherCache;
  report(
    'progress',
    `Weather feature cache contains ${Object.keys(nextWeatherCache.dates).length} days.`,
  );
  const nextCalendarCache =
    requiredHistoricalDates.length > 0
      ? await extendCalendarFeatureCache(
          calendarCache,
          requiredHistoricalDates,
          fetchCalendarFeatureRange,
        )
      : calendarCache;
  report(
    'progress',
    `Calendar feature cache contains ${Object.keys(nextCalendarCache.dates).length} days.`,
  );

  if (nextWeatherCache !== weatherCache) {
    await writeFileAtomically(
      loadWeatherFeatureCachePath(),
      `${JSON.stringify(nextWeatherCache)}\n`,
    );
  }
  if (nextCalendarCache !== calendarCache) {
    await writeFileAtomically(
      loadCalendarFeatureCachePath(),
      `${JSON.stringify(nextCalendarCache)}\n`,
    );
  }

  report('progress', 'Building meal assistant precalculation payload.');
  const precalculation = buildMealAssistantPrecalculation({
    recipes,
    keywordNameById,
    mealPlans,
    produceFoods,
    weatherByDate: nextWeatherCache.dates,
    calendarByDate: nextCalendarCache.dates,
  });
  const path = loadMealAssistantPrecalculationPath();
  await writeFileAtomically(path, `${JSON.stringify(precalculation)}\n`);
  const message = `Wrote meal assistant precalculation with ${recipes.length} recipes, ${mealPlans.length} meal-plan entries, ${
    Object.keys(nextWeatherCache.dates).length
  } cached weather days, and ${
    Object.keys(nextCalendarCache.dates).length
  } cached calendar days to ${path}.`;
  console.info(message);
  report('success', message);
  await writeMealAssistantStatus({ status: 'success', message });
}

async function shouldRefreshMealAssistantPrecalculation(): Promise<boolean> {
  try {
    const stat = await Deno.stat(loadMealAssistantPrecalculationPath());
    const modifiedAt = stat.mtime?.getTime() ?? 0;
    return Date.now() - modifiedAt > MEAL_ASSISTANT_PRECALCULATION_STALE_MS;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return true;
    if (err instanceof Deno.errors.NotCapable) return false;
    throw err;
  }
}

async function refreshMealAssistantPrecalculationIfNeeded(): Promise<void> {
  if (!(await shouldRefreshMealAssistantPrecalculation())) return;
  runMealAssistantPrecalculationTask('stale-startup-check');
}

let mealAssistantPrecalculationPromise: Promise<void> | null = null;
let mealAssistantPrecalculationRunId: string | null = null;

function createMealAssistantPrecalculationReporter(
  runId: string,
): MealAssistantPrecalculationReporter {
  return (status, message, detail) => {
    const event: MealAssistantPrecalculationEvent = {
      type: 'meal-assistant-precalculation',
      status,
      runId,
      message,
      updatedAt: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    };
    broadcastToAllClients(JSON.stringify(event));
  };
}

function runMealAssistantPrecalculationTask(reason: string): boolean {
  if (mealAssistantPrecalculationPromise) {
    const runId = mealAssistantPrecalculationRunId ?? 'unknown';
    createMealAssistantPrecalculationReporter(runId)(
      'already-running',
      'Meal assistant precalculation is already running.',
      `Requested by ${reason}.`,
    );
    return false;
  }

  const runId = crypto.randomUUID();
  mealAssistantPrecalculationRunId = runId;
  const report = createMealAssistantPrecalculationReporter(runId);
  report('started', 'Meal assistant precalculation started.', `Requested by ${reason}.`);

  mealAssistantPrecalculationPromise = writeMealAssistantPrecalculation(report)
    .then(() => {
      broadcastToAllClients(
        JSON.stringify({
          type: 'invalidate',
          queryKey: 'meal-assistant-debug',
        }),
      );
      broadcastToAllClients(
        JSON.stringify({
          type: 'invalidate',
          queryKey: 'meal-assistant-status',
        }),
      );
    })
    .catch((err) => {
      const message = 'Meal assistant precalculation failed.';
      report('error', message, errorMessage(err));
      void reportMealAssistantPrecalculationError(message, err);
    })
    .finally(() => {
      mealAssistantPrecalculationPromise = null;
      mealAssistantPrecalculationRunId = null;
    });

  return true;
}

async function reportMealAssistantPrecalculationError(
  message: string,
  err: unknown,
): Promise<void> {
  console.error(message, err);
  try {
    await writeMealAssistantStatus({ status: 'error', message, err });
  } catch (statusErr) {
    console.error('Failed to write meal assistant status file:', statusErr);
  }
}

function startMealAssistantPrecalculationTask(): void {
  refreshMealAssistantPrecalculationIfNeeded().catch((err) => {
    void reportMealAssistantPrecalculationError('Meal assistant precalculation failed.', err);
  });
  setInterval(() => {
    runMealAssistantPrecalculationTask('nightly-schedule');
  }, MEAL_ASSISTANT_PRECALCULATION_INTERVAL_MS);
}

export async function handleForceMealAssistantPrecalculation(
  startTask: (reason: string) => boolean | Promise<boolean> = runMealAssistantPrecalculationTask,
): Promise<Response> {
  const started = await startTask('manual-debug-button');
  return new Response(
    JSON.stringify({
      status: started ? 'started' : 'already-running',
      message: started
        ? 'Meal assistant precalculation started.'
        : 'Meal assistant precalculation is already running.',
    }),
    {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}

async function handleMealAssistantPrecalculation(): Promise<Response> {
  try {
    const body = await Deno.readTextFile(loadMealAssistantPrecalculationPath());
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return new Response(
        JSON.stringify({
          error: 'Meal assistant precalculation is not available yet',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      );
    }
    throw err;
  }
}

async function handleMealAssistantStatus(): Promise<Response> {
  try {
    const body = await Deno.readTextFile(loadMealAssistantStatusPath());
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return new Response(JSON.stringify({ error: 'Meal assistant status is not available yet' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// iCal feed configuration
// ---------------------------------------------------------------------------

interface ICalFeed {
  name: string;
  url: string;
  type?: 'ics' | 'caldav';
  category?: 'appointment' | 'bank-holiday' | 'context';
  username?: string;
  password?: string;
}

interface CalendarFeedError {
  feed: string;
  message: string;
}

interface WeatherConfig {
  latitude: number;
  longitude: number;
  timezone: string;
}

const MAX_ERROR_RESPONSE_LENGTH = 200;
const DEFAULT_WEATHER_TIMEZONE = 'Europe/London';
const OPEN_METEO_MAX_FORECAST_DAYS = 16;
const CALDAV_NAMESPACE_PREFIX = 'c';
const DAY_MS = 24 * 60 * 60 * 1000;
const MEAL_ASSISTANT_PRECALCULATION_INTERVAL_MS = DAY_MS;
const MEAL_ASSISTANT_PRECALCULATION_STALE_MS = DAY_MS;
const MEAL_ASSISTANT_MEAL_PLAN_HISTORY_FROM_DATE = '1970-01-01';
const MEAL_ASSISTANT_MEAL_PLAN_FUTURE_HORIZON_DAYS = 360;
const DEFAULT_MEAL_ASSISTANT_PRECALCULATION_PATH = '/data/meal-assistant-precalculation.json';
const DEFAULT_MEAL_ASSISTANT_STATUS_PATH = '/data/meal-assistant-status.json';
const DEFAULT_WEATHER_FEATURE_CACHE_PATH = '/data/weather-feature-cache.json';
const DEFAULT_CALENDAR_FEATURE_CACHE_PATH = '/data/calendar-feature-cache.json';
export function parseICalFeeds(raw: string): ICalFeed[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((f): ICalFeed[] => {
      if (typeof f !== 'object' || f === null) return [];
      const record = f as Record<string, unknown>;
      if (typeof record.name !== 'string' || typeof record.url !== 'string') {
        return [];
      }

      // Treat null as absent for all optional fields (HA passes null for unset optional fields)
      const rawType = record.type == null ? undefined : record.type;
      let type: 'ics' | 'caldav' | undefined;
      if (rawType !== undefined) {
        if (typeof rawType !== 'string') return [];
        const normalizedType = rawType.toLowerCase().trim();
        if (normalizedType !== 'ics' && normalizedType !== 'caldav') return [];
        type = normalizedType === 'caldav' ? 'caldav' : 'ics';
      }

      const rawCategory = record.category == null ? undefined : record.category;
      let category: 'appointment' | 'bank-holiday' | 'context' | undefined;
      if (rawCategory !== undefined) {
        if (typeof rawCategory !== 'string') return [];
        const normalizedCategory = rawCategory
          .toLowerCase()
          .trim()
          .replaceAll(/[\s_]+/g, '-');
        if (
          normalizedCategory !== 'appointment' &&
          normalizedCategory !== 'bank-holiday' &&
          normalizedCategory !== 'context'
        ) {
          return [];
        }
        category = normalizedCategory;
      }

      const username = record.username == null ? undefined : record.username;
      if (username !== undefined && typeof username !== 'string') return [];

      const password = record.password == null ? undefined : record.password;
      if (password !== undefined && typeof password !== 'string') return [];
      if (
        (username !== undefined && password === undefined) ||
        (username === undefined && password !== undefined)
      ) {
        return [];
      }

      const feed: ICalFeed = {
        name: record.name,
        url: record.url,
      };
      if (type !== undefined) feed.type = type;
      if (category !== undefined) feed.category = category;
      if (username !== undefined) feed.username = username;
      if (password !== undefined) feed.password = password;
      return [feed];
    });
  } catch {
    return [];
  }
}

function loadICalFeeds(): ICalFeed[] {
  return parseICalFeeds(Deno.env.get('ICAL_FEEDS') ?? '[]');
}

function loadWeatherConfig(): WeatherConfig | null {
  const latitudeRaw = Deno.env.get('WEATHER_LATITUDE');
  const longitudeRaw = Deno.env.get('WEATHER_LONGITUDE');
  const timezone = Deno.env.get('WEATHER_TIMEZONE') || DEFAULT_WEATHER_TIMEZONE;
  if (!latitudeRaw || !longitudeRaw) return null;
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, timezone };
}
// ---------------------------------------------------------------------------
// iCal parsing using ical.js (https://www.npmjs.com/package/ical.js)
// ---------------------------------------------------------------------------

export interface ParsedEvent {
  name: string;
  description?: string;
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events */
  start: string;
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events; undefined when same as start */
  end?: string;
  allDay: boolean;
  category?: 'appointment' | 'bank-holiday' | 'context';
  recurring?: boolean;
}

class TandoorUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TandoorUpstreamError';
  }
}

function formatCalDavTimestamp(date: Date): string {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function getBasicAuthHeader(feed: ICalFeed): string | undefined {
  if (feed.username === undefined || feed.password === undefined) {
    return undefined;
  }
  return `Basic ${btoa(`${feed.username}:${feed.password}`)}`;
}

function formatFetchError(prefix: string, status: number, responseText: string): Error {
  const trimmed = responseText.trim();
  const responseSummary = trimmed ? `; ${trimmed.slice(0, MAX_ERROR_RESPONSE_LENGTH)}` : '';
  return new Error(`${prefix}: HTTP ${status}${responseSummary}`);
}

function buildCalDavFilters(
  rangeStart: Date,
  rangeEnd: Date,
  withTimeRange: boolean,
): Record<string, unknown>[] {
  return [
    {
      'comp-filter': {
        _attributes: { name: 'VCALENDAR' },
        'comp-filter': {
          _attributes: { name: 'VEVENT' },
          ...(withTimeRange
            ? {
                'time-range': {
                  _attributes: {
                    start: formatCalDavTimestamp(rangeStart),
                    end: formatCalDavTimestamp(rangeEnd),
                  },
                },
              }
            : {}),
        },
      },
    },
  ];
}

function getCalDavPayload(response: { props?: Record<string, unknown> }): string | null {
  const payload = response.props?.calendarData;
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const cdata = (payload as { _cdata?: unknown })._cdata;
    if (typeof cdata === 'string') return cdata;
  }
  return null;
}

async function fetchCalDavCalendarData(
  url: string,
  headers: Record<string, string>,
  rangeStart: Date,
  rangeEnd: Date,
  withTimeRange: boolean,
): Promise<string[]> {
  let responses: DAVResponse[];
  try {
    responses = await calendarQuery({
      url,
      props: {
        [`${CALDAV_NAMESPACE_PREFIX}:calendar-data`]: {},
      },
      filters: buildCalDavFilters(rangeStart, rangeEnd, withTimeRange),
      depth: '1',
      headers,
      fetch: globalThis.fetch,
    });
  } catch (err) {
    if (err instanceof Error) {
      const match = err.message.match(
        /Collection query failed:\s*(\d{3})(?:\s*\.\s*Raw response:\s*([\s\S]*))?/,
      );
      if (match) {
        throw formatFetchError(
          'CalDAV REPORT failed',
          Number.parseInt(match[1], 10),
          match[2] ?? '',
        );
      }
    }
    throw err;
  }

  const failed = responses.find((r: DAVResponse) => !r.ok);
  if (failed) {
    throw formatFetchError(
      'CalDAV REPORT failed',
      failed.status,
      typeof failed.raw === 'string' ? failed.raw : '',
    );
  }

  return responses
    .map((r: DAVResponse) => getCalDavPayload(r))
    .filter((v: string | null): v is string => Boolean(v && v.trim()));
}

export function extractCalDavCalendarData(xml: string): string[] {
  const matches = xml.matchAll(
    /<(?:[A-Za-z0-9_-]+:)?calendar-data(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?calendar-data>/g,
  );
  return Array.from(matches)
    .map((m) => {
      const raw = m[1].trim();
      // Some CalDAV servers (e.g. iCloud) wrap calendar data in CDATA sections.
      // Strip the CDATA markers so ical.js receives plain iCal text.
      const cdataMatch = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      return cdataMatch ? cdataMatch[1] : raw;
    })
    .map((s) =>
      s.replaceAll(/&(#x?[0-9A-Fa-f]+|lt|gt|amp|quot|apos);/g, (match, name) => {
        if (name === 'lt') return '<';
        if (name === 'gt') return '>';
        if (name === 'amp') return '&';
        if (name === 'quot') return '"';
        if (name === 'apos') return "'";
        const decodeCodePoint = (value: number): string => {
          if (Number.isInteger(value) && value >= 0 && value <= 0x10ffff) {
            return String.fromCodePoint(value);
          }
          return match;
        };
        if (name.startsWith('#x')) {
          const value = Number.parseInt(name.slice(2), 16);
          return decodeCodePoint(value);
        }
        if (name.startsWith('#')) {
          const value = Number.parseInt(name.slice(1), 10);
          return decodeCodePoint(value);
        }
        return match;
      }),
    )
    .filter((v) => v.length > 0);
}

export async function fetchFeedEvents(
  feed: ICalFeed,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ParsedEvent[]> {
  const attachCategory = (events: ParsedEvent[]): ParsedEvent[] =>
    feed.category === undefined
      ? events
      : events.map((event) => ({ ...event, category: feed.category }));
  const auth = getBasicAuthHeader(feed);

  if (feed.type === 'caldav') {
    const headers: Record<string, string> = {
      Depth: '1',
    };
    if (auth) headers.Authorization = auth;

    const rangeFilteredCalendars = await fetchCalDavCalendarData(
      feed.url,
      headers,
      rangeStart,
      rangeEnd,
      true,
    );
    let events = rangeFilteredCalendars.flatMap((cal) => parseIcal(cal, rangeStart, rangeEnd));
    if (events.length > 0) return attachCategory(events);

    // Some CalDAV servers omit recurring masters when filtering by time-range.
    // Fall back to an unbounded query and rely on local date filtering.
    const unfilteredCalendars = await fetchCalDavCalendarData(
      feed.url,
      headers,
      rangeStart,
      rangeEnd,
      false,
    );
    events = unfilteredCalendars.flatMap((cal) => parseIcal(cal, rangeStart, rangeEnd));
    return attachCategory(events);
  }

  const headers: HeadersInit = {};
  if (auth) headers.Authorization = auth;
  const res = await fetch(feed.url, { headers });
  if (!res.ok) {
    throw formatFetchError('ICS fetch failed', res.status, await res.text());
  }
  const text = await res.text();
  return attachCategory(parseIcal(text, rangeStart, rangeEnd));
}

/** Maximum RRULE expansion iterations — prevents infinite loops on malformed data. */
const MAX_RRULE_ITER = 5000;

/** Format an ICAL.Time as ISO 8601: YYYY-MM-DD for all-day events, UTC ISO string for timed. */
function formatIcalTime(t: {
  isDate: boolean;
  toJSDate(): Date;
  year?: number;
  month?: number;
  day?: number;
}): string {
  if (t.isDate) {
    // For DATE values, use ICAL calendar fields directly to avoid timezone
    // conversion shifting the event by a day in non-UTC environments.
    if (typeof t.year === 'number' && typeof t.month === 'number' && typeof t.day === 'number') {
      const y = t.year;
      const m = String(t.month).padStart(2, '0');
      const d = String(t.day).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const js = t.toJSDate();
    const y = js.getUTCFullYear();
    const m = String(js.getUTCMonth() + 1).padStart(2, '0');
    const d = String(js.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return t.toJSDate().toISOString();
}

/**
 * Parse raw iCal text and return events overlapping with the given UTC date range.
 * Uses ical.js for robust RFC 5545 support including RRULE, EXDATE, and VTIMEZONE.
 */
export function parseIcal(text: string, rangeStart: Date, rangeEnd: Date): ParsedEvent[] {
  const results: ParsedEvent[] = [];
  let jcalData;
  try {
    jcalData = ICAL.parse(text);
  } catch {
    return [];
  }

  const calendar = new ICAL.Component(jcalData);
  const rangeStartICAL = ICAL.Time.fromJSDate(rangeStart, true);
  const rangeEndICAL = ICAL.Time.fromJSDate(rangeEnd, true);

  for (const vevent of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;

    const summary = event.summary || '(No title)';
    const description = event.description?.trim();
    const allDay = event.startDate.isDate;
    const recurring = event.isRecurring();

    const makeEvent = (
      startTime: { isDate: boolean; toJSDate(): Date },
      endTime: { isDate: boolean; toJSDate(): Date },
    ): ParsedEvent => {
      const start = formatIcalTime(startTime);
      const end = formatIcalTime(endTime);
      return {
        name: summary,
        ...(description ? { description } : {}),
        start,
        end: end !== start ? end : undefined,
        allDay,
        ...(recurring ? { recurring } : {}),
      };
    };

    if (recurring) {
      const iter = event.iterator();
      let startTime;
      let count = 0;
      while (count < MAX_RRULE_ITER && (startTime = iter.next()) != null) {
        count++;
        if (startTime.compare(rangeEndICAL) > 0) break;
        if (startTime.compare(rangeStartICAL) >= 0) {
          const details = event.getOccurrenceDetails(startTime);
          results.push(makeEvent(details.startDate, details.endDate));
        }
      }
    } else {
      const startDate = event.startDate;
      const endDate = event.endDate;
      // Emit the event only when it overlaps with the requested range
      if (startDate.compare(rangeEndICAL) <= 0 && endDate.compare(rangeStartICAL) >= 0) {
        results.push(makeEvent(startDate, endDate));
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Open-Meteo weather forecast
// ---------------------------------------------------------------------------

export interface WeatherDayForecast {
  date: string;
  weatherCode: number;
  tempMinC: number;
  tempMaxC: number;
  sunrise: string;
  sunset: string;
  precipitationSumMm: number;
  precipitationProbabilityMax: number;
}

interface OpenMeteoDaily {
  time?: string[];
  weather_code?: number[];
  temperature_2m_min?: number[];
  temperature_2m_max?: number[];
  sunrise?: string[];
  sunset?: string[];
  precipitation_sum?: number[];
  precipitation_probability_max?: number[];
}

interface OpenMeteoForecastResponse {
  daily?: OpenMeteoDaily;
}

export function parseOpenMeteoDaily(daily: OpenMeteoDaily): WeatherDayForecast[] {
  const dates = daily.time ?? [];
  const weatherCodes = daily.weather_code ?? [];
  const minTemps = daily.temperature_2m_min ?? [];
  const maxTemps = daily.temperature_2m_max ?? [];
  const sunrises = daily.sunrise ?? [];
  const sunsets = daily.sunset ?? [];
  const precipitationSums = daily.precipitation_sum ?? [];
  const precipitationProbabilities = daily.precipitation_probability_max ?? [];

  return dates.flatMap((date, idx): WeatherDayForecast[] => {
    const weatherCode = weatherCodes[idx];
    const tempMinC = minTemps[idx];
    const tempMaxC = maxTemps[idx];
    const sunrise = sunrises[idx];
    const sunset = sunsets[idx];
    const precipitationSumMm = precipitationSums[idx];
    const precipitationProbabilityMax = precipitationProbabilities[idx] ?? 0;

    if (
      typeof weatherCode !== 'number' ||
      typeof tempMinC !== 'number' ||
      typeof tempMaxC !== 'number' ||
      typeof sunrise !== 'string' ||
      typeof sunset !== 'string' ||
      typeof precipitationSumMm !== 'number'
    ) {
      return [];
    }

    return [
      {
        date,
        weatherCode,
        tempMinC,
        tempMaxC,
        sunrise,
        sunset,
        precipitationSumMm,
        precipitationProbabilityMax,
      },
    ];
  });
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function clampWeatherForecastRange(
  fromDate: string,
  toDate: string,
  today = new Date(),
): { fromDate: string; toDate: string } | null {
  const minForecastDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  minForecastDate.setUTCMonth(minForecastDate.getUTCMonth() - 2);
  const minForecastDateStr = formatUtcDate(minForecastDate);

  const maxForecastDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  maxForecastDate.setUTCDate(maxForecastDate.getUTCDate() + OPEN_METEO_MAX_FORECAST_DAYS - 1);
  const maxForecastDateStr = formatUtcDate(maxForecastDate);

  if (toDate < minForecastDateStr || fromDate > maxForecastDateStr) return null;

  const clampedFromDate = fromDate < minForecastDateStr ? minForecastDateStr : fromDate;

  return {
    fromDate: clampedFromDate,
    toDate: toDate > maxForecastDateStr ? maxForecastDateStr : toDate,
  };
}

async function fetchWeatherForecast(
  config: WeatherConfig,
  fromDate: string,
  toDate: string,
): Promise<WeatherDayForecast[]> {
  const clampedRange = clampWeatherForecastRange(fromDate, toDate);
  if (!clampedRange) return [];

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(config.latitude));
  url.searchParams.set('longitude', String(config.longitude));
  url.searchParams.set('timezone', config.timezone);
  url.searchParams.set('start_date', clampedRange.fromDate);
  url.searchParams.set('end_date', clampedRange.toDate);
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_min',
      'temperature_2m_max',
      'sunrise',
      'sunset',
      'precipitation_sum',
      'precipitation_probability_max',
    ].join(','),
  );

  const res = await fetch(url);
  if (!res.ok) {
    let body = '';
    try {
      body = (await res.text()).trim();
    } catch {
      body = '';
    }
    const suffix = body ? `; ${body.slice(0, MAX_ERROR_RESPONSE_LENGTH)}` : '';
    throw new Error(`Weather API fetch failed: HTTP ${res.status}${suffix}`);
  }

  const payload = (await res.json()) as OpenMeteoForecastResponse;
  return parseOpenMeteoDaily(payload.daily ?? {});
}

// ---------------------------------------------------------------------------
// Calendar events HTTP handler
// ---------------------------------------------------------------------------

async function handleCalendarEvents(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  if (!fromParam || !toParam) {
    return new Response(JSON.stringify({ error: 'Missing from or to parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse date range — treat as UTC day boundaries
  const rangeStart = new Date(`${fromParam}T00:00:00Z`);
  const rangeEnd = new Date(`${toParam}T23:59:59Z`);

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return new Response(JSON.stringify({ error: 'Invalid date format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const feeds = loadICalFeeds();
  const allEvents: ParsedEvent[] = [];
  const errors: CalendarFeedError[] = [];

  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const events = await fetchFeedEvents(feed, rangeStart, rangeEnd);
        allEvents.push(...events);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ feed: feed.name, message });
        console.error(`Error fetching calendar feed "${feed.name}":`, err);
      }
    }),
  );

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  return new Response(JSON.stringify({ events: allEvents, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleWeatherForecast(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  if (!fromParam || !toParam) {
    return new Response(JSON.stringify({ error: 'Missing from or to parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rangeStart = new Date(`${fromParam}T00:00:00Z`);
  const rangeEnd = new Date(`${toParam}T23:59:59Z`);
  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return new Response(JSON.stringify({ error: 'Invalid date format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const weather = loadWeatherConfig();
  if (!weather) {
    return new Response(JSON.stringify({ days: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const days = await fetchWeatherForecast(weather, fromParam, toParam);
    return new Response(JSON.stringify({ days }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Weather forecast fetch failed:', err);
    return new Response(
      JSON.stringify({
        error:
          'Unable to fetch weather forecast from Open-Meteo right now. Check network and weather settings, then try again later.',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

interface YearInFoodProgress {
  completed: number;
  total: number;
  label: string;
}

type YearInFoodProgressReporter = (progress: YearInFoodProgress) => void;

type YearInFoodMealPlanSource = 'meal-assistant-cache' | 'tandoor-api';

interface YearInFoodMealPlanResult {
  mealPlans: MealPlan[];
  source: YearInFoodMealPlanSource;
}

function reportYearInFoodProgress(
  report: YearInFoodProgressReporter | undefined,
  completed: number,
  total: number,
  label: string,
): void {
  report?.({ completed, total, label });
}

async function readMealAssistantPrecalculation(): Promise<MealAssistantPrecalculation | null> {
  try {
    const body = await Deno.readTextFile(loadMealAssistantPrecalculationPath());
    const payload: unknown = JSON.parse(body);
    return isMealAssistantPrecalculation(payload) ? payload : null;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound || err instanceof SyntaxError) return null;
    throw err;
  }
}

function mealAssistantDinnerMealTypeId(
  precalculation: MealAssistantPrecalculation,
): string | undefined {
  return precalculation.mealTypes
    .find((mealType) => mealType.name?.trim().toLowerCase() === 'dinner')
    ?.id.toString();
}

function mealAssistantMealPlansForYear(
  precalculation: MealAssistantPrecalculation,
  year: number,
  toDate: string,
): MealPlan[] {
  const dinnerMealTypeId = mealAssistantDinnerMealTypeId(precalculation);
  if (!dinnerMealTypeId) return [];
  const dinnerHistory = precalculation.recipeHistoryByMealType[dinnerMealTypeId];
  if (!dinnerHistory) return [];

  const fromDate = `${year - 1}-01-01`;
  let id = 1;
  return Object.entries(dinnerHistory).flatMap(([recipeId, history]) =>
    history.dates.flatMap((dayNumber): MealPlan[] => {
      const date = mealAssistantDayNumberToDate(dayNumber);
      if (date < fromDate || date > toDate) return [];
      return [
        {
          id: id++,
          recipe: Number.parseInt(recipeId, 10),
          meal_type: { id: Number.parseInt(dinnerMealTypeId, 10), name: 'Dinner' },
          from_date: date,
        },
      ];
    }),
  );
}

async function fetchYearInFoodMealPlans(
  year: number,
  toDate: string,
  precalculation: MealAssistantPrecalculation | null,
  report?: YearInFoodProgressReporter,
): Promise<YearInFoodMealPlanResult> {
  reportYearInFoodProgress(
    report,
    0,
    1,
    'Fetching dinner meal-plan history and serving counts from Tandoor',
  );
  try {
    const mealPlans = await fetchAllTandoorPages<MealPlan>('/meal-plan/', {
      from_date: `${year - 1}-01-01`,
      to_date: toDate,
    });
    reportYearInFoodProgress(
      report,
      1,
      1,
      'Fetched dinner meal-plan history and serving counts from Tandoor',
    );
    return { mealPlans, source: 'tandoor-api' };
  } catch (err) {
    if (!precalculation) throw err;
    console.warn(
      'Unable to fetch meal plans for year-in-food summary; falling back to serving-less meal assistant history.',
      err,
    );
  }

  const mealPlans = mealAssistantMealPlansForYear(precalculation, year, toDate);
  reportYearInFoodProgress(
    report,
    mealPlans.length,
    mealPlans.length,
    'Loaded dinner history from the meal assistant cache without meal-plan serving counts',
  );
  return { mealPlans, source: 'meal-assistant-cache' };
}

function cachedDateRecord<T>(
  dates: Record<string, T>,
  fromDate: string,
  toDate: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(dates).filter(([date]) => date >= fromDate && date <= toDate),
  );
}

async function fetchYearInFoodRecipes(
  mealPlans: MealPlan[],
  report?: YearInFoodProgressReporter,
): Promise<Recipe[]> {
  const recipeIds = [
    ...new Set(
      mealPlans.flatMap((mealPlan) => {
        if (typeof mealPlan.recipe === 'object' && mealPlan.recipe !== null)
          return [mealPlan.recipe.id];
        if (typeof mealPlan.recipe === 'number') return [mealPlan.recipe];
        return [];
      }),
    ),
  ];

  let completed = 0;
  reportYearInFoodProgress(report, completed, recipeIds.length, 'Fetching recipe details');
  return mapWithConcurrency(recipeIds, 5, async (id) => {
    const recipe = await fetchTandoorJson<Recipe>(`/recipe/${id}/`);
    completed += 1;
    reportYearInFoodProgress(report, completed, recipeIds.length, 'Fetching recipe details');
    return recipe;
  });
}

async function buildYearInFoodSummaryForRequest(
  year: number,
  report?: YearInFoodProgressReporter,
): Promise<YearInFoodSummary> {
  const today = new Date();
  const currentYear = today.getFullYear();
  const fromDate = `${year}-01-01`;
  const toDate = year === currentYear ? today.toISOString().slice(0, 10) : `${year}-12-31`;

  reportYearInFoodProgress(report, 0, 1, 'Reading meal assistant, weather, and calendar caches');
  const [precalculation, weatherCache, calendarCache] = await Promise.all([
    readMealAssistantPrecalculation(),
    readWeatherFeatureCache(),
    readCalendarFeatureCache(),
  ]);
  reportYearInFoodProgress(report, 1, 1, 'Read meal assistant, weather, and calendar caches');

  const { mealPlans, source } = await fetchYearInFoodMealPlans(
    year,
    toDate,
    precalculation,
    report,
  );
  const recipeDetailsPromise = fetchYearInFoodRecipes(mealPlans, report);
  const cookLogsPromise = fetchAllTandoorPages<CookLog>('/cook-log/', {
    created_at__gte: fromDate,
    created_at__lte: `${toDate}T23:59:59`,
  }).catch((err) => {
    console.warn(
      'Unable to fetch cook logs for year-in-food summary; continuing without ratings.',
      err,
    );
    return [] as CookLog[];
  });
  const keywordsPromise = fetchAllTandoorPages<Keyword>('/keyword/').catch((err) => {
    console.warn(
      'Unable to fetch keywords for year-in-food summary; continuing with recipe keyword names only.',
      err,
    );
    return [] as Keyword[];
  });
  const produceCategoryName = safeGetEnv('MEAL_ASSISTANT_PRODUCE_CATEGORY') ?? '';
  const produceFoodsPromise = produceCategoryName
    ? fetchMealAssistantProduceFoods(produceCategoryName).catch((err) => {
        console.warn(
          'Unable to fetch produce foods for year-in-food summary; continuing with gram-measured ingredients.',
          err,
        );
        return [] as Array<Pick<Food, 'id' | 'name'>>;
      })
    : Promise.resolve([] as Array<Pick<Food, 'id' | 'name'>>);

  reportYearInFoodProgress(report, 0, 3, 'Fetching ratings, keywords, and produce category data');
  const [recipes, cookLogs, keywords, produceFoods] = await Promise.all([
    recipeDetailsPromise,
    cookLogsPromise,
    keywordsPromise,
    produceFoodsPromise,
  ]);
  reportYearInFoodProgress(report, 3, 3, 'Fetched ratings, keywords, and produce category data');

  const summary = buildYearInFoodSummary({
    year,
    mealPlans,
    recipes,
    cookLogs,
    keywords,
    produceCategoryName,
    produceFoods,
    weatherFeaturesByDate: cachedDateRecord(weatherCache.dates, fromDate, toDate),
    calendarFeaturesByDate: cachedDateRecord(calendarCache.dates, fromDate, toDate),
    toDate,
  });

  return {
    ...summary,
    limitations: [
      ...summary.limitations,
      source === 'meal-assistant-cache'
        ? 'Dinner history came from the meal assistant cache because live Tandoor meal-plan queries failed; meal-plan serving counts were unavailable, so household totals assume each plan used the recipe serving count.'
        : 'Dinner history and meal-plan serving counts came from live Tandoor meal-plan queries; weather and calendar signals came from local caches.',
    ],
  };
}

function parseYearInFoodYear(req: Request): { year?: number; response?: Response } {
  const url = new URL(req.url);
  const year = Number.parseInt(url.searchParams.get('year') ?? '', 10);
  const validationError = validateYearInFoodYear(year);
  if (!validationError) return { year };
  return {
    response: new Response(JSON.stringify({ error: validationError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }),
  };
}

async function handleYearInFoodSummary(req: Request): Promise<Response> {
  const parsed = parseYearInFoodYear(req);
  if (parsed.response) return parsed.response;

  try {
    const summary = await buildYearInFoodSummaryForRequest(parsed.year!);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Year-in-food summary failed:', err);
    return new Response(
      JSON.stringify({ error: 'Unable to build the year-in-food summary right now.' }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  }
}

function encodeYearInFoodEvent(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function handleYearInFoodSummaryStream(req: Request): Response {
  const parsed = parseYearInFoodYear(req);
  if (parsed.response) return parsed.response;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const summary = await buildYearInFoodSummaryForRequest(parsed.year!, (progress) => {
          controller.enqueue(encodeYearInFoodEvent({ type: 'progress', progress }));
        });
        controller.enqueue(encodeYearInFoodEvent({ type: 'complete', summary }));
      } catch (err) {
        console.error('Year-in-food summary stream failed:', err);
        controller.enqueue(
          encodeYearInFoodEvent({
            type: 'error',
            error: 'Unable to build the year-in-food summary right now.',
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// Siri meal-plan text endpoint
// ---------------------------------------------------------------------------

const SIRI_BREAKFAST_CUTOFF_HOUR = 11;
const SIRI_DINNER_ONLY_CUTOFF_HOUR = 14;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeMealTypeName(value: string): string {
  return value.trim().toLowerCase();
}

function titleCaseMealType(value: string): string {
  const normalized = value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMealPlanMealTypeName(mealPlan: MealPlan): string | null {
  return typeof mealPlan.meal_type === 'object' && mealPlan.meal_type !== null
    ? mealPlan.meal_type.name
    : null;
}

function getMealPlanRecipeName(mealPlan: MealPlan): string | null {
  return typeof mealPlan.recipe === 'object' && mealPlan.recipe !== null
    ? mealPlan.recipe.name
    : null;
}

function getMealPlanSpokenLabel(mealPlan: MealPlan): string | null {
  const recipeName = getMealPlanRecipeName(mealPlan)?.trim();
  const note = mealPlan.note?.trim();

  if (recipeName && note) return `${recipeName}, ${note}`;
  if (recipeName) return recipeName;
  if (note) return note;
  return null;
}

function joinSpokenList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function shouldIncludeSiriMealPlan(mealPlan: MealPlan, today: Date): boolean {
  const mealTypeName = normalizeMealTypeName(getMealPlanMealTypeName(mealPlan) ?? '');

  if (today.getHours() >= SIRI_DINNER_ONLY_CUTOFF_HOUR) {
    return mealTypeName === 'dinner';
  }

  if (today.getHours() >= SIRI_BREAKFAST_CUTOFF_HOUR) {
    return mealTypeName !== 'breakfast';
  }

  return true;
}

export function formatSiriMealPlanText(mealPlans: MealPlan[], today = new Date()): string {
  const todayStr = formatLocalDate(today);
  const mealsByType = new Map<string, string[]>();

  for (const mealPlan of mealPlans) {
    if (
      mealPlan.from_date.split('T')[0] !== todayStr ||
      !shouldIncludeSiriMealPlan(mealPlan, today)
    ) {
      continue;
    }

    const mealTypeName = getMealPlanMealTypeName(mealPlan)?.trim();
    const spokenLabel = getMealPlanSpokenLabel(mealPlan);
    if (!mealTypeName || !spokenLabel) continue;

    const mealTypeLabel = titleCaseMealType(mealTypeName);
    const existing = mealsByType.get(mealTypeLabel) ?? [];
    existing.push(spokenLabel);
    mealsByType.set(mealTypeLabel, existing);
  }

  const mealSummaries = Array.from(
    mealsByType,
    ([mealTypeLabel, items]) => `${mealTypeLabel} is ${joinSpokenList(items)}`,
  );

  if (mealSummaries.length === 0) {
    return 'There is nothing planned for today.';
  }

  return `${joinSpokenList(mealSummaries)}.`;
}

export async function handleSiriMealPlan(
  req: Request,
  tandoorUrl = safeGetEnv('TANDOOR_URL') ?? 'http://tandoor:8080',
  today = new Date(),
): Promise<Response> {
  const todayStr = formatLocalDate(today);

  try {
    const mealPlans = await fetchAllTandoorPages<MealPlan>(
      '/meal-plan/',
      { from_date: todayStr, to_date: todayStr },
      tandoorUrl,
    );
    return new Response(formatSiriMealPlanText(mealPlans, today), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Siri meal-plan fetch failed:', err);
    return new Response('Unable to fetch the meal plan right now.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ---------------------------------------------------------------------------
// Shopping list "add item" endpoint
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WebSocket broadcast server – client registry (declared here so that
// handleAddToShoppingList can reference broadcastToAllClients as its default)
// ---------------------------------------------------------------------------

const clients = new Set<WebSocket>();

/** Send a raw message string to every currently-open WebSocket client. */
export function broadcastToAllClients(message: string): void {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        clients.delete(client);
      }
    }
  }
}

/**
 * Handle POST /add-to-shopping-list.
 *
 * Expects JSON body: { "item": "<item name>" }
 * Requires an `Authorization: ****** header; the token is
 * passed directly to Tandoor API calls so callers (e.g. Siri shortcuts) supply
 * their own Tandoor API token rather than a separately configured write token.
 *
 * The tandoorUrl parameter defaults to its environment-variable value but can
 * be overridden in tests.  The notifyClients callback is called on success to
 * push a shopping-list invalidation to all connected WebSocket clients; it can
 * be replaced in tests to observe or suppress the broadcast.
 */
export async function handleAddToShoppingList(
  req: Request,
  tandoorUrl = safeGetEnv('TANDOOR_URL') ?? 'http://tandoor:8080',
  notifyClients: () => void = () =>
    broadcastToAllClients(JSON.stringify({ type: 'invalidate', queryKey: 'shopping-list' })),
): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.slice('Bearer '.length);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const item = body.item;
  if (typeof item !== 'string' || item.trim().length === 0) {
    return new Response(
      JSON.stringify({
        error: 'item field is required and must be a non-empty string',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const itemName = item.trim();
  const tandoorHeaders = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  try {
    const ingredientParserRes = await fetch(tandoorUrl + '/api/ingredient-parser/post/', {
      method: 'POST',
      headers: tandoorHeaders,
      body: JSON.stringify({ ingredient: itemName }),
    });
    if (!ingredientParserRes.ok) {
      throw new TandoorUpstreamError(
        formatFetchError(
          'Ingredient parse failed',
          ingredientParserRes.status,
          await ingredientParserRes.text(),
        ).message,
      );
    }

    const ingredientParserData = (await ingredientParserRes.json()) as {
      ingredient?: {
        food?: { id: number; name: string };
        unit?: { id: number; name: string; plural_name?: string | null } | null;
        amount?: number;
        note?: string;
      };
    };
    const parsedIngredient = ingredientParserData.ingredient;
    const parsedFood = parsedIngredient?.food;
    if (!parsedFood?.id || typeof parsedFood.name !== 'string' || parsedFood.name.length === 0) {
      throw new TandoorUpstreamError('Ingredient parse failed: missing parsed food');
    }

    const parsedAmount =
      typeof parsedIngredient?.amount === 'number' && Number.isFinite(parsedIngredient.amount)
        ? parsedIngredient.amount
        : 1;
    const parsedUnit = parsedIngredient?.unit ?? null;
    const parsedNote = typeof parsedIngredient?.note === 'string' ? parsedIngredient.note : '';

    const entryRes = await fetch(tandoorUrl + '/api/shopping-list-entry/', {
      method: 'POST',
      headers: tandoorHeaders,
      body: JSON.stringify({
        food: { id: parsedFood.id, name: parsedFood.name },
        amount: parsedAmount,
        unit: parsedUnit,
        note: parsedNote,
      }),
    });
    if (!entryRes.ok) {
      throw new TandoorUpstreamError(
        formatFetchError(
          'Shopping list entry creation failed',
          entryRes.status,
          await entryRes.text(),
        ).message,
      );
    }

    notifyClients();
    return new Response(JSON.stringify({ success: true, item: itemName }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Add to shopping list error:', err);
    const details =
      err instanceof TandoorUpstreamError ? err.message : 'Unexpected error while calling Tandoor';
    return new Response(JSON.stringify({ error: 'Failed to add item to shopping list', details }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket broadcast server
// ---------------------------------------------------------------------------

function handleInvalidationWebSocket(req: Request): Response {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Not found', { status: 404 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    clients.add(socket);
    try {
      socket.send(JSON.stringify({ type: 'version', version: VERSION }));
    } catch {
      // ignore send errors on newly opened socket
    }
  };

  socket.onclose = () => {
    clients.delete(socket);
  };

  socket.onmessage = (e: MessageEvent) => {
    for (const client of clients) {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        try {
          client.send(e.data);
        } catch {
          // remove clients that fail to receive messages
          clients.delete(client);
        }
      }
    }
  };

  return response;
}

export function createServerApp(): Hono {
  const app = new Hono();

  app.get('/calendar-events', (c) => handleCalendarEvents(c.req.raw));
  app.get('/weather-forecast', (c) => handleWeatherForecast(c.req.raw));
  app.get('/siri-meal-plan', (c) => handleSiriMealPlan(c.req.raw));
  app.get('/whats-cooking', (c) => handleSiriMealPlan(c.req.raw));
  app.post('/add-to-shopping-list', (c) => handleAddToShoppingList(c.req.raw));
  app.get('/meal-assistant-precalculation.json', () => handleMealAssistantPrecalculation());
  app.get('/meal-assistant-status.json', () => handleMealAssistantStatus());
  app.post('/meal-assistant-precalculation/run', () => handleForceMealAssistantPrecalculation());
  app.get('/year-in-food-summary', (c) => handleYearInFoodSummary(c.req.raw));
  app.get('/year-in-food-summary/stream', (c) => handleYearInFoodSummaryStream(c.req.raw));
  app.get('/ws', (c) => handleInvalidationWebSocket(c.req.raw));

  return app;
}

export function startServer(): void {
  startMealAssistantPrecalculationTask();
  Deno.serve({ port: 8098, hostname: '127.0.0.1' }, createServerApp().fetch);
}

if (import.meta.main) {
  startServer();
}
