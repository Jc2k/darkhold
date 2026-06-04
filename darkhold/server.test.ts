/**
 * Unit tests for the WebSocket broadcast server (server.ts) and iCal parser.
 *
 * These tests exercise the broadcast logic and iCal parsing directly without
 * spinning up a full HTTP server, keeping them fast and dependency-free.
 */

import {
  broadcastToAllClients,
  clampWeatherForecastRange,
  fetchFeedEvents,
  handleAddToShoppingList,
  parseOpenMeteoDaily,
  parseIcal,
  parseICalFeeds,
} from './server.ts';

// ---------------------------------------------------------------------------
// Minimal WebSocket stub used by the broadcast tests
// ---------------------------------------------------------------------------

class StubSocket {
  readyState: number;
  sent: string[] = [];
  closed = false;

  constructor(readyState = WebSocket.OPEN) {
    this.readyState = readyState;
  }

  send(data: string) {
    if (this.readyState !== WebSocket.OPEN) throw new Error('socket not open');
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = WebSocket.CLOSED;
  }
}

// ---------------------------------------------------------------------------
// Pure broadcast function extracted for unit testing
// ---------------------------------------------------------------------------

function broadcast(clients: Set<StubSocket>, sender: StubSocket, data: string): void {
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test('broadcast sends message to other open clients', () => {
  const clients = new Set<StubSocket>();
  const sender = new StubSocket();
  const other = new StubSocket();
  clients.add(sender);
  clients.add(other);

  broadcast(clients, sender, 'hello');

  if (other.sent.length !== 1 || other.sent[0] !== 'hello') {
    throw new Error(`expected ['hello'] but got ${JSON.stringify(other.sent)}`);
  }
});

Deno.test('broadcast does not echo message back to sender', () => {
  const clients = new Set<StubSocket>();
  const sender = new StubSocket();
  clients.add(sender);

  broadcast(clients, sender, 'hello');

  if (sender.sent.length !== 0) {
    throw new Error(`sender should not receive its own message`);
  }
});

Deno.test('broadcast skips clients that are not OPEN', () => {
  const clients = new Set<StubSocket>();
  const sender = new StubSocket();
  const closing = new StubSocket(WebSocket.CLOSING);
  const closed = new StubSocket(WebSocket.CLOSED);
  clients.add(sender);
  clients.add(closing);
  clients.add(closed);

  broadcast(clients, sender, 'ping');

  if (closing.sent.length !== 0 || closed.sent.length !== 0) {
    throw new Error('non-open clients should not receive messages');
  }
});

Deno.test('broadcast removes clients that throw on send', () => {
  const clients = new Set<StubSocket>();
  const sender = new StubSocket();

  // A client that throws when send() is called
  const faulty = new StubSocket();
  faulty.send = (_data: string) => {
    throw new Error('send failed');
  };

  clients.add(sender);
  clients.add(faulty);

  broadcast(clients, sender, 'test');

  if (clients.has(faulty)) {
    throw new Error('faulty client should have been removed from the set');
  }
});

Deno.test('broadcast sends to multiple open clients', () => {
  const clients = new Set<StubSocket>();
  const sender = new StubSocket();
  const a = new StubSocket();
  const b = new StubSocket();
  const c = new StubSocket();
  clients.add(sender);
  clients.add(a);
  clients.add(b);
  clients.add(c);

  broadcast(clients, sender, 'multi');

  for (const client of [a, b, c]) {
    if (client.sent.length !== 1 || client.sent[0] !== 'multi') {
      throw new Error(`expected each client to receive 'multi'`);
    }
  }
});

Deno.test('version message is valid JSON with type and version fields', () => {
  const version = '1.2.3';
  const msg = JSON.stringify({ type: 'version', version });
  const parsed = JSON.parse(msg) as { type: string; version: string };

  if (parsed.type !== 'version') throw new Error('type should be version');
  if (parsed.version !== version) throw new Error('version mismatch');
});

// ---------------------------------------------------------------------------
// parseIcal integration tests (exercises ical.js-backed parsing end-to-end)
// ---------------------------------------------------------------------------

Deno.test('parseIcal parses a simple non-recurring event', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Team meeting',
    'DESCRIPTION:Meet Bob at school',
    'DTSTART:20250507T100000Z',
    'DTEND:20250507T110000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const rangeStart = new Date('2025-05-07T00:00:00Z');
  const rangeEnd = new Date('2025-05-07T23:59:59Z');
  const events = parseIcal(ical, rangeStart, rangeEnd);

  if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`);
  if (events[0].name !== 'Team meeting') throw new Error(`name: ${events[0].name}`);
  if (events[0].description !== 'Meet Bob at school')
    throw new Error(`description: ${events[0].description}`);
  if (events[0].allDay) throw new Error('should not be all-day');
  if (events[0].start !== '2025-05-07T10:00:00.000Z') throw new Error(`start: ${events[0].start}`);
  if (events[0].end !== '2025-05-07T11:00:00.000Z') throw new Error(`end: ${events[0].end}`);
  if (events[0].recurring) throw new Error('should not be recurring');
});

Deno.test('parseIcal parses an all-day event', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Birthday',
    'DTSTART;VALUE=DATE:20250507',
    'DTEND;VALUE=DATE:20250508',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const rangeStart = new Date('2025-05-07T00:00:00Z');
  const rangeEnd = new Date('2025-05-07T23:59:59Z');
  const events = parseIcal(ical, rangeStart, rangeEnd);

  if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`);
  if (events[0].name !== 'Birthday') throw new Error(`name: ${events[0].name}`);
  if (!events[0].allDay) throw new Error('should be all-day');
  if (events[0].start !== '2025-05-07') throw new Error(`start: ${events[0].start}`);
});

