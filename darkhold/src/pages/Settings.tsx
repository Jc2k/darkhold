import { useState } from 'react';
import { Card, Form, Button, Alert, InputGroup, Spinner } from 'react-bootstrap';
import { useSettings, type HomepageSetting } from '../hooks/useSettings';
import { apiGet } from '../api/client';
import type { User } from '../api/tandoor-types';

export function Settings() {
  const { token, setToken, homepage, setHomepage } = useSettings();
  const [draft, setDraft] = useState(token);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = () => {
    setToken(draft);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await apiGet<User[]>('/user/');
      const username = response[0]?.username;
      if (!username) throw new Error('Connection failed: no user returned');
      setTestResult({ ok: true, message: `Connected as ${username}` });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 540 }}>
      <h2 className="mb-4">Settings</h2>

      <Card className="mb-4">
        <Card.Header>API Connection</Card.Header>
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label>Tandoor API Token</Form.Label>
            <InputGroup>
              <Form.Control
                type={showToken ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Enter your Tandoor API token"
              />
              <Button variant="outline-secondary" onClick={() => setShowToken((v) => !v)}>
                {showToken ? '🙈 Hide' : '👁 Show'}
              </Button>
            </InputGroup>
            <Form.Text className="text-muted">
              Find your token at Tandoor → Settings → API Tokens.
            </Form.Text>
          </Form.Group>

          <div className="d-flex gap-2 flex-wrap">
            <Button variant="primary" onClick={handleSave}>
              Save Token
            </Button>
            <Button variant="outline-secondary" onClick={handleTest} disabled={testing || !draft}>
              {testing ? <><Spinner size="sm" className="me-1" />Testing…</> : 'Test Connection'}
            </Button>
          </div>

          {saved && <Alert variant="success" className="mt-3 mb-0 py-2">Token saved!</Alert>}
          {testResult && (
            <Alert variant={testResult.ok ? 'success' : 'danger'} className="mt-3 mb-0 py-2">
              {testResult.message}
            </Alert>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>Preferences</Card.Header>
        <Card.Body>
          <Form.Group>
            <Form.Label>Default Homepage</Form.Label>
            <Form.Select
              value={homepage}
              onChange={(e) => setHomepage(e.target.value as HomepageSetting)}
            >
              <option value="dashboard">Dashboard</option>
              <option value="all-recipes">All Recipes</option>
              <option value="meal-plan">Meal Plan</option>
            </Form.Select>
          </Form.Group>
        </Card.Body>
      </Card>
    </div>
  );
}
