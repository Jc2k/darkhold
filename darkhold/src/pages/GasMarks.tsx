const gasMarks = [
  { mark: '¼', celsius: 110, fahrenheit: 225, description: 'Very cool' },
  { mark: '½', celsius: 130, fahrenheit: 266, description: 'Very cool' },
  { mark: '1', celsius: 140, fahrenheit: 275, description: 'Cool' },
  { mark: '2', celsius: 150, fahrenheit: 300, description: 'Cool' },
  { mark: '3', celsius: 160, fahrenheit: 325, description: 'Warm' },
  { mark: '4', celsius: 180, fahrenheit: 350, description: 'Moderate' },
  { mark: '5', celsius: 190, fahrenheit: 375, description: 'Moderately hot' },
  { mark: '6', celsius: 200, fahrenheit: 400, description: 'Moderately hot' },
  { mark: '7', celsius: 220, fahrenheit: 425, description: 'Hot' },
  { mark: '8', celsius: 230, fahrenheit: 450, description: 'Hot' },
  { mark: '9', celsius: 240, fahrenheit: 475, description: 'Very hot' },
  { mark: '10', celsius: 260, fahrenheit: 500, description: 'Very hot' },
];

export function GasMarks() {
  return (
    <div className="mx-auto" style={{ maxWidth: 600 }}>
      <h2 className="mb-4">🔥 Gas Mark Reference</h2>
      <p className="text-muted mb-4">
        Quick reference chart for gas mark settings and their equivalent temperatures.
      </p>
      <div className="table-responsive">
        <table className="table table-dark table-striped table-bordered align-middle">
          <thead>
            <tr>
              <th className="text-center">Gas Mark</th>
              <th className="text-center">°C</th>
              <th className="text-center">°F</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {gasMarks.map(({ mark, celsius, fahrenheit, description }) => (
              <tr key={mark}>
                <td className="text-center fw-semibold">{mark}</td>
                <td className="text-center">{celsius}</td>
                <td className="text-center">{fahrenheit}</td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
