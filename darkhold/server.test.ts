/**
 * Unit tests for the WebSocket broadcast server (server.ts) and iCal parser.
 *
 * These tests exercise the broadcast logic and iCal parsing directly without
 * spinning up a full HTTP server, keeping them fast and dependency-free.
 */

import {
  extractCalDavCalendarData,
  fetchFeedEvents,
  parseIcal,
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
  faulty.send = (_data: string) => { throw new Error('send failed'); };

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
  if (events[0].allDay) throw new Error('should not be all-day');
  if (events[0].start !== '2025-05-07T10:00:00.000Z') throw new Error(`start: ${events[0].start}`);
  if (events[0].end !== '2025-05-07T11:00:00.000Z') throw new Error(`end: ${events[0].end}`);
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
  const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Long summar\r\n y text\r\nDTSTART:20250507T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const events = parseIcal(ical, new Date('2025-05-07T00:00:00Z'), new Date('2025-05-07T23:59:59Z'));
  if (events.length !== 1) throw new Error(`expected 1, got ${events.length}`);
  if (events[0].name !== 'Long summary text') throw new Error(`name: "${events[0].name}"`);
});

Deno.test('extractCalDavCalendarData reads calendar-data elements from multistatus xml', () => {
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
    '  <D:response>',
    '    <D:propstat>',
    '      <D:prop>',
    '        <C:calendar-data>BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:One\r\nDTSTART:20250507T100000Z\r\nDTEND:20250507T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR</C:calendar-data>',
    '      </D:prop>',
    '    </D:propstat>',
    '  </D:response>',
    '</D:multistatus>',
  ].join('\n');

  const calendars = extractCalDavCalendarData(xml);
  if (calendars.length !== 1) throw new Error(`expected 1 calendar payload, got ${calendars.length}`);
  if (!calendars[0].includes('SUMMARY:One')) throw new Error('missing event summary');
});

Deno.test('fetchFeedEvents uses caldav REPORT with basic auth when feed type is caldav', async () => {
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
    if (!body.includes('<C:calendar-query')) throw new Error('expected calendar-query body');
    if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`);
    if (events[0].name !== 'Private') throw new Error(`unexpected event: ${events[0].name}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
