import { useState } from 'react';
import { Card, Form, InputGroup } from 'react-bootstrap';

type ConversionCategory = {
  label: string;
  units: { label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[];
};

const categories: ConversionCategory[] = [
  {
    label: '⚖️ Weight',
    units: [
      { label: 'Grams (g)', toBase: (v) => v, fromBase: (v) => v },
      { label: 'Kilograms (kg)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { label: 'Ounces (oz)', toBase: (v) => v * 28.3495, fromBase: (v) => v / 28.3495 },
      { label: 'Pounds (lb)', toBase: (v) => v * 453.592, fromBase: (v) => v / 453.592 },
    ],
  },
  {
    label: '🥛 Volume',
    units: [
      { label: 'Millilitres (ml)', toBase: (v) => v, fromBase: (v) => v },
      { label: 'Litres (L)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { label: 'Teaspoons (tsp)', toBase: (v) => v * 4.92892, fromBase: (v) => v / 4.92892 },
      { label: 'Tablespoons (tbsp)', toBase: (v) => v * 14.7868, fromBase: (v) => v / 14.7868 },
      { label: 'Fluid ounces (fl oz)', toBase: (v) => v * 29.5735, fromBase: (v) => v / 29.5735 },
      { label: 'Cups (US)', toBase: (v) => v * 236.588, fromBase: (v) => v / 236.588 },
      { label: 'Pints (US)', toBase: (v) => v * 473.176, fromBase: (v) => v / 473.176 },
      { label: 'Pints (UK)', toBase: (v) => v * 568.261, fromBase: (v) => v / 568.261 },
    ],
  },
  {
    label: '📏 Length',
    units: [
      { label: 'Millimetres (mm)', toBase: (v) => v, fromBase: (v) => v },
      { label: 'Centimetres (cm)', toBase: (v) => v * 10, fromBase: (v) => v / 10 },
      { label: 'Metres (m)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { label: 'Inches (in)', toBase: (v) => v * 25.4, fromBase: (v) => v / 25.4 },
      { label: 'Feet (ft)', toBase: (v) => v * 304.8, fromBase: (v) => v / 304.8 },
    ],
  },
  {
    label: '🌡️ Temperature',
    units: [
      {
        label: 'Celsius (°C)',
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      {
        label: 'Fahrenheit (°F)',
        toBase: (v) => (v - 32) * (5 / 9),
        fromBase: (v) => v * (9 / 5) + 32,
      },
      {
        label: 'Kelvin (K)',
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15,
      },
    ],
  },
];

function formatResult(value: number): string {
  if (!isFinite(value)) return '—';
  // Show up to 4 significant figures, strip trailing zeros
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 0.001 && abs < 1e7) {
    const decimals = Math.max(0, 4 - Math.floor(Math.log10(abs)) - 1);
    return parseFloat(value.toFixed(decimals)).toString();
  }
  return value.toPrecision(4);
}

function CategoryConverter({ category }: { category: ConversionCategory }) {
  const [inputIndex, setInputIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');

  const baseValue =
    inputValue !== '' && !isNaN(Number(inputValue))
      ? category.units[inputIndex].toBase(Number(inputValue))
      : NaN;

  return (
    <Card className="mb-4">
      <Card.Header>{category.label}</Card.Header>
      <Card.Body>
        <Form.Group className="mb-3">
          <Form.Label className="small text-muted">Enter value</Form.Label>
          <InputGroup>
            <Form.Control
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="0"
            />
            <Form.Select
              style={{ maxWidth: 220 }}
              value={inputIndex}
              onChange={(e) => setInputIndex(Number(e.target.value))}
            >
              {category.units.map((u, i) => (
                <option key={u.label} value={i}>
                  {u.label}
                </option>
              ))}
            </Form.Select>
          </InputGroup>
        </Form.Group>

        <div className="row g-2">
          {category.units.map((u, i) => {
            if (i === inputIndex) return null;
            const result = isNaN(baseValue) ? '' : formatResult(u.fromBase(baseValue));
            return (
              <div key={u.label} className="col-6 col-md-4">
                <div className="p-2 rounded bg-dark border border-secondary h-100">
                  <div className="small text-muted mb-1">{u.label}</div>
                  <div className="fw-semibold fs-5">
                    {result || <span className="text-secondary">—</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
}

export function UnitConverter() {
  return (
    <div className="mx-auto" style={{ maxWidth: 680 }}>
      <h2 className="mb-4">📐 Unit Converter</h2>
      {categories.map((cat) => (
        <CategoryConverter key={cat.label} category={cat} />
      ))}
    </div>
  );
}
