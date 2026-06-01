import { ProgressBar } from 'react-bootstrap';
import type { ScanProgress } from '../api/housekeeping';

export function HousekeepingProgress({ progress }: { progress: ScanProgress | null }) {
  if (!progress) return null;
  const percent =
    progress.total === 0 ? 100 : Math.round((progress.completed / progress.total) * 100);
  return (
    <div className="my-3" aria-live="polite">
      <div className="small mb-1">
        {progress.label}: {percent}%
      </div>
      <ProgressBar now={percent} label={`${percent}%`} />
    </div>
  );
}
