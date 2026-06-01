import { Alert } from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { LoadingMascot } from './LoadingMascot';
import { useSuperuser } from '../hooks/useSuperuser';

export function SuperuserGuard({ children }: { children: React.ReactNode }) {
  const { data: isSuperuser, isLoading, isError } = useSuperuser();

  if (isLoading) return <LoadingMascot label="Checking administrator access…" />;
  if (isError) return <Alert variant="danger">Unable to verify administrator access.</Alert>;
  if (!isSuperuser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
