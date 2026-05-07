let VERSION: string;
try {
  const pkg = JSON.parse(Deno.readTextFileSync('./package.json')) as { version: string };
  VERSION = pkg.version;
} catch {
  console.error('Failed to read package.json: server requires a valid package.json with a version field');
  Deno.exit(1);
}

// ---------------------------------------------------------------------------
// iCal feed configuration
// ---------------------------------------------------------------------------

interface ICalFeed {
  name: string;
  url: string;
}

function loadICalFeeds(): ICalFeed[] {
  try {
    const raw = Deno.env.get('ICAL_FEEDS') ?? '[]';
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is ICalFeed =>
        typeof f === 'object' && f !== null &&
        typeof (f as Record<string, unknown>).name === 'string' &&
        typeof (f as Record<string, unknown>).url === 'string',
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// iCal parser — self-contained, no external dependencies
// ---------------------------------------------------------------------------

export interface ParsedEvent {
  name: string;
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events */
  start: string;
  /** ISO 8601 UTC timestamp, or YYYY-MM-DD for all-day events; undefined when same as start */
  end?: string;
  allDay: boolean;
}

interface ICalProp {
  value: string;
  params: Record<string, string>;
}

/** Unfold iCal lines (CRLF + leading whitespace → continuation). */
export function unfoldLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((l) => l.length > 0);
}

/** Parse a single iCal content line into name, params, and value. */
export function parseContentLine(line: string): { name: string; prop: ICalProp } | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const nameAndParams = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = nameAndParams.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq !== -1) {
      params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
    }
  }
  return { name, prop: { value, params } };
}

/**
 * Convert a local datetime string (YYYYMMDDTHHMMSS) in the given IANA
 * timezone to a UTC Date, using the Intl.DateTimeFormat ping-pong trick.
 */
