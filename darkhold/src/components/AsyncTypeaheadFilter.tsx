import { useState } from 'react';
import { AsyncTypeahead } from 'react-bootstrap-typeahead';
import { Button, Alert } from 'react-bootstrap';
import 'react-bootstrap-typeahead/css/Typeahead.css';

export interface FilterOption {
  id: number;
  name: string;
}

interface AsyncTypeaheadFilterProps {
  id: string;
  label: string;
  selected: FilterOption[];
  onSearch: (query: string) => Promise<FilterOption[]>;
  onChange: (selected: FilterOption[]) => void;
  onRemove: () => void;
  placeholder?: string;
}

export function AsyncTypeaheadFilter({
  id,
  label,
  selected,
  onSearch,
  onChange,
  onRemove,
  placeholder,
}: AsyncTypeaheadFilterProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [searchError, setSearchError] = useState(false);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setSearchError(false);
    try {
      const results = await onSearch(query);
      setOptions(results);
    } catch {
      setSearchError(true);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-start gap-2 mb-2">
      <div className="flex-grow-1">
        <div className="form-label small text-muted mb-1">{label}</div>
        <AsyncTypeahead
          id={id}
          isLoading={isLoading}
          labelKey="name"
          multiple
          minLength={1}
          options={options}
          selected={selected}
          onSearch={handleSearch}
          onChange={(opts) => onChange(opts as FilterOption[])}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
          size="sm"
        />
        {searchError && (
          <Alert variant="danger" className="py-1 px-2 mt-1 mb-0 small">
            Failed to load suggestions.
          </Alert>
        )}
      </div>
      <Button
        variant="outline-secondary"
        size="sm"
        className="mt-4 flex-shrink-0"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        title={`Remove ${label} filter`}
      >
        ×
      </Button>
    </div>
  );
}
