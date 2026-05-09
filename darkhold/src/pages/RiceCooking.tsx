const riceTypes = [
  {
    name: 'White long-grain',
    riceRatio: '1',
    waterRatio: '1¾',
    cookTime: '18 min',
    restTime: '5 min',
    notes: 'Bring to boil, then cover and simmer on lowest heat.',
  },
  {
    name: 'White short-grain / sushi',
    riceRatio: '1',
    waterRatio: '1¼',
    cookTime: '15 min',
    restTime: '10 min',
    notes: 'Rinse until water runs clear. Rest covered before serving.',
  },
  {
    name: 'Basmati',
    riceRatio: '1',
    waterRatio: '1½',
    cookTime: '12 min',
    restTime: '5 min',
    notes: 'Soak 30 min, drain, then cook. Fluff with fork after resting.',
  },
  {
    name: 'Jasmine',
    riceRatio: '1',
    waterRatio: '1½',
    cookTime: '18 min',
    restTime: '5 min',
    notes: 'Rinse once. Keep lid on throughout cooking and resting.',
  },
  {
    name: 'Brown long-grain',
    riceRatio: '1',
    waterRatio: '2',
    cookTime: '40–45 min',
    restTime: '10 min',
    notes: 'Higher heat to start, then reduce. Needs more water and time.',
  },
  {
    name: 'Brown short-grain',
    riceRatio: '1',
    waterRatio: '2¼',
    cookTime: '45 min',
    restTime: '10 min',
    notes: 'Chewier texture; rinse before cooking.',
  },
  {
    name: 'Wild rice',
    riceRatio: '1',
    waterRatio: '3',
    cookTime: '45–55 min',
    restTime: '5 min',
    notes: 'Grains split open when done. Drain excess water if needed.',
  },
  {
    name: 'Arborio (risotto)',
    riceRatio: '1',
    waterRatio: '3–4 (add gradually)',
    cookTime: '18–20 min',
    restTime: '—',
    notes: 'Add warm stock ladle by ladle, stirring constantly.',
  },
  {
    name: 'Glutinous / sticky',
    riceRatio: '1',
    waterRatio: '1',
    cookTime: '20 min steam',
    restTime: '5 min',
    notes: 'Soak overnight. Steam in lined basket rather than boiling.',
  },
];

export function RiceCooking() {
  return (
    <div className="mx-auto" style={{ maxWidth: 800 }}>
      <h2 className="mb-2">🍚 Rice Cooking Reference</h2>
      <p className="text-muted mb-4">
        Water ratios are by volume (cups or any consistent unit). All timings are approximate —
        adjust to taste and altitude.
      </p>
      <div className="table-responsive">
        <table className="table table-dark table-striped table-bordered align-middle">
          <thead>
            <tr>
              <th>Rice Type</th>
              <th className="text-center">Rice</th>
              <th className="text-center">Water</th>
              <th className="text-center">Cook Time</th>
              <th className="text-center">Rest</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {riceTypes.map(({ name, riceRatio, waterRatio, cookTime, restTime, notes }) => (
              <tr key={name}>
                <td className="fw-semibold">{name}</td>
                <td className="text-center">{riceRatio}</td>
                <td className="text-center">{waterRatio}</td>
                <td className="text-center">{cookTime}</td>
                <td className="text-center">{restTime}</td>
                <td className="text-muted small">{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
