import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap';
import { Trash3 } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import {
  deleteFoods,
  scanOrphanedIngredients,
  type OrphanedIngredientScan,
  type ScanProgress,
} from '../api/housekeeping';
import { HousekeepingProgress } from '../components/HousekeepingProgress';
import { HousekeepingSelection } from '../components/HousekeepingSelection';
import { invalidateCacheQueries } from '../hooks/useCacheInvalidation';

export function OrphanedIngredients() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<OrphanedIngredientScan | null>(null);
  const [selected, setSelected] = useState(new Set<number>());
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
      const next = await scanOrphanedIngredients(setProgress);
      setResult(next);
      setSelected(new Set(next.foods.map((food) => food.id)));
    } catch {
      setError('Failed to scan ingredients.');
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    setShowConfirm(false);
    setError('');
    setApplying(true);
    setProgress(null);
    try {
      await deleteFoods([...selected], setProgress);
      setResult((current) =>
        current
          ? { ...current, foods: current.foods.filter((food) => !selected.has(food.id)) }
          : current,
      );
      setSelected(new Set());
    } catch {
      setError(
        'Deletion stopped because Tandoor rejected an ingredient. Re-scan before trying again.',
      );
    } finally {
      setApplying(false);
      invalidateCacheQueries(queryClient, 'foods', 'shopping-list', 'recipes');
    }
  };

  return (
    <div className="pt-2">
      <Link to="/housekeeping">← Housekeeping</Link>
      <h1 className="h3 mt-2">Clean orphaned ingredients</h1>
      <p>
        Scan recipes and shopping-list entries, review the unused ingredients, then choose which
        ingredients to permanently delete.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button onClick={scan} disabled={scanning || applying}>
        {scanning ? 'Scanning…' : 'Scan ingredients'}
      </Button>
      <HousekeepingProgress progress={progress} />
      {result && (
        <>
          <Alert variant="warning" className="small">
            {result.limitation}
          </Alert>
          <h2 className="h5">Unused ingredients ({result.foods.length})</h2>
          {result.foods.length === 0 ? (
            <Alert variant="success">No unused ingredients found.</Alert>
          ) : (
            <>
              <HousekeepingSelection
                ids={result.foods.map((food) => food.id)}
                selected={selected}
                onChange={setSelected}
              />
              <ListGroup className="mb-3">
                {result.foods.map((food) => (
                  <ListGroup.Item key={food.id}>
                    <Form.Check
                      checked={selected.has(food.id)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(food.id)) next.delete(food.id);
                          else next.add(food.id);
                          return next;
                        })
                      }
                      label={food.name}
                    />
                  </ListGroup.Item>
                ))}
              </ListGroup>
              <Button
                variant="danger"
                disabled={selected.size === 0 || applying}
                onClick={() => setShowConfirm(true)}
              >
                <Trash3 className="me-1" /> Delete selected ({selected.size})
              </Button>
            </>
          )}
        </>
      )}
      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Delete orphaned ingredients?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          This will permanently delete {selected.size} selected ingredient
          {selected.size === 1 ? '' : 's'}. This cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={apply}>
            <Trash3 className="me-1" /> Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