export function localToUtc(dtStr: string, tzid: string): Date {
  const y = dtStr.slice(0, 4);
  const mo = dtStr.slice(4, 6);
  const d = dtStr.slice(6, 8);
  const h = dtStr.slice(9, 11);
  const mi = dtStr.slice(11, 13);
  const s = dtStr.slice(13, 15) || '00';

  const approxUtc = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);

  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  function parseFormatted(date: Date): Date {
    const parts = dtf.formatToParts(date);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    // Some locales/environments format midnight as "24:00" rather than "00:00"
    const hour = p.hour === '24' ? '00' : p.hour;
    return new Date(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}Z`);
  }

  const tzTime1 = parseFormatted(approxUtc);
  const offsetMs = approxUtc.getTime() - tzTime1.getTime();
  const corrected = new Date(approxUtc.getTime() + offsetMs);

  // Re-verify to handle DST boundary edge cases
  const tzTime2 = parseFormatted(corrected);
  const diff = approxUtc.getTime() - tzTime2.getTime();
  if (diff !== offsetMs) {
    return new Date(approxUtc.getTime() + diff);
  }
  return corrected;
}

/**
 * Parse an iCal DATE or DATE-TIME value into a JS Date.
 * Returns { date, allDay } where allDay=true for DATE-only values.
 */
export function parseICalDatetime(
  value: string,
  params: Record<string, string>,
): { date: Date; allDay: boolean } {
  const v = value.trim();

  // DATE-only: YYYYMMDD
  if (v.length === 8 && !v.includes('T')) {
    const y = parseInt(v.slice(0, 4), 10);
    const m = parseInt(v.slice(4, 6), 10) - 1;
    const d = parseInt(v.slice(6, 8), 10);
    return { date: new Date(Date.UTC(y, m, d)), allDay: true };
  }

  // VALUE=DATE property parameter
  if (params.VALUE === 'DATE') {
    const y = parseInt(v.slice(0, 4), 10);
    const m = parseInt(v.slice(4, 6), 10) - 1;
    const d = parseInt(v.slice(6, 8), 10);
    return { date: new Date(Date.UTC(y, m, d)), allDay: true };
  }

  // UTC: YYYYMMDDTHHMMSSZ
  if (v.endsWith('Z')) {
    const y = parseInt(v.slice(0, 4), 10);
    const mo = parseInt(v.slice(4, 6), 10) - 1;
    const d = parseInt(v.slice(6, 8), 10);
    const h = parseInt(v.slice(9, 11), 10);
    const mi = parseInt(v.slice(11, 13), 10);
    const s = parseInt(v.slice(13, 15) || '0', 10);
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  }

  // Local time with TZID parameter
  const tzid = params.TZID;
  if (tzid && v.includes('T')) {
    try {
      return { date: localToUtc(v, tzid), allDay: false };
    } catch {
      // Fall through to floating-time handling
    }
  }

  // Floating time (no tz info) — treat as UTC
  const y = parseInt(v.slice(0, 4), 10);
  const mo = parseInt(v.slice(4, 6), 10) - 1;
  const d = parseInt(v.slice(6, 8), 10);
  const h = v.length > 8 ? parseInt(v.slice(9, 11), 10) : 0;
  const mi = v.length > 10 ? parseInt(v.slice(11, 13), 10) : 0;
  const s = v.length > 12 ? parseInt(v.slice(13, 15), 10) : 0;
  return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
}

/** Parse an ISO 8601 duration string (e.g. PT1H, P1D) into milliseconds. */
export function parseDuration(duration: string): number {
  const m = duration.match(
    /^([+-])?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const years = parseInt(m[2] || '0', 10);
  const months = parseInt(m[3] || '0', 10);
  const weeks = parseInt(m[4] || '0', 10);
  const days = parseInt(m[5] || '0', 10);
  const hours = parseInt(m[6] || '0', 10);
  const minutes = parseInt(m[7] || '0', 10);
  const seconds = parseInt(m[8] || '0', 10);
  return (
    sign *
    ((years * 365 + months * 30 + weeks * 7 + days) * 86400000 +
      (hours * 3600 + minutes * 60 + seconds) * 1000)
  );
}

interface RRuleData {
  freq: string;
  interval: number;
  count?: number;
  until?: Date;
  byDay: string[];        // e.g. ['MO','WE'] or ['1MO','-1FR']
  byMonthDay: number[];
  byMonth: number[];
}

/** Maximum RRULE expansion iterations — prevents infinite loops on malformed data. */
const MAX_RRULE_ITER = 5000;

/** Parse an RRULE value string into structured data. */
export function parseRRule(rruleStr: string): RRuleData {
  const map: Record<string, string> = {};
  for (const part of rruleStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1) map[part.slice(0, eq)] = part.slice(eq + 1);
  }
  let until: Date | undefined;
  if (map.UNTIL) {
    try {
      until = parseICalDatetime(map.UNTIL, {}).date;
    } catch {
      until = undefined;
    }
  }
  return {
    freq: (map.FREQ ?? 'DAILY').toUpperCase(),
    interval: map.INTERVAL ? Math.max(1, parseInt(map.INTERVAL, 10)) : 1,
    count: map.COUNT ? parseInt(map.COUNT, 10) : undefined,
    until,
    byDay: map.BYDAY ? map.BYDAY.split(',') : [],
    byMonthDay: map.BYMONTHDAY ? map.BYMONTHDAY.split(',').map(Number) : [],
    byMonth: map.BYMONTH ? map.BYMONTH.split(',').map(Number) : [],
  };
}

const DAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** Advance a Date by one RRULE frequency step (ignoring BYDAY). */
function advanceByFreq(date: Date, rrule: RRuleData): Date {
  const d = new Date(date);
  switch (rrule.freq) {
    case 'SECONDLY': d.setUTCSeconds(d.getUTCSeconds() + rrule.interval); break;
    case 'MINUTELY': d.setUTCMinutes(d.getUTCMinutes() + rrule.interval); break;
    case 'HOURLY':   d.setUTCHours(d.getUTCHours() + rrule.interval); break;
    case 'DAILY':    d.setUTCDate(d.getUTCDate() + rrule.interval); break;
    case 'WEEKLY':   d.setUTCDate(d.getUTCDate() + 7 * rrule.interval); break;
    case 'MONTHLY':  d.setUTCMonth(d.getUTCMonth() + rrule.interval); break;
    case 'YEARLY':   d.setUTCFullYear(d.getUTCFullYear() + rrule.interval); break;
    default:         d.setUTCDate(d.getUTCDate() + rrule.interval);
  }
  return d;
}

/**
 * Expand a recurring event into individual occurrences within [rangeStart, rangeEnd].
 * Returns UTC start timestamps for each matching occurrence.
 */
export function expandRecurring(
  dtstart: Date,
  rrule: RRuleData,
  exdateKeys: Set<string>,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const results: Date[] = [];
  const MAX_ITER = MAX_RRULE_ITER;
  let occurrenceCount = 0;

  // Helper: is this date excluded?
  const isExcluded = (d: Date): boolean => exdateKeys.has(d.toISOString().split('T')[0]);

  // Helper: check if candidate passes BYMONTHDAY / BYMONTH filters (for MONTHLY/YEARLY)
  const passesFilter = (d: Date): boolean => {
    if (rrule.byMonthDay.length > 0 && !rrule.byMonthDay.includes(d.getUTCDate())) return false;
    if (rrule.byMonth.length > 0 && !rrule.byMonth.includes(d.getUTCMonth() + 1)) return false;
    return true;
  };

  if (rrule.freq === 'WEEKLY' && rrule.byDay.length > 0) {
    // Expand each week, generating one occurrence per matching weekday.
    // Parse simple weekday names (e.g. 'MO') – skip positional ones (e.g. '1MO')
    // for WEEKLY context (positional is only meaningful for MONTHLY/YEARLY).
    const targetWeekdays = new Set(
      rrule.byDay
        .filter((d) => /^[A-Z]{2}$/.test(d))
        .map((d) => DAY_NAMES.indexOf(d as (typeof DAY_NAMES)[number]))
        .filter((d) => d >= 0),
    );

    if (targetWeekdays.size === 0) {
      // Fallback: use dtstart's weekday
      targetWeekdays.add(dtstart.getUTCDay());
    }

    // Align to the Sunday of the week containing dtstart
    const weekSunday = new Date(dtstart);
    weekSunday.setUTCDate(dtstart.getUTCDate() - dtstart.getUTCDay());
    weekSunday.setUTCHours(
      dtstart.getUTCHours(),
      dtstart.getUTCMinutes(),
      dtstart.getUTCSeconds(),
      0,
    );

    let iter = 0;
    while (iter < MAX_ITER) {
      iter++;
      // Early termination: entire week is past rangeEnd
      const weekEnd = new Date(weekSunday);
      weekEnd.setUTCDate(weekSunday.getUTCDate() + 6);
      if (weekEnd < rangeStart) {
        weekSunday.setUTCDate(weekSunday.getUTCDate() + 7 * rrule.interval);
        continue;
      }
      if (weekSunday > rangeEnd) break;

      for (const wd of [...targetWeekdays].sort((a, b) => a - b)) {
        const candidate = new Date(weekSunday);
        candidate.setUTCDate(weekSunday.getUTCDate() + wd);

        if (candidate < dtstart) continue;
        occurrenceCount++;
        if (rrule.count !== undefined && occurrenceCount > rrule.count) break;
        if (rrule.until && candidate > rrule.until) break;
        if (candidate > rangeEnd) break;
        if (!isExcluded(candidate) && candidate >= rangeStart) {
          results.push(new Date(candidate));
        }
      }

      if (rrule.count !== undefined && occurrenceCount >= rrule.count) break;
      weekSunday.setUTCDate(weekSunday.getUTCDate() + 7 * rrule.interval);
    }
  } else {
    // Simple linear expansion: DAILY, WEEKLY (no BYDAY), MONTHLY, YEARLY
    // Fast-forward dtstart close to rangeStart to avoid iterating years of history.
    let current = new Date(dtstart);
    if (current < rangeStart) {
      const msPerStep: Record<string, number> = {
        DAILY: 86400000 * rrule.interval,
        WEEKLY: 7 * 86400000 * rrule.interval,
      };
      if (msPerStep[rrule.freq]) {
        const steps = Math.max(
          0,
          Math.floor((rangeStart.getTime() - current.getTime()) / msPerStep[rrule.freq]) - 1,
        );
        if (rrule.freq === 'DAILY') {
          current.setUTCDate(current.getUTCDate() + steps * rrule.interval);
        } else if (rrule.freq === 'WEEKLY') {
          current.setUTCDate(current.getUTCDate() + steps * 7 * rrule.interval);
        }
        occurrenceCount += steps;
        if (rrule.count !== undefined && occurrenceCount >= rrule.count) return results;
      }
    }

    let iter = 0;
    while (iter < MAX_ITER) {
      iter++;
      if (rrule.count !== undefined && occurrenceCount >= rrule.count) break;
      if (rrule.until && current > rrule.until) break;
      if (current > rangeEnd) break;

      occurrenceCount++;
      if (!isExcluded(current) && current >= rangeStart && passesFilter(current)) {
        results.push(new Date(current));
      }

      current = advanceByFreq(current, rrule);
    }
  }

  return results;
}

interface VEventRaw {
  summary: string;
  dtstart?: ICalProp;
  dtend?: ICalProp;
  duration?: string;
  rrule?: string;
  exdates: ICalProp[];
}

/** Parse raw iCal text and return events overlapping with the given UTC date range. */
export function parseIcal(
  text: string,
  rangeStart: Date,
  rangeEnd: Date,
): ParsedEvent[] {
  const lines = unfoldLines(text);
  const results: ParsedEvent[] = [];

  // Simple stack-based component parser
  const stack: string[] = [];
  let current: VEventRaw | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      const comp = line.slice(6).toUpperCase();
      stack.push(comp);
      if (comp === 'VEVENT') {
        current = { summary: '', exdates: [] };
      }
      continue;
    }

    if (line.startsWith('END:')) {
      const comp = line.slice(4).toUpperCase();
      if (comp === 'VEVENT' && current) {
        const eventsFromVEvent = processVEvent(current, rangeStart, rangeEnd);
        results.push(...eventsFromVEvent);
        current = null;
      }
      stack.pop();
      continue;
    }

    if (!current) continue;

    const parsed = parseContentLine(line);
    if (!parsed) continue;
    const { name, prop } = parsed;

    switch (name) {
      case 'SUMMARY':
        current.summary = prop.value;
        break;
      case 'DTSTART':
        current.dtstart = prop;
        break;
      case 'DTEND':
        current.dtend = prop;
        break;
      case 'DURATION':
        current.duration = prop.value;
        break;
      case 'RRULE':
        current.rrule = prop.value;
        break;
      case 'EXDATE':
        current.exdates.push(prop);
        break;
    }
  }

  return results;
}

function processVEvent(
  vevent: VEventRaw,
  rangeStart: Date,
  rangeEnd: Date,
): ParsedEvent[] {
  if (!vevent.dtstart) return [];

  const { date: startDate, allDay } = parseICalDatetime(
    vevent.dtstart.value,
    vevent.dtstart.params,
  );

  // Compute duration in ms
  let durationMs = 0;
  if (vevent.dtend) {
    const { date: endDate } = parseICalDatetime(
      vevent.dtend.value,
      vevent.dtend.params,
    );
    durationMs = endDate.getTime() - startDate.getTime();
  } else if (vevent.duration) {
    durationMs = parseDuration(vevent.duration);
  } else if (allDay) {
    durationMs = 86400000; // Default to 1 day for all-day events
  }

  // Build exdate set: keys are YYYY-MM-DD UTC dates
  const exdateKeys = new Set<string>();
  for (const exProp of vevent.exdates) {
    // EXDATE can be comma-separated list of dates
    for (const val of exProp.value.split(',')) {
      try {
        const { date } = parseICalDatetime(val.trim(), exProp.params);
        exdateKeys.add(date.toISOString().split('T')[0]);
      } catch {
        // ignore malformed EXDATE values
      }
    }
  }

  const formatEvent = (occStart: Date): ParsedEvent => {
    const occEnd = durationMs > 0 ? new Date(occStart.getTime() + durationMs) : undefined;
    if (allDay) {
      const startStr = occStart.toISOString().split('T')[0];
      const endStr = occEnd ? occEnd.toISOString().split('T')[0] : undefined;
      return {
        name: vevent.summary || '(No title)',
        start: startStr,
        end: endStr !== startStr ? endStr : undefined,
        allDay: true,
      };
    }
    return {
      name: vevent.summary || '(No title)',
      start: occStart.toISOString(),
      end: occEnd?.toISOString(),
      allDay: false,
    };
  };

  if (vevent.rrule) {
    const rrule = parseRRule(vevent.rrule);
    const occurrences = expandRecurring(
      startDate,
      rrule,
      exdateKeys,
      rangeStart,
      rangeEnd,
    );
    return occurrences.map(formatEvent);
  }

  // Non-recurring: check if it overlaps with the range
  const eventEnd = durationMs > 0 ? new Date(startDate.getTime() + durationMs) : startDate;
  const inRange = startDate <= rangeEnd && eventEnd >= rangeStart;
  if (!inRange) return [];
  if (exdateKeys.has(startDate.toISOString().split('T')[0])) return [];

  return [formatEvent(startDate)];
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

  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url);
        if (!res.ok) {
          console.error(`Failed to fetch iCal feed "${feed.name}": HTTP ${res.status}`);
          return;
        }
        const text = await res.text();
        const events = parseIcal(text, rangeStart, rangeEnd);
        allEvents.push(...events);
      } catch (err) {
        console.error(`Error fetching iCal feed "${feed.name}":`, err);
      }
    }),
  );

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  return new Response(JSON.stringify({ events: allEvents }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// WebSocket broadcast server
// ---------------------------------------------------------------------------

const clients = new Set<WebSocket>();

Deno.serve({ port: 8098, hostname: "127.0.0.1" }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === '/calendar-events' && req.method === 'GET') {
    return handleCalendarEvents(req);
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Not found", { status: 404 });
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
