import { Button, Form } from 'react-bootstrap';

export function HousekeepingSelection({
  ids,
  selected,
  onChange,
}: {
  ids: number[];
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
}) {
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <div className="d-flex gap-2 align-items-center mb-3">
      <Form.Check
        checked={allSelected}
        onChange={() => onChange(allSelected ? new Set() : new Set(ids))}
        label={allSelected ? 'Deselect all' : 'Select all'}
      />
      <Button variant="link" size="sm" className="p-0" onClick={() => onChange(new Set())}>
        Clear selection
      </Button>
    </div>
  );
}