Deno.test('parseIcal excludes events outside range', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Other day',
    'DTSTART:20250508T100000Z',
    'DTEND:20250508T110000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const rangeStart = new Date('2025-05-07T00:00:00Z');
  const rangeEnd = new Date('2025-05-07T23:59:59Z');
  const events = parseIcal(ical, rangeStart, rangeEnd);

  if (events.length !== 0) throw new Error(`expected 0 events, got ${events.length}`);
});

Deno.test('parseIcal expands recurring weekly event', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Weekly standup',
    'DTSTART:20250505T090000Z',
    'DTEND:20250505T093000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // Query a range that includes two Mondays
  const rangeStart = new Date('2025-05-05T00:00:00Z');
  const rangeEnd = new Date('2025-05-18T23:59:59Z');
  const events = parseIcal(ical, rangeStart, rangeEnd);

  if (events.length !== 2) throw new Error(`expected 2 events, got ${events.length}`);
  const dates = events.map((e) => e.start.split('T')[0]);
  if (!dates.includes('2025-05-05')) throw new Error('missing 2025-05-05');
  if (!dates.includes('2025-05-12')) throw new Error('missing 2025-05-12');
  if (!events.every((event) => event.recurring)) throw new Error('expected recurring flag');
});

Deno.test('parseIcal keeps all-day Monday recurring dates on Monday', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Bank Holiday',
    'DTSTART;VALUE=DATE:20250505',
    'DTEND;VALUE=DATE:20250506',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const rangeStart = new Date('2025-05-01T00:00:00Z');
  const rangeEnd = new Date('2025-05-20T23:59:59Z');
  const events = parseIcal(ical, rangeStart, rangeEnd);

  if (events.length !== 2) throw new Error(`expected 2 events, got ${events.length}`);
  const starts = events.map((e) => e.start);
  if (!starts.includes('2025-05-05')) throw new Error('missing Monday 2025-05-05');
  if (!starts.includes('2025-05-12')) throw new Error('missing Monday 2025-05-12');
  if (starts.includes('2025-05-04') || starts.includes('2025-05-11')) {
    throw new Error(`all-day Monday events shifted to Sunday: ${JSON.stringify(starts)}`);
  }
});

