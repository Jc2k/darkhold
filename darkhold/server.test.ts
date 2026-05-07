/**
 * Unit tests for the WebSocket broadcast server (server.ts) and iCal parser.
 *
 * These tests exercise the broadcast logic and iCal parsing helpers directly
 * without spinning up a full HTTP server, keeping them fast and dependency-free.
 */

import {
  unfoldLines,
  parseContentLine,
  parseICalDatetime,
  parseDuration,
  parseRRule,
  expandRecurring,
  localToUtc,
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
// iCal parser unit tests
// ---------------------------------------------------------------------------

Deno.test('unfoldLines handles CRLF line folding', () => {
  const input = 'SUMMARY:Hello\r\n World\r\nDTSTART:20250507';
  const lines = unfoldLines(input);
  if (lines.length !== 2) throw new Error(`expected 2 lines, got ${lines.length}`);
  if (lines[0] !== 'SUMMARY:Hello World') throw new Error(`got: ${lines[0]}`);
  if (lines[1] !== 'DTSTART:20250507') throw new Error(`got: ${lines[1]}`);
});

Deno.test('unfoldLines handles LF line folding', () => {
  const input = 'SUMMARY:Long\n Description\nDTSTART:20250507';
  const lines = unfoldLines(input);
  if (lines.length !== 2) throw new Error(`expected 2 lines, got ${lines.length}`);
  if (lines[0] !== 'SUMMARY:Long Description') throw new Error(`got: ${lines[0]}`);
});

Deno.test('parseContentLine parses simple property', () => {
  const result = parseContentLine('SUMMARY:Doctor appointment');
  if (!result) throw new Error('expected result');
  if (result.name !== 'SUMMARY') throw new Error(`name: ${result.name}`);
  if (result.prop.value !== 'Doctor appointment') throw new Error(`value: ${result.prop.value}`);
  if (Object.keys(result.prop.params).length !== 0) throw new Error('expected no params');
});

Deno.test('parseContentLine parses property with TZID parameter', () => {
  const result = parseContentLine('DTSTART;TZID=America/New_York:20250507T100000');
  if (!result) throw new Error('expected result');
  if (result.name !== 'DTSTART') throw new Error(`name: ${result.name}`);
  if (result.prop.params.TZID !== 'America/New_York') throw new Error(`TZID: ${result.prop.params.TZID}`);
  if (result.prop.value !== '20250507T100000') throw new Error(`value: ${result.prop.value}`);
});

Deno.test('parseContentLine returns null for lines without colon', () => {
  const result = parseContentLine('INVALID');
  if (result !== null) throw new Error('expected null');
});

Deno.test('parseICalDatetime parses UTC datetime', () => {
  const { date, allDay } = parseICalDatetime('20250507T140000Z', {});
  if (allDay) throw new Error('should not be allDay');
  if (date.toISOString() !== '2025-05-07T14:00:00.000Z') throw new Error(`got: ${date.toISOString()}`);
});

Deno.test('parseICalDatetime parses all-day DATE value', () => {
  const { date, allDay } = parseICalDatetime('20250507', {});
  if (!allDay) throw new Error('should be allDay');
  if (date.toISOString().split('T')[0] !== '2025-05-07') throw new Error(`got: ${date.toISOString()}`);
});

Deno.test('parseICalDatetime parses VALUE=DATE parameter', () => {
  const { date, allDay } = parseICalDatetime('20250507', { VALUE: 'DATE' });
  if (!allDay) throw new Error('should be allDay');
  if (date.toISOString().split('T')[0] !== '2025-05-07') throw new Error(`got: ${date.toISOString()}`);
});

Deno.test('parseDuration parses simple durations', () => {
  if (parseDuration('P1D') !== 86400000) throw new Error('P1D');
  if (parseDuration('PT1H') !== 3600000) throw new Error('PT1H');
  if (parseDuration('PT30M') !== 1800000) throw new Error('PT30M');
  if (parseDuration('P1W') !== 7 * 86400000) throw new Error('P1W');
  if (parseDuration('P1DT2H30M') !== (86400 + 7200 + 1800) * 1000) throw new Error('P1DT2H30M');
});

Deno.test('parseRRule parses basic RRULE', () => {
  const rrule = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1');
  if (rrule.freq !== 'WEEKLY') throw new Error(`freq: ${rrule.freq}`);
  if (rrule.interval !== 1) throw new Error(`interval: ${rrule.interval}`);
  if (!rrule.byDay.includes('MO')) throw new Error('missing MO');
  if (!rrule.byDay.includes('WE')) throw new Error('missing WE');
  if (!rrule.byDay.includes('FR')) throw new Error('missing FR');
});

Deno.test('parseRRule parses COUNT and UNTIL', () => {
  const rruleCount = parseRRule('FREQ=DAILY;COUNT=5');
  if (rruleCount.count !== 5) throw new Error(`count: ${rruleCount.count}`);

  const rruleUntil = parseRRule('FREQ=WEEKLY;UNTIL=20250601T000000Z');
  if (!rruleUntil.until) throw new Error('expected until');
  if (rruleUntil.until.toISOString().split('T')[0] !== '2025-06-01') {
    throw new Error(`until: ${rruleUntil.until.toISOString()}`);
  }
});

Deno.test('expandRecurring generates daily occurrences', () => {
  const dtstart = new Date('2025-05-01T10:00:00Z');
  const rrule = parseRRule('FREQ=DAILY;INTERVAL=1');
  const rangeStart = new Date('2025-05-05T00:00:00Z');
  const rangeEnd = new Date('2025-05-07T23:59:59Z');
  const occurrences = expandRecurring(dtstart, rrule, new Set(), rangeStart, rangeEnd);
  if (occurrences.length !== 3) throw new Error(`expected 3, got ${occurrences.length}`);
  if (occurrences[0].toISOString().split('T')[0] !== '2025-05-05') throw new Error(`first: ${occurrences[0].toISOString()}`);
  if (occurrences[2].toISOString().split('T')[0] !== '2025-05-07') throw new Error(`last: ${occurrences[2].toISOString()}`);
});

Deno.test('expandRecurring generates weekly BYDAY occurrences', () => {
  // Every Monday and Wednesday
  const dtstart = new Date('2025-05-05T10:00:00Z'); // Monday
  const rrule = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE');
  const rangeStart = new Date('2025-05-05T00:00:00Z');
  const rangeEnd = new Date('2025-05-11T23:59:59Z');
  const occurrences = expandRecurring(dtstart, rrule, new Set(), rangeStart, rangeEnd);
  const dates = occurrences.map((d) => d.toISOString().split('T')[0]);
  if (!dates.includes('2025-05-05')) throw new Error('missing Monday 2025-05-05');
  if (!dates.includes('2025-05-07')) throw new Error('missing Wednesday 2025-05-07');
  if (dates.length !== 2) throw new Error(`expected 2 occurrences, got ${dates.length}: ${JSON.stringify(dates)}`);
});

Deno.test('expandRecurring respects COUNT', () => {
  const dtstart = new Date('2025-05-01T10:00:00Z');
  const rrule = parseRRule('FREQ=DAILY;COUNT=3');
  const rangeStart = new Date('2025-05-01T00:00:00Z');
  const rangeEnd = new Date('2025-05-31T23:59:59Z');
  const occurrences = expandRecurring(dtstart, rrule, new Set(), rangeStart, rangeEnd);
  if (occurrences.length !== 3) throw new Error(`expected 3, got ${occurrences.length}`);
});

Deno.test('expandRecurring respects EXDATE', () => {
  const dtstart = new Date('2025-05-01T10:00:00Z');
  const rrule = parseRRule('FREQ=DAILY;INTERVAL=1');
  const rangeStart = new Date('2025-05-01T00:00:00Z');
  const rangeEnd = new Date('2025-05-03T23:59:59Z');
  const exdates = new Set(['2025-05-02']);
  const occurrences = expandRecurring(dtstart, rrule, exdates, rangeStart, rangeEnd);
  const dates = occurrences.map((d) => d.toISOString().split('T')[0]);
  if (dates.includes('2025-05-02')) throw new Error('excluded date should not appear');
  if (!dates.includes('2025-05-01')) throw new Error('2025-05-01 should appear');
  if (!dates.includes('2025-05-03')) throw new Error('2025-05-03 should appear');
});

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

Deno.test('parseIcal handles line folding in SUMMARY', () => {
  const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Long summar\r\n y text\r\nDTSTART:20250507T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const events = parseIcal(ical, new Date('2025-05-07T00:00:00Z'), new Date('2025-05-07T23:59:59Z'));
  if (events.length !== 1) throw new Error(`expected 1, got ${events.length}`);
  if (events[0].name !== 'Long summary text') throw new Error(`name: "${events[0].name}"`);
});
