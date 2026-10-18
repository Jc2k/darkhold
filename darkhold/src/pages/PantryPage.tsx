import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, ListGroup, Modal, Offcanvas, Spinner } from 'react-bootstrap';
import { ArrowLeft, BoxSeam, PlusLg } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { apiPost, searchFoods } from '../api/client';
import { AsyncTypeaheadFilter, type FilterOption } from '../components/AsyncTypeaheadFilter';
import {
  SpeechRecognitionButton,
  type SpeechRecognitionButtonHandle,
} from '../components/SpeechRecognitionButton';
import { NoTokenAlert } from '../components/NoTokenAlert';
import { usePantryInventory, type PantryInventoryEntry } from '../hooks/usePantryReservations';
import {
  pantryExpiryStatus,
  useCreatePantryEntry,
  useCreatePantryLocation,
  usePantryHouseholds,
  usePantryLocations,
  usePantryUnits,
  useUpdatePantryEntry,
} from '../hooks/usePantryManagement';
import { formatDate } from '../utils/dateUtils';

type FoodOption = FilterOption & { customOption?: boolean };

type ParsedPantryIngredient = {
  ingredient?: {
    food?: { id: number; name: string };
    unit?: { id: number; name: string } | null;
    amount?: number | null;
  };
};

function prettyDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PantryAddSheet({ show, onHide }: { show: boolean; onHide: () => void }) {
  const [selected, setSelected] = useState<FoodOption[]>([]);
  const [amount, setAmount] = useState('1');
  const [unitId, setUnitId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationFreezer, setNewLocationFreezer] = useState(false);
  const [householdId, setHouseholdId] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [expires, setExpires] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [note, setNote] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechInterim, setSpeechInterim] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const speech = useRef<SpeechRecognitionButtonHandle>(null);
  const locations = usePantryLocations();
  const households = usePantryHouseholds();
  const createLocation = useCreatePantryLocation();
  const units = usePantryUnits();
  const create = useCreatePantryEntry();
  const hasToken = Boolean(localStorage.getItem('tandoor_token'));

  const availableLocations = locations.data ?? [];
  const selectedLocation = availableLocations.find((entry) => String(entry.id) === locationId)
    ?? (availableLocations.length === 1 ? availableLocations[0] : undefined);
  const selectedUnit = units.data?.find((entry) => String(entry.id) === unitId) ?? null;

  const close = () => {
    if (create.isPending) return;
    speech.current?.reset();
    setSelected([]);
    setAmount('1');
    setUnitId('');
    setLocationId('');
    setShowCreateLocation(false);
    setNewLocationName('');
    setNewLocationFreezer(false);
    setHouseholdId('');
    setLocationError(null);
    setExpires('');
    setSubLocation('');
    setNote('');
    setSpeechError(null);
    setSpeechInterim(null);
    setError(null);
    create.reset();
    onHide();
  };

  useEffect(() => {
    if (!show) speech.current?.reset();
  }, [show]);

  const handleSpokenFood = async (spoken: string) => {
    const name = spoken.trim();
    if (!name) return;
    try {
      // Match the shopping request workflow: recognise food, amount and unit.
      // Expiry and storage location remain explicit user inputs.
      const parsed = await apiPost<ParsedPantryIngredient>('/ingredient-parser/post/', {
        ingredient: name,
      });
      const ingredient = parsed.ingredient;
      if (ingredient?.food?.id) {
        setSelected([{ id: ingredient.food.id, name: ingredient.food.name }]);
        if (ingredient.amount != null && Number.isFinite(ingredient.amount) && ingredient.amount > 0) {
          setAmount(String(ingredient.amount));
        }
        if (ingredient.unit?.id) setUnitId(String(ingredient.unit.id));
        return;
      }
    } catch {
      // Fall back to a regular food search if the parser is unavailable.
    }
    try {
      const matches = await searchFoods(name);
      const existing = matches.find(
        (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      setSelected([existing ?? { id: -1, name, customOption: true }]);
    } catch {
      setSelected([{ id: -1, name, customOption: true }]);
    }
  };

  const saveLocation = async () => {
    const name = newLocationName.trim();
    const household = households.data?.find((item) => String(item.id) === householdId)
      ?? (households.data?.length === 1 ? households.data[0] : undefined);
    if (!name || !household) {
      setLocationError('Enter a location name and choose a household.');
      return;
    }
    setLocationError(null);
    try {
      const created = await createLocation.mutateAsync({
        name,
        household,
        is_freezer: newLocationFreezer,
      });
      setLocationId(String(created.id));
      setShowCreateLocation(false);
      setNewLocationName('');
    } catch {
      setLocationError('Could not create this storage location.');
    }
  };

  const submit = async () => {
    if (!hasToken || !selected[0] || !selectedLocation) return;
    setError(null);
    const parsedAmount = Number(amount);
    try {
      await create.mutateAsync({
        food: selected[0].customOption
          ? { name: selected[0].name }
          : { id: selected[0].id, name: selected[0].name },
        location: selectedLocation,
        amount: parsedAmount,
        unit: selectedUnit,
        expires: expires || null,
        subLocation: subLocation.trim(),
        note: note.trim(),
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add pantry item.');
    }
  };

  return (
    <Offcanvas show={show} onHide={close} placement="bottom" className="shopping-list-request-panel">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title>Add to pantry</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {!hasToken && <NoTokenAlert />}
        {(error || create.isError) && (
          <Alert variant="danger">{error ?? 'Could not add to pantry. Try again.'}</Alert>
        )}
        <div className="shopping-request-input-row d-flex align-items-end gap-2 mb-2">
          <div className="flex-grow-1">
            <AsyncTypeaheadFilter
              id="pantry-new-food"
              label="Ingredient"
              selected={selected}
              onSearch={searchFoods}
              onChange={(choices) => setSelected(choices as FoodOption[])}
              placeholder={speechInterim ?? 'Search or create an ingredient…'}
              multiple={false}
              allowNew
              disabled={!hasToken || create.isPending}
            />
          </div>
          <div className="flex-shrink-0 mb-2">
            <SpeechRecognitionButton
              ref={speech}
              onResult={(spoken) => { void handleSpokenFood(spoken); }}
              onErrorChange={setSpeechError}
              onInterimResultChange={setSpeechInterim}
              disabled={!hasToken || create.isPending}
            />
          </div>
        </div>
        {speechError && <Alert variant="warning" className="small">{speechError}</Alert>}
        <Form.Group className="mb-3">
          <Form.Label>Quantity</Form.Label>
          <Form.Control
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={create.isPending}
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Unit (optional)</Form.Label>
          <Form.Select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={units.isLoading || create.isPending}
          >
            <option value="">Count / no unit</option>
            {(units.data ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Storage location</Form.Label>
          <Form.Select
            value={selectedLocation?.id ?? ''}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={locations.isLoading || create.isPending}
          >
            <option value="" disabled>Choose a location</option>
            {availableLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}{location.is_freezer ? ' (freezer)' : ''}
              </option>
            ))}
          </Form.Select>
          {locations.isError && <Alert variant="danger" className="mt-2">Could not load storage locations.</Alert>}
          <Button
            variant="link"
            size="sm"
            className="p-0 mt-2"
            onClick={() => setShowCreateLocation((current) => !current)}
            disabled={createLocation.isPending}
          >
            {showCreateLocation ? 'Cancel new location' : 'Create a storage location'}
          </Button>
          {showCreateLocation && (
            <div className="border rounded p-3 mt-2">
              {locationError && <Alert variant="danger">{locationError}</Alert>}
              <Form.Group className="mb-2">
                <Form.Label>New location name</Form.Label>
                <Form.Control
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="e.g. Garage freezer"
                />
              </Form.Group>
              {(households.data?.length ?? 0) > 1 && (
                <Form.Group className="mb-2">
                  <Form.Label>Household</Form.Label>
                  <Form.Select value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>
                    <option value="">Select household</option>
                    {households.data?.map((household) => (
                      <option key={household.id} value={household.id}>{household.name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}
              <Form.Check
                className="mb-3"
                type="checkbox"
                label="This is a freezer"
                checked={newLocationFreezer}
                onChange={(e) => setNewLocationFreezer(e.target.checked)}
              />
              {households.isError && <Alert variant="danger">Could not load households.</Alert>}
              {!households.isLoading && (households.data?.length ?? 0) === 0 && (
                <Alert variant="warning">No Tandoor household is available for this location.</Alert>
              )}
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => { void saveLocation(); }}
                disabled={createLocation.isPending || !newLocationName.trim() || !households.data?.length}
              >
                {createLocation.isPending ? <Spinner size="sm" /> : 'Save location'}
              </Button>
            </div>
          )}
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Expiry / best-before date (optional)</Form.Label>
          <Form.Control
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            disabled={create.isPending}
          />
          <Form.Text className="text-muted">
            Track individual batches separately when they have different dates.
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Where within the location? (optional)</Form.Label>
          <Form.Control
            value={subLocation}
            onChange={(e) => setSubLocation(e.target.value)}
            placeholder="e.g. upper shelf, second drawer"
            disabled={create.isPending}
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Notes (optional)</Form.Label>
          <Form.Control
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={create.isPending}
          />
        </Form.Group>
        <Button
          variant="primary"
          onClick={() => { void submit(); }}
          disabled={!selected[0] || !selectedLocation || !(Number(amount) > 0) || !hasToken || create.isPending}
        >
          {create.isPending ? <Spinner animation="border" size="sm" /> : 'Add to pantry'}
        </Button>
      </Offcanvas.Body>
    </Offcanvas>
  );
}

function PantryEditDialog({
  entry,
  onHide,
}: {
  entry: PantryInventoryEntry | null;
  onHide: () => void;
}) {
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [expires, setExpires] = useState(entry?.expires ?? '');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdatePantryEntry();

  if (!entry) return null;

  const save = async () => {
    const quantity = Number(amount);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Enter a valid amount of zero or more.');
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ id: entry.id, updates: { amount: quantity, expires: expires || null } });
      onHide();
    } catch {
      setError('Could not update the pantry item.');
    }
  };

  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Update {entry.food?.name ?? 'pantry item'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form.Group className="mb-3">
          <Form.Label>Remaining quantity {entry.unit?.name ? `(${entry.unit.name})` : ''}</Form.Label>
          <Form.Control
            type="number" min={0} step="any" value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Form.Text>Set to zero if used up or discarded.</Form.Text>
        </Form.Group>
        <Form.Group>
          <Form.Label>Expiry / best-before date</Form.Label>
          <Form.Control type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={update.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => { void save(); }} disabled={update.isPending}>
          {update.isPending ? <Spinner animation="border" size="sm" /> : 'Save changes'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function PantryPage() {
  const inventory = usePantryInventory();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PantryInventoryEntry | null>(null);
  const [filter, setFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const today = formatDate(new Date());
  const hasToken = Boolean(localStorage.getItem('tandoor_token'));

  const locations = [...new Set((inventory.data ?? []).map((entry) => entry.inventory_location.name))]
    .sort((a, b) => a.localeCompare(b));

  const visible = [...(inventory.data ?? [])]
    .filter((entry) => Number(entry.amount) > 0)
    .filter((entry) => !filter || entry.food?.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
    .filter((entry) => !locationFilter || entry.inventory_location.name === locationFilter)
    .filter((entry) => !expiringOnly || ['soon', 'expired'].includes(pantryExpiryStatus(entry.expires, today)))
    .sort(
      (a, b) =>
        (a.expires ?? '9999-12-31').localeCompare(b.expires ?? '9999-12-31') ||
        (a.food?.name ?? '').localeCompare(b.food?.name ?? ''),
    );

  return (
    <div className="pt-2">
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <div>
          <Link to="/dashboard" className="small text-muted text-decoration-none">
            <ArrowLeft className="me-1" /> Dashboard
          </Link>
          <h1 className="h3 mb-0"><BoxSeam className="me-2" />Pantry</h1>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          variant="primary"
          disabled={!hasToken}
          aria-label="Add ingredient to pantry"
        >
          <PlusLg className="me-1" /> Add
        </Button>
      </div>
      {!hasToken && <NoTokenAlert />}
      <p className="text-muted small">
        Just the foods you choose to track. Quantities and expiry dates are stored in Tandoor.
      </p>
      <div className="d-flex gap-2 flex-wrap mb-3">
        <Form.Control
          aria-label="Filter pantry ingredients"
          placeholder="Filter ingredients…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Form.Select
          aria-label="Filter by storage location"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          style={{ maxWidth: 230 }}
        >
          <option value="">All locations</option>
          {locations.map((location) => <option key={location}>{location}</option>)}
        </Form.Select>
        <Button
          variant={expiringOnly ? 'primary' : 'outline-secondary'}
          aria-pressed={expiringOnly}
          onClick={() => setExpiringOnly((current) => !current)}
        >
          Expiring soon
        </Button>
      </div>
      {inventory.isError && <Alert variant="danger">Could not load pantry items from Tandoor.</Alert>}
      {inventory.isLoading && !inventory.data && <Spinner animation="border" size="sm" />}
      {!inventory.isLoading && !inventory.isError && visible.length === 0 && (
        <Alert variant="secondary">
          {inventory.data?.length ? 'No pantry items match those filters.' : 'Nothing tracked yet. Use Add to start with just the foods you want to remember.'}
        </Alert>
      )}
      <ListGroup className="mb-4">
        {visible.map((entry) => {
          const status = pantryExpiryStatus(entry.expires, today);
          return (
            <ListGroup.Item key={entry.id} className="d-flex justify-content-between align-items-center gap-3 py-3">
              <div className="flex-grow-1">
                <div className="fw-semibold">{entry.food?.name ?? 'Unknown ingredient'}</div>
                <div className="small text-muted">
                  {entry.amount} {entry.unit?.name ?? ''} · {entry.inventory_location.name}
                  {entry.inventory_location.is_freezer ? ' (freezer)' : ''}
                </div>
                {entry.expires && (
                  <div className="small mt-1">
                    {status === 'expired' && <Badge bg="danger" className="me-2">Expired</Badge>}
                    {status === 'soon' && <Badge bg="warning" text="dark" className="me-2">Use soon</Badge>}
                    <span className="text-muted">Expiry: {prettyDate(entry.expires)}</span>
                  </div>
                )}
                {entry.note && <div className="small text-muted">{entry.note}</div>}
                {entry.sub_location && <div className="small text-muted">{entry.sub_location}</div>}
              </div>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setEditing(entry)}
                disabled={!hasToken}
                aria-label={`Update ${entry.food?.name ?? 'pantry item'}`}
              >
                Update
              </Button>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
      <PantryAddSheet show={showAdd} onHide={() => setShowAdd(false)} />
      {editing && (
        <PantryEditDialog
          key={editing.id}
          entry={editing}
          onHide={() => setEditing(null)}
        />
      )}
    </div>
  );
}
