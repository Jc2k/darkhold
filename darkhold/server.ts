import ICAL from 'npm:ical.js@2';
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

function loadICalFeeds(): ICalFeed[] {
  try {
    const raw = Deno.env.get('ICAL_FEEDS') ?? '[]';
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((f): ICalFeed[] => {
      if (typeof f !== 'object' || f === null) return [];
      const record = f as Record<string, unknown>;
      if (typeof record.name !== 'string' || typeof record.url !== 'string') return [];

      const type = record.type;
      if (type !== undefined && type !== 'ics' && type !== 'caldav') return [];

      const username = record.username;
      if (username !== undefined && typeof username !== 'string') return [];

      const password = record.password;
      if (password !== undefined && typeof password !== 'string') return [];

      return [{
        name: record.name,
        url: record.url,
        type,
        username,
        password,
      }];
    });
  } catch {
    return [];
  }
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

export function extractCalDavCalendarData(xml: string): string[] {
  const matches = xml.matchAll(
    /<(?:[A-Za-z0-9_-]+:)?calendar-data(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?calendar-data>/g,
  );
  return Array.from(matches)
    .map((m) => m[1].trim())
    .map((s) => s
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'"))
    .filter((v) => v.length > 0);
}

export async function fetchFeedEvents(
  feed: ICalFeed,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<ParsedEvent[]> {
  const auth = getBasicAuthHeader(feed);

  if (feed.type === 'caldav') {
    const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">
  <D:prop>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${formatCalDavTimestamp(rangeStart)}" end="${formatCalDavTimestamp(rangeEnd)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const headers: HeadersInit = {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    };
    if (auth) headers.Authorization = auth;

    const res = await fetch(feed.url, {
      method: 'REPORT',
      headers,
      body: reportBody,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const xml = await res.text();
    const calendars = extractCalDavCalendarData(xml);
    return calendars.flatMap((cal) => parseIcal(cal, rangeStart, rangeEnd));
  }

  const headers: HeadersInit = {};
  if (auth) headers.Authorization = auth;
  const res = await fetch(feed.url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseIcal(text, rangeStart, rangeEnd);
}

/** Maximum RRULE expansion iterations — prevents infinite loops on malformed data. */
const MAX_RRULE_ITER = 5000;

/** Format an ICAL.Time as ISO 8601: YYYY-MM-DD for all-day events, UTC ISO string for timed. */
function formatIcalTime(t: { isDate: boolean; toJSDate(): Date }): string {
  if (t.isDate) {
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
      while (count < MAX_RRULE_ITER && (startTime = iter.next()) !== null) {
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
        const events = await fetchFeedEvents(feed, rangeStart, rangeEnd);
        allEvents.push(...events);
      } catch (err) {
        console.error(`Error fetching calendar feed "${feed.name}":`, err);
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
