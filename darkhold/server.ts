import ICAL from 'npm:ical.js@2';
import { DAVNamespaceShort, calendarQuery } from 'npm:tsdav@2.2.1';
import pkg from './package.json' with { type: 'json' };

const VERSION = pkg.version;

// ---------------------------------------------------------------------------
// iCal feed configuration
// ---------------------------------------------------------------------------

interface ICalFeed {
  name: string;
  url: string;
  type?: 'ics' | 'caldav';
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

      const username = record.username == null ? undefined : record.username;
      if (username !== undefined && typeof username !== 'string') return [];

      const password = record.password == null ? undefined : record.password;
      if (password !== undefined && typeof password !== 'string') return [];
      if (
        (username !== undefined && password === undefined) ||
        (username === undefined && password !== undefined)
      ) return [];

      const feed: ICalFeed = {
        name: record.name,
        url: record.url,
      };
      if (type !== undefined) feed.type = type;
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
  let responses;
  try {
    responses = await calendarQuery({
      url,
      props: {
        [`${DAVNamespaceShort.CALDAV}:calendar-data`]: {},
      },
      filters: buildCalDavFilters(rangeStart, rangeEnd, withTimeRange),
      depth: '1',
      headers,
      fetch: globalThis.fetch,
    });
  } catch (err) {
    if (err instanceof Error) {
      const match = err.message.match(/Collection query failed:\s*(\d{3})(?:\s*\.\s*Raw response:\s*([\s\S]*))?/);
      if (match) {
        throw formatFetchError('CalDAV REPORT failed', Number.parseInt(match[1], 10), match[2] ?? '');
      }
    }
    throw err;
  }

  const failed = responses.find((r) => !r.ok);
  if (failed) {
    throw formatFetchError(
      'CalDAV REPORT failed',
      failed.status,
      typeof failed.raw === 'string' ? failed.raw : '',
    );
  }

  return responses.map((r) => getCalDavPayload(r)).filter((v): v is string => Boolean(v && v.trim()));
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
    .map((s) => s.replaceAll(/&(#x?[0-9A-Fa-f]+|lt|gt|amp|quot|apos);/g, (match, name) => {
      if (name === 'lt') return '<';
      if (name === 'gt') return '>';
      if (name === 'amp') return '&';
      if (name === 'quot') return '"';
      if (name === 'apos') return "'";
      const decodeCodePoint = (value: number): string => {
        if (Number.isInteger(value) && value >= 0 && value <= 0x10FFFF) {
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
    }))
    .filter((v) => v.length > 0);
}

export async function fetchFeedEvents(
  feed: ICalFeed,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ParsedEvent[]> {
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
    if (events.length > 0) return events;

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
    return events;
  }

  const headers: HeadersInit = {};
  if (auth) headers.Authorization = auth;
  const res = await fetch(feed.url, { headers });
  if (!res.ok) {
    throw formatFetchError('ICS fetch failed', res.status, await res.text());
  }
  const text = await res.text();
  return parseIcal(text, rangeStart, rangeEnd);
}

/** Maximum RRULE expansion iterations — prevents infinite loops on malformed data. */
const MAX_RRULE_ITER = 5000;

/** Format an ICAL.Time as ISO 8601: YYYY-MM-DD for all-day events, UTC ISO string for timed. */
function formatIcalTime(
  t: { isDate: boolean; toJSDate(): Date; year?: number; month?: number; day?: number },
): string {
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
export function parseIcal(
  text: string,
  rangeStart: Date,
  rangeEnd: Date,
): ParsedEvent[] {
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
    ) return [];

    return [{
      date,
      weatherCode,
      tempMinC,
      tempMaxC,
      sunrise,
      sunset,
      precipitationSumMm,
      precipitationProbabilityMax,
    }];
  });
}

async function fetchWeatherForecast(
  config: WeatherConfig,
  fromDate: string,
  toDate: string,
): Promise<WeatherDayForecast[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
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

  const payload = await res.json() as OpenMeteoForecastResponse;
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
    return new Response(JSON.stringify({
      error: 'Unable to fetch weather forecast from Open-Meteo right now. Check network and weather settings, then try again later.',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket broadcast server
// ---------------------------------------------------------------------------

const clients = new Set<WebSocket>();

export function sanitizeWebSocketUpgradeRequest(req: Request): Request {
  const wsHeaders = new Headers(req.headers);
  wsHeaders.delete("sec-websocket-extensions");
  return new Request(req, { headers: wsHeaders });
}

Deno.serve({ port: 8098, hostname: "127.0.0.1" }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === '/calendar-events' && req.method === 'GET') {
    return handleCalendarEvents(req);
  }
  if (url.pathname === '/weather-forecast' && req.method === 'GET') {
    return handleWeatherForecast(req);
  }

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Not found", { status: 404 });
  }

  // Avoid websocket extension negotiation for compatibility with emulated ARM
  // runtimes used in CI, where extension handling can crash the Deno process.
  const wsReq = sanitizeWebSocketUpgradeRequest(req);

  const { socket, response } = Deno.upgradeWebSocket(wsReq);

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
