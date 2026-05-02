import { Container, Navbar, Nav, Spinner } from 'react-bootstrap';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useInvalidationSocket } from '../hooks/useInvalidationSocket';

const navItems = [
  { to: '/', label: '🏠 Dashboard', exact: true },
  { to: '/all-recipes', label: '📖 All Recipes' },
  { to: '/books', label: '📚 Books' },
  { to: '/search', label: '🔍 Search' },
  { to: '/meal-plan', label: '📅 Meal Plan' },
  { to: '/shopping', label: '🛒 Shopping' },
];

export function Layout() {
  const navigate = useNavigate();
  const isFetching = useIsFetching();
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries();
  }, [queryClient]);

  usePullToRefresh({ onRefresh: handleRefresh });
  useInvalidationSocket();

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Top navbar - desktop */}
      <Navbar bg="dark" variant="dark" expand="md" className="d-none d-md-flex px-3">
        <Navbar.Brand style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          🗝️ Darkhold
        </Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Nav className="me-auto">
            {navItems.map(({ to, label, exact }) => (
              <Nav.Link
                key={to}
                as={NavLink}
                to={to}
                end={exact}
              >
                {label}
              </Nav.Link>
            ))}
          </Nav>
          <Nav>
            <Nav.Link as={NavLink} to="/settings">⚙️ Settings</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      {/* Page content */}
      <Container fluid className="flex-grow-1 py-3 pb-md-3 pb-5">
        <Outlet />
      </Container>

      {/* Bottom tab bar - mobile */}
      <nav
        className="d-md-none fixed-bottom bg-dark border-top border-secondary"
        style={{ zIndex: 1030, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="d-flex">
          {navItems.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex-fill text-center py-2 text-decoration-none small ${isActive ? 'text-white fw-semibold' : 'text-secondary'}`
              }
              style={{ fontSize: '0.65rem' }}
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex-fill text-center py-2 text-decoration-none small ${isActive ? 'text-white fw-semibold' : 'text-secondary'}`
            }
            style={{ fontSize: '0.65rem' }}
          >
            ⚙️ Settings
          </NavLink>
        </div>
      </nav>

      {/* Background refresh throbber */}
      {isFetching > 0 && (
        <div className="refresh-throbber">
          <Spinner animation="border" size="sm" variant="secondary" />
        </div>
      )}
    </div>
  );
}
