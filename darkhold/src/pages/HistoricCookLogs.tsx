import { useState } from 'react';
import { Alert, Button, Card, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import {
  createHistoricCookLogs,
  scanHistoricCookLogs,
  type HistoricCookLogCandidate,
  type ScanProgress,
} from '../api/housekeeping';
import { HousekeepingProgress } from '../components/HousekeepingProgress';
import { proxyMediaUrl } from '../utils/mediaUrl';

export function HistoricCookLogs() {
  const [candidates, setCandidates] = useState<HistoricCookLogCandidate[] | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const scan = async () => {
    setError('');
    setScanning(true);
    setProgress(null);
    try {
      setCandidates(await scanHistoricCookLogs(setProgress));
    } catch {
      setError('Failed to scan historic meal plans and cook logs.');
    } finally {
      setScanning(false);
    }
  };
  const apply = async () => {
    if (!candidates) return;
    setShowConfirm(false);
    setError('');
    setApplying(true);
    setProgress(null);
    try {
      await createHistoricCookLogs(candidates, setProgress);
      setCandidates([]);
    } catch {
      setError('Cook-log creation stopped after an API error. Re-scan before trying again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="pt-2">
      <Link to="/housekeeping">← Housekeeping</Link>
      <h1 className="h3 mt-2">Fix historic cook logs</h1>
      <p>
        Find meal-plan entries more than one week old without a cook log for the same date and
        recipe. Applying the preview creates a three-star log with no notes for every listed meal.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button onClick={scan} disabled={scanning || applying}>
        {scanning ? 'Scanning…' : 'Scan historic meals'}
      </Button>
      <HousekeepingProgress progress={progress} />
      {candidates && (
        <>
          <h2 className="h5">Cook logs to create ({candidates.length})</h2>
          {candidates.length === 0 ? (
            <Alert variant="success">No missing historic cook logs found.</Alert>
          ) : (
            <>
              <div className="d-grid gap-2 mb-3">
                {candidates.map((candidate) => (
                  <Card key={candidate.mealPlanId}>
                    <Card.Body className="d-flex gap-3 align-items-center py-2">
                      {candidate.recipeImage && (
                        <img
                          src={proxyMediaUrl(candidate.recipeImage)}
                          alt=""
                          width="64"
                          height="64"
                          className="rounded object-fit-cover"
                        />
                      )}
                      <div>
                        <strong>{candidate.recipeName}</strong>
                        <div className="text-muted small">
                          {candidate.mealPlanDate} · 3 stars · no notes
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
              <Button variant="success" disabled={applying} onClick={() => setShowConfirm(true)}>
                Create all cook logs
              </Button>
            </>
          )}
        </>
      )}
      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Create historic cook logs?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          This will create {candidates?.length ?? 0} cook logs with a three-star rating and no
          notes.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>
            Cancel
          </Button>
          <Button variant="success" onClick={apply}>
            Create logs
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
