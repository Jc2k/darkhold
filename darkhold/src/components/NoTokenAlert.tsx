import { Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';

export function NoTokenAlert() {
  return (
    <Alert variant="warning" className="mb-3">
      A personal API token is required to make changes.{' '}
      <Alert.Link as={Link} to="/settings">
        Go to Settings →
      </Alert.Link>
    </Alert>
  );
}
