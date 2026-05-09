import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { Container, Alert, Button } from 'react-bootstrap';

function getErrorDetails(error: unknown): { title: string; message: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} ${error.statusText}`,
      message:
        typeof error.data === 'string'
          ? error.data
          : 'An unexpected error occurred. Please try again.',
    };
  }
  if (error instanceof Error) {
    return { title: 'Something went wrong', message: error.message };
  }
  return {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
  };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { title, message } = getErrorDetails(error);
  const canGoBack = window.history.length > 1;

  return (
    <Container className="py-5 text-center">
      <Alert variant="danger" className="d-inline-block text-start">
        <Alert.Heading>⚠️ {title}</Alert.Heading>
        <p>{message}</p>
        <hr />
        <div className="d-flex gap-2">
          {canGoBack && (
            <Button variant="outline-danger" onClick={() => navigate(-1)}>
              Go back
            </Button>
          )}
          <Button variant="danger" onClick={() => navigate('/')}>
            Go home
          </Button>
        </div>
      </Alert>
    </Container>
  );
}
