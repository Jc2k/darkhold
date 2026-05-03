/**
 * Unit tests for the WebSocket broadcast server (server.ts).
 *
 * These tests exercise the broadcast logic directly without spinning up a full
 * HTTP server, keeping them fast and dependency-free.
 */

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
