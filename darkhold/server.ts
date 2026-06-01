import ICAL from 'npm:ical.js@2';
import { calendarQuery } from './node_modules/tsdav/dist/tsdav.js';
import type { DAVResponse } from './node_modules/tsdav/dist/tsdav.d.ts';
import pkg from './package.json' with { type: 'json' };

const VERSION = pkg.version;

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
export function parseICalFeeds(raw: string): ICalFeed[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((f): ICalFeed[] => {
      if (typeof f !== 'object' || f === null) return [];
      const record = f as Record<string, unknown>;
      if (typeof record.name !== 'string' || typeof record.url !== 'string') return [];

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
      )
        return [];

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
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events */
  start: string;
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events; undefined when same as start */
  end?: string;
  allDay: boolean;
  category?: 'appointment' | 'bank-holiday' | 'context';
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
  if (feed.username === undefined || feed.password === undefined) return undefined;
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
    const allDay = event.startDate.isDate;

    const makeEvent = (
      startTime: { isDate: boolean; toJSDate(): Date },
      endTime: { isDate: boolean; toJSDate(): Date },
    ): ParsedEvent => {
      const start = formatIcalTime(startTime);
      const end = formatIcalTime(endTime);
      return { name: summary, start, end: end !== start ? end : undefined, allDay };
    };

    if (event.isRecurring()) {
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
    const precipitationProbabilityMax = precipitationProbabilities[idx];

    if (
      typeof weatherCode !== 'number' ||
      typeof tempMinC !== 'number' ||
      typeof tempMaxC !== 'number' ||
      typeof sunrise !== 'string' ||
      typeof sunset !== 'string' ||
      typeof precipitationSumMm !== 'number' ||
      typeof precipitationProbabilityMax !== 'number'
    )
      return [];

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

// ---------------------------------------------------------------------------
// Shopping list "add item" endpoint
// ---------------------------------------------------------------------------

/**
 * Find a food entry in Tandoor by name (exact case-insensitive match), or
 * create a new one if no exact match exists.  Returns the food item's ID.
 */
export async function findOrCreateFood(
  tandoorUrl: string,
  token: string,
  name: string,
): Promise<number> {
  const searchUrl = tandoorUrl + '/api/food/?query=' + encodeURIComponent(name) + '&page_size=10';
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const searchRes = await fetch(searchUrl, { headers });
  if (!searchRes.ok) {
    throw new Error('Food search failed: HTTP ' + searchRes.status);
  }
  const searchData = (await searchRes.json()) as { results?: Array<{ id: number; name: string }> };
  const results = searchData.results ?? [];

  // Prefer an exact case-insensitive match so repeated Siri requests reuse the same food entry.
  const lower = name.toLowerCase();
  const exact = results.find((f) => f.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // Create a new food entry with the given name.
  const createRes = await fetch(tandoorUrl + '/api/food/', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  if (!createRes.ok) {
    throw new Error('Food creation failed: HTTP ' + createRes.status);
  }
  const created = (await createRes.json()) as { id: number };
  return created.id;
}

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
  tandoorUrl = Deno.env.get('TANDOOR_URL') ?? 'http://tandoor:8080',
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
      JSON.stringify({ error: 'item field is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const itemName = item.trim();
  const tandoorHeaders = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  try {
    const foodId = await findOrCreateFood(tandoorUrl, token, itemName);

    const entryRes = await fetch(tandoorUrl + '/api/shopping-list-entry/', {
      method: 'POST',
      headers: tandoorHeaders,
      body: JSON.stringify({ food: { id: foodId }, amount: 1, unit: null, checked: false }),
    });
    if (!entryRes.ok) {
      throw new Error('Shopping list entry creation failed: HTTP ' + entryRes.status);
    }

    notifyClients();
    return new Response(JSON.stringify({ success: true, item: itemName }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Add to shopping list error:', err);
    return new Response(JSON.stringify({ error: 'Failed to add item to shopping list' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket broadcast server
// ---------------------------------------------------------------------------

Deno.serve({ port: 8098, hostname: '127.0.0.1' }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === '/calendar-events' && req.method === 'GET') {
    return handleCalendarEvents(req);
  }
  if (url.pathname === '/weather-forecast' && req.method === 'GET') {
    return handleWeatherForecast(req);
  }
  if (url.pathname === '/add-to-shopping-list' && req.method === 'POST') {
    return handleAddToShoppingList(req);
  }

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
});