Deno.test('parseIcal handles line folding in SUMMARY', () => {
  const ical =
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Long summar\r\n y text\r\nDTSTART:20250507T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const events = parseIcal(
    ical,
    new Date('2025-05-07T00:00:00Z'),
    new Date('2025-05-07T23:59:59Z'),
  );
  if (events.length !== 1) throw new Error(`expected 1, got ${events.length}`);
  if (events[0].name !== 'Long summary text') throw new Error(`name: "${events[0].name}"`);
});

Deno.test(
  'fetchFeedEvents uses caldav REPORT with basic auth when feed type is caldav',
  async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    const reportResponseXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
      '  <D:response>',
      '    <D:propstat>',
      '      <D:prop>',
      '        <C:calendar-data>BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Private\r\nDTSTART:20250507T100000Z\r\nDTEND:20250507T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR</C:calendar-data>',
      '      </D:prop>',
      '    </D:propstat>',
      '  </D:response>',
      '</D:multistatus>',
    ].join('\n');

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return Promise.resolve(
        new Response(reportResponseXml, {
          status: 207,
          headers: { 'Content-Type': 'application/xml' },
        }),
      );
    }) as typeof fetch;

    try {
      const events = await fetchFeedEvents(
        {
          name: 'CalDAV',
          url: 'https://caldav.icloud.com/calendar/',
          type: 'caldav',
          category: 'appointment',
          username: 'user@example.com',
          password: 'app-password',
        },
        new Date('2025-05-07T00:00:00Z'),
        new Date('2025-05-07T23:59:59Z'),
      );

      if (!request) throw new Error('expected request to be captured');
      if (request.method !== 'REPORT') throw new Error(`expected REPORT, got ${request.method}`);
      if (request.headers.get('Depth') !== '1') throw new Error('expected Depth header');
      if (!request.headers.get('Authorization')?.startsWith('Basic ')) {
        throw new Error('expected basic auth header');
      }
      const body = await request.text();
      if (!body.includes('<c:calendar-query'))
        throw new Error('expected caldav calendar-query element');
      if (!body.includes('<d:prop>') || !body.includes('<c:calendar-data')) {
        throw new Error('expected DAV prop with calendar-data');
      }
      if (!body.includes('<c:filter>')) throw new Error('expected filter element');
      if (!body.includes('<c:comp-filter name="VCALENDAR">'))
        throw new Error('expected VCALENDAR comp-filter');
      if (!body.includes('<c:comp-filter name="VEVENT">'))
        throw new Error('expected VEVENT comp-filter');
      if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`);
      if (events[0].name !== 'Private') throw new Error(`unexpected event: ${events[0].name}`);
      if (events[0].category !== 'appointment')
        throw new Error(`expected appointment category, got ${events[0].category}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'fetchFeedEvents retries caldav REPORT without time-range when filtered query returns no events',
  async () => {
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];

    const emptyResponseXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
      '</D:multistatus>',
    ].join('\n');
    const recurringResponseXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
      '  <D:response>',
      '    <D:propstat>',
      '      <D:prop>',
      '        <C:calendar-data>BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Weekly standup\r\nDTSTART:20240101T090000Z\r\nDTEND:20240101T093000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\nEND:VCALENDAR</C:calendar-data>',
      '      </D:prop>',
      '    </D:propstat>',
      '  </D:response>',
      '</D:multistatus>',
    ].join('\n');

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (requests.length === 1) {
        return Promise.resolve(
          new Response(emptyResponseXml, {
            status: 207,
            headers: { 'Content-Type': 'application/xml' },
          }),
        );
      }
      return Promise.resolve(
        new Response(recurringResponseXml, {
          status: 207,
          headers: { 'Content-Type': 'application/xml' },
        }),
      );
    }) as typeof fetch;

    try {
      const events = await fetchFeedEvents(
        {
          name: 'CalDAV',
          url: 'https://caldav.icloud.com/calendar/',
          type: 'caldav',
        },
        new Date('2025-05-05T00:00:00Z'),
        new Date('2025-05-18T23:59:59Z'),
      );

      if (requests.length !== 2) throw new Error(`expected 2 requests, got ${requests.length}`);
      const firstBody = await requests[0].text();
      const secondBody = await requests[1].text();
      if (!firstBody.includes('time-range'))
        throw new Error('first query should include time-range');
      if (secondBody.includes('time-range'))
        throw new Error('fallback query should omit time-range');
      if (events.length !== 2) throw new Error(`expected 2 events, got ${events.length}`);
      const starts = events.map((e) => e.start.split('T')[0]);
      if (!starts.includes('2025-05-05')) throw new Error('missing 2025-05-05 recurrence');
      if (!starts.includes('2025-05-12')) throw new Error('missing 2025-05-12 recurrence');
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test('fetchFeedEvents parses CalDAV calendar-data wrapped in CDATA', async () => {
  const originalFetch = globalThis.fetch;
  const reportResponseXml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
    '  <D:response>',
    '    <D:propstat>',
    '      <D:prop>',
    '        <C:calendar-data><![CDATA[BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:CDATA Event\r\nDTSTART:20250507T100000Z\r\nDTEND:20250507T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR]]></C:calendar-data>',
    '      </D:prop>',
    '    </D:propstat>',
    '  </D:response>',
    '</D:multistatus>',
  ].join('\n');

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(reportResponseXml, {
        status: 207,
        headers: { 'Content-Type': 'application/xml' },
      }),
    )) as typeof fetch;

  try {
    const events = await fetchFeedEvents(
      {
        name: 'CalDAV',
        url: 'https://caldav.icloud.com/calendar/',
        type: 'caldav',
      },
      new Date('2025-05-07T00:00:00Z'),
      new Date('2025-05-07T23:59:59Z'),
    );

    if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`);
    if (events[0].name !== 'CDATA Event') throw new Error(`unexpected event: ${events[0].name}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('fetchFeedEvents surfaces CalDAV error response text for diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('Unauthorized', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )) as typeof fetch;

  try {
    await fetchFeedEvents(
      {
        name: 'CalDAV',
        url: 'https://caldav.icloud.com/calendar/',
        type: 'caldav',
      },
      new Date('2025-05-07T00:00:00Z'),
      new Date('2025-05-07T23:59:59Z'),
    );
    throw new Error('expected fetchFeedEvents to throw');
  } catch (err) {
    if (!(err instanceof Error)) throw new Error(`expected Error, got ${String(err)}`);
    if (!err.message.includes('HTTP 401'))
      throw new Error(`expected status in error, got ${err.message}`);
    if (!err.message.includes('Unauthorized'))
      throw new Error(`expected response text in error, got ${err.message}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('fetchFeedEvents surfaces ICS error response text for diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )) as typeof fetch;

  try {
    await fetchFeedEvents(
      {
        name: 'Public ICS',
        url: 'https://example.com/events.ics',
        type: 'ics',
      },
      new Date('2025-05-07T00:00:00Z'),
      new Date('2025-05-07T23:59:59Z'),
    );
    throw new Error('expected fetchFeedEvents to throw');
  } catch (err) {
    if (!(err instanceof Error)) throw new Error(`expected Error, got ${String(err)}`);
    if (!err.message.includes('HTTP 403'))
      throw new Error(`expected status in error, got ${err.message}`);
    if (!err.message.includes('Forbidden'))
      throw new Error(`expected response text in error, got ${err.message}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('fetchFeedEvents omits response summary when error body is empty', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response('', {
        status: 500,
      }),
    )) as typeof fetch;

  try {
    await fetchFeedEvents(
      {
        name: 'Public ICS',
        url: 'https://example.com/events.ics',
        type: 'ics',
      },
      new Date('2025-05-07T00:00:00Z'),
      new Date('2025-05-07T23:59:59Z'),
    );
    throw new Error('expected fetchFeedEvents to throw');
  } catch (err) {
    if (!(err instanceof Error)) throw new Error(`expected Error, got ${String(err)}`);
    if (err.message !== 'ICS fetch failed: HTTP 500') {
      throw new Error(`unexpected error message: ${err.message}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// parseICalFeeds tests — exercises feed validation and null/case handling
// ---------------------------------------------------------------------------

Deno.test('parseICalFeeds loads a valid ICS feed', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics' }]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].name !== 'Cal') throw new Error(`unexpected name: ${feeds[0].name}`);
  if (feeds[0].type !== undefined) throw new Error(`expected no type, got ${feeds[0].type}`);
});

Deno.test('parseICalFeeds loads a valid CalDAV feed with credentials', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([
      {
        name: 'iCloud',
        url: 'https://caldav.icloud.com/cal/',
        type: 'caldav',
        username: 'u',
        password: 'p',
      },
    ]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].type !== 'caldav') throw new Error(`expected type caldav, got ${feeds[0].type}`);
  if (feeds[0].username !== 'u') throw new Error(`unexpected username: ${feeds[0].username}`);
  if (feeds[0].password !== 'p') throw new Error(`unexpected password: ${feeds[0].password}`);
});

Deno.test('parseICalFeeds normalises type to lowercase (CalDAV → caldav)', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([
      {
        name: 'iCloud',
        url: 'https://caldav.icloud.com/cal/',
        type: 'CalDAV',
        username: 'u',
        password: 'p',
      },
    ]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].type !== 'caldav')
    throw new Error(`expected type caldav after normalisation, got ${feeds[0].type}`);
});

Deno.test('parseICalFeeds normalises type to lowercase (ICS → ics)', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics', type: 'ICS' }]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].type !== 'ics')
    throw new Error(`expected type ics after normalisation, got ${feeds[0].type}`);
});

Deno.test('parseICalFeeds treats null type as absent (no type)', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics', type: null }]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].type !== undefined) throw new Error(`expected no type, got ${feeds[0].type}`);
});

Deno.test('parseICalFeeds normalises category to lowercase and hyphenated form', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([
      { name: 'Bank', url: 'https://example.com/bank.ics', category: 'Bank Holiday' },
    ]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].category !== 'bank-holiday')
    throw new Error(`expected bank-holiday category, got ${feeds[0].category}`);
});

Deno.test('parseICalFeeds rejects feed with unknown category string', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Bad', url: 'https://example.com/', category: 'work' }]),
  );
  if (feeds.length !== 0) throw new Error(`expected 0 feeds, got ${feeds.length}`);
});

Deno.test('parseICalFeeds treats null username as absent', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics', username: null }]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].username !== undefined)
    throw new Error(`expected no username, got ${feeds[0].username}`);
});

Deno.test('parseICalFeeds treats null password as absent', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics', password: null }]),
  );
  if (feeds.length !== 1) throw new Error(`expected 1 feed, got ${feeds.length}`);
  if (feeds[0].password !== undefined)
    throw new Error(`expected no password, got ${feeds[0].password}`);
});

Deno.test('parseICalFeeds keeps CalDAV feed when HA sends null for unset optional fields', () => {
  // Simulates HA passing null for optional fields the user did not fill in
  const feeds = parseICalFeeds(
    JSON.stringify([
      {
        name: 'iCloud',
        url: 'https://caldav.icloud.com/cal/',
        type: 'caldav',
        username: 'user@icloud.com',
        password: 'app-specific-password',
      },
      {
        name: 'Sports',
        url: 'https://example.com/sports.ics',
        type: null,
        username: null,
        password: null,
      },
    ]),
  );
  if (feeds.length !== 2) throw new Error(`expected 2 feeds, got ${feeds.length}`);
  const caldav = feeds.find((f) => f.name === 'iCloud');
  if (!caldav) throw new Error('CalDAV feed missing');
  if (caldav.type !== 'caldav') throw new Error(`expected caldav type, got ${caldav.type}`);
  const ics = feeds.find((f) => f.name === 'Sports');
  if (!ics) throw new Error('ICS feed missing');
  if (ics.type !== undefined) throw new Error(`expected no type on ICS feed, got ${ics.type}`);
});

Deno.test('parseICalFeeds rejects feed with unknown type string', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Bad', url: 'https://example.com/', type: 'webdav' }]),
  );
  if (feeds.length !== 0) throw new Error(`expected 0 feeds, got ${feeds.length}`);
});

Deno.test('parseICalFeeds rejects feed with only username and no password', () => {
  const feeds = parseICalFeeds(
    JSON.stringify([{ name: 'Cal', url: 'https://example.com/cal.ics', username: 'user' }]),
  );
  if (feeds.length !== 0)
    throw new Error(`expected 0 feeds (incomplete credentials), got ${feeds.length}`);
});

Deno.test('fetchFeedEvents truncates long response text in diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  const longBody = `${'x'.repeat(205)}TAIL`;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(longBody, {
        status: 502,
      }),
    )) as typeof fetch;

  try {
    await fetchFeedEvents(
      {
        name: 'CalDAV',
        url: 'https://caldav.icloud.com/calendar/',
        type: 'caldav',
      },
      new Date('2025-05-07T00:00:00Z'),
      new Date('2025-05-07T23:59:59Z'),
    );
    throw new Error('expected fetchFeedEvents to throw');
  } catch (err) {
    if (!(err instanceof Error)) throw new Error(`expected Error, got ${String(err)}`);
    const expectedPrefix = `CalDAV REPORT failed: HTTP 502; ${'x'.repeat(200)}`;
    if (err.message !== expectedPrefix) {
      throw new Error(`unexpected truncated message: ${err.message}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('parseOpenMeteoDaily maps weather arrays into day forecasts', () => {
  const days = parseOpenMeteoDaily({
    time: ['2026-05-01', '2026-05-02'],
    weather_code: [3, 63],
    temperature_2m_min: [7.2, 6.1],
    temperature_2m_max: [13.8, 11.3],
    sunrise: ['2026-05-01T05:20', '2026-05-02T05:18'],
    sunset: ['2026-05-01T20:35', '2026-05-02T20:37'],
    precipitation_sum: [0.0, 4.7],
    precipitation_probability_max: [5, 78],
  });

  if (days.length !== 2) throw new Error(`expected 2 days, got ${days.length}`);
  if (days[0].date !== '2026-05-01') throw new Error('date mismatch');
  if (days[1].weatherCode !== 63) throw new Error('weather code mismatch');
  if (days[1].precipitationProbabilityMax !== 78)
    throw new Error('precipitation probability mismatch');
});

Deno.test('parseOpenMeteoDaily skips entries with incomplete data', () => {
  const days = parseOpenMeteoDaily({
    time: ['2026-05-01'],
    weather_code: [1],
    temperature_2m_min: [7],
    temperature_2m_max: [14],
    sunrise: ['2026-05-01T05:20'],
    sunset: ['2026-05-01T20:35'],
    precipitation_sum: [],
  });

  if (days.length !== 0) throw new Error(`expected 0 days, got ${days.length}`);
});

Deno.test('parseOpenMeteoDaily defaults missing precipitation probability to zero', () => {
  const days = parseOpenMeteoDaily({
    time: ['2026-05-01'],
    weather_code: [1],
    temperature_2m_min: [7],
    temperature_2m_max: [14],
    sunrise: ['2026-05-01T05:20'],
    sunset: ['2026-05-01T20:35'],
    precipitation_sum: [0.1],
  });

  if (days.length !== 1) throw new Error(`expected 1 day, got ${days.length}`);
  if (days[0].precipitationProbabilityMax !== 0) {
    throw new Error(
      `expected zero precipitation probability, got ${days[0].precipitationProbabilityMax}`,
    );
  }
});

Deno.test('clampWeatherForecastRange leaves in-range weather requests unchanged', () => {
  const range = clampWeatherForecastRange(
    '2026-05-01',
    '2026-05-07',
    new Date('2026-05-01T12:00:00Z'),
  );

  if (!range) throw new Error('expected range');
  if (range.fromDate !== '2026-05-01') throw new Error(`unexpected start date: ${range.fromDate}`);
  if (range.toDate !== '2026-05-07') throw new Error(`unexpected end date: ${range.toDate}`);
});

Deno.test('clampWeatherForecastRange trims weather requests to the Open-Meteo horizon', () => {
  const range = clampWeatherForecastRange(
    '2026-05-10',
    '2026-05-25',
    new Date('2026-05-01T12:00:00Z'),
  );

  if (!range) throw new Error('expected range');
  if (range.fromDate !== '2026-05-10') throw new Error(`unexpected start date: ${range.fromDate}`);
  if (range.toDate !== '2026-05-16') throw new Error(`unexpected end date: ${range.toDate}`);
});

Deno.test(
  'clampWeatherForecastRange skips weather requests entirely beyond the Open-Meteo horizon',
  () => {
    const range = clampWeatherForecastRange(
      '2026-05-17',
      '2026-05-25',
      new Date('2026-05-01T12:00:00Z'),
    );

    if (range !== null) throw new Error(`expected null, got ${JSON.stringify(range)}`);
  },
);

Deno.test('clampWeatherForecastRange skips weather requests older than two months', () => {
  const range = clampWeatherForecastRange(
    '2026-02-01',
    '2026-03-14',
    new Date('2026-05-15T12:00:00Z'),
  );

  if (range !== null) throw new Error(`expected null, got ${JSON.stringify(range)}`);
});

Deno.test('clampWeatherForecastRange trims old weather requests to two months of history', () => {
  const range = clampWeatherForecastRange(
    '2026-03-01',
    '2026-03-20',
    new Date('2026-05-15T12:00:00Z'),
  );

  if (!range) throw new Error('expected range');
  if (range.fromDate !== '2026-03-15') throw new Error(`unexpected start date: ${range.fromDate}`);
  if (range.toDate !== '2026-03-20') throw new Error(`unexpected end date: ${range.toDate}`);
});

// ---------------------------------------------------------------------------
// handleAddToShoppingList tests
// ---------------------------------------------------------------------------

const TEST_TOKEN = 'test-token';
const CORRECT_AUTH = 'Bearer ' + TEST_TOKEN;

Deno.test('handleAddToShoppingList returns 401 when Authorization header is missing', async () => {
  const req = new Request('http://localhost/add-to-shopping-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 'apples' }),
  });
  const res = await handleAddToShoppingList(req, 'http://tandoor:8080');
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

Deno.test('handleAddToShoppingList returns 400 when item field is missing', async () => {
  const req = new Request('http://localhost/add-to-shopping-list', {
    method: 'POST',
    headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const res = await handleAddToShoppingList(req, 'http://tandoor:8080');
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

Deno.test('handleAddToShoppingList returns 400 when item is blank', async () => {
  const req = new Request('http://localhost/add-to-shopping-list', {
    method: 'POST',
    headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: '   ' }),
  });
  const res = await handleAddToShoppingList(req, 'http://tandoor:8080');
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

Deno.test('handleAddToShoppingList returns 400 when body is not valid JSON', async () => {
  const req = new Request('http://localhost/add-to-shopping-list', {
    method: 'POST',
    headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
    body: 'not json',
  });
  const res = await handleAddToShoppingList(req, 'http://tandoor:8080');
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

Deno.test('handleAddToShoppingList parses ingredient text before creating entry', async () => {
  const originalFetch = globalThis.fetch;
  const captured: Request[] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init);
    captured.push(r);
    if (r.url.includes('/api/ingredient-parser/post/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ingredient: {
              food: { id: 42, name: 'apples' },
              unit: null,
              amount: 1,
              note: '',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (r.url.includes('/api/shopping-list-entry/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, food: { id: 42 }, checked: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    throw new Error('unexpected fetch: ' + r.url);
  }) as typeof fetch;

  try {
    const req = new Request('http://localhost/add-to-shopping-list', {
      method: 'POST',
      headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'apples' }),
    });
    const res = await handleAddToShoppingList(req, 'http://tandoor:8080');

    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    const body = (await res.json()) as { success: boolean; item: string };
    if (!body.success) throw new Error('expected success: true');
    if (body.item !== 'apples') throw new Error(`expected item: apples, got ${body.item}`);

    const parserReq = captured.find(
      (r) => r.url.includes('/api/ingredient-parser/post/') && r.method === 'POST',
    );
    if (!parserReq) throw new Error('expected ingredient parser request');
    const parserBody = (await parserReq.json()) as { ingredient?: string };
    if (parserBody.ingredient !== 'apples') {
      throw new Error(`expected ingredient parser body for apples, got ${parserBody.ingredient}`);
    }

    const entryReq = captured.find(
      (r) => r.url.includes('/api/shopping-list-entry/') && r.method === 'POST',
    );
    if (!entryReq) throw new Error('expected shopping list entry creation request');
    const entryBody = (await entryReq.json()) as Record<string, unknown>;
    if ('checked' in entryBody) {
      throw new Error(
        `expected checked to be omitted from entry payload, got ${entryBody.checked}`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleAddToShoppingList forwards parsed amount and unit to shopping entry', async () => {
  const originalFetch = globalThis.fetch;
  const captured: Request[] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init);
    captured.push(r);
    if (r.url.includes('/api/ingredient-parser/post/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ingredient: {
              food: { id: 1149, name: 'space grapes' },
              unit: { id: 13, name: 'g' },
              amount: 100,
              note: '',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (r.url.includes('/api/shopping-list-entry/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 2, food: { id: 1149 }, checked: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    throw new Error('unexpected fetch: ' + r.url);
  }) as typeof fetch;

  try {
    const req = new Request('http://localhost/add-to-shopping-list', {
      method: 'POST',
      headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: '100g space grapes' }),
    });
    const res = await handleAddToShoppingList(req, 'http://tandoor:8080');
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

    const entryReq = captured.find(
      (r) => r.url.includes('/api/shopping-list-entry/') && r.method === 'POST',
    );
    if (!entryReq) throw new Error('expected shopping list entry creation request');
    const entryBody = (await entryReq.json()) as {
      food?: { id?: number; name?: string };
      amount?: number;
      unit?: { id?: number; name?: string } | null;
    };
    if (entryBody.food?.id !== 1149)
      throw new Error(`expected food id 1149, got ${entryBody.food?.id}`);
    if (entryBody.amount !== 100) throw new Error(`expected amount 100, got ${entryBody.amount}`);
    if (entryBody.unit?.id !== 13)
      throw new Error(`expected unit id 13, got ${entryBody.unit?.id}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('handleAddToShoppingList notifies clients on successful add', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init);
    if (r.url.includes('/api/ingredient-parser/post/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ingredient: {
              food: { id: 42, name: 'apples' },
              unit: null,
              amount: 1,
              note: '',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (r.url.includes('/api/shopping-list-entry/') && r.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, food: { id: 42 }, checked: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    throw new Error('unexpected fetch: ' + r.url);
  }) as typeof fetch;

  try {
    let notifyCalled = false;
    const req = new Request('http://localhost/add-to-shopping-list', {
      method: 'POST',
      headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'apples' }),
    });
    const res = await handleAddToShoppingList(req, 'http://tandoor:8080', () => {
      notifyCalled = true;
    });

    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    if (!notifyCalled) throw new Error('expected notifyClients to be called on success');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test(
  'handleAddToShoppingList does not notify clients when Tandoor request fails',
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))) as typeof fetch;

    try {
      let notifyCalled = false;
      const req = new Request('http://localhost/add-to-shopping-list', {
        method: 'POST',
        headers: { Authorization: CORRECT_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'apples' }),
      });
      const res = await handleAddToShoppingList(req, 'http://tandoor:8080', () => {
        notifyCalled = true;
      });

      if (res.status !== 502) throw new Error(`expected 502, got ${res.status}`);
      const body = (await res.json()) as { error?: string; details?: string };
      if (body.error !== 'Failed to add item to shopping list') {
        throw new Error(`unexpected error message: ${body.error}`);
      }
      if (!body.details?.includes('Ingredient parse failed')) {
        throw new Error(`expected parser error details, got: ${body.details}`);
      }
      if (!body.details?.includes('HTTP 500')) {
        throw new Error(`expected status code in details, got: ${body.details}`);
      }
      if (!body.details?.includes('Internal Server Error')) {
        throw new Error(`expected upstream error details, got: ${body.details}`);
      }
      if (notifyCalled) throw new Error('expected notifyClients NOT to be called on failure');
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
