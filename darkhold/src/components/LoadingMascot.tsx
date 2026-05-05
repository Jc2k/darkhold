import { Spinner } from 'react-bootstrap';

interface LoadingMascotProps {
  label?: string;
}

export function LoadingMascot({ label = "Loading…" }: LoadingMascotProps) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center"
      style={{ position: 'fixed', inset: 0, zIndex: 1040, pointerEvents: 'none' }}
    >
      <Spinner
        animation="border"
        variant="primary"
        role="status"
        style={{ width: '3rem', height: '3rem' }}
      >
        <span className="visually-hidden">{label}</span>
      </Spinner>
    </div>
  );
}
