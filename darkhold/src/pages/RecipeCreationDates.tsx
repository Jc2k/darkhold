import { useState } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import {
  scanRecipeCreationDates,
  type RecipeCreationDateCandidate,
  type ScanProgress,
} from '../api/housekeeping';
import { HousekeepingProgress } from '../components/HousekeepingProgress';
import { HousekeepingSelection } from '../components/HousekeepingSelection';
import { proxyMediaUrl } from '../utils/mediaUrl';

function displayDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export function RecipeCreationDates() {
  const [candidates, setCandidates] = useState<RecipeCreationDateCandidate[] | null>(null);
  const [selected, setSelected] = useState(new Set<number>());
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setError('');
    setScanning(true);
    setProgress(null);
    try {
      const next = await scanRecipeCreationDates(setProgress);
      setCandidates(next);
      setSelected(new Set(next.map((candidate) => candidate.recipeId)));
    } catch {
      setError('Failed to scan recipes and cook logs.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="pt-2">
      <Link to="/housekeeping">← Housekeeping</Link>
      <h1 className="h3 mt-2">Fix historic recipe creation dates</h1>
      <p>Find recipes whose earliest cook log predates the recipe creation timestamp.</p>
      <Alert variant="warning">
        Preview only: upstream Tandoor marks recipe <code>created_at</code> as read-only in its REST
        API, so Darkhold cannot safely apply these corrections. Use this review list to make the
        corresponding database corrections in Tandoor.
      </Alert>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button onClick={scan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Scan recipe dates'}
      </Button>
      <HousekeepingProgress progress={progress} />
      {candidates && (
        <>
          <h2 className="h5">Recipe dates to correct ({candidates.length})</h2>
          {candidates.length === 0 ? (
            <Alert variant="success">No recipe creation dates need correction.</Alert>
          ) : (
            <>
              <HousekeepingSelection
                ids={candidates.map((candidate) => candidate.recipeId)}
                selected={selected}
                onChange={setSelected}
              />
              <div className="d-grid gap-2">
                {candidates.map((candidate) => (
                  <Card key={candidate.recipeId}>
                    <Card.Body className="d-flex gap-3 align-items-center py-2">
                      <Form.Check
                        checked={selected.has(candidate.recipeId)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(candidate.recipeId)) next.delete(candidate.recipeId);
                            else next.add(candidate.recipeId);
                            return next;
                          })
                        }
                        aria-label={`Select ${candidate.recipeName}`}
                      />
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
                        <div className="small">
                          Current: {displayDate(candidate.currentCreatedAt)}
                        </div>
                        <div className="small text-success">
                          Proposed: {displayDate(candidate.proposedCreatedAt)}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
