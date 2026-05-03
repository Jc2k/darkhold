import { Container, Navbar, Nav, Spinner, NavDropdown, Offcanvas, ListGroup } from 'react-bootstrap';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useInvalidationSocket } from '../hooks/useInvalidationSocket';
import { useSwipeUpSearch } from '../hooks/useSwipeUpSearch';
import { SearchDrawer } from './SearchDrawer';

const navItems = [
  { to: '/', label: '🏠 Dashboard', exact: true },
  { to: '/all-recipes', label: '📖 Recipes' },
  { to: '/books', label: '📚 Books' },
  { to: '/search', label: '🔍 Search' },
  { to: '/meal-plan', label: '📅 Plan' },
  { to: '/shopping', label: '🛒 Shopping' },
];

const mobileNavItems = navItems.filter(({ to }) => to !== '/search');

const menuItems = [
  { to: '/settings', label: '⚙️ Settings' },
  { to: '/utilities/gas-marks', label: '🔥 Gas Marks' },
  { to: '/utilities/unit-converter', label: '📐 Unit Converter' },
  { to: '/utilities/rice-cooking', label: '🍚 Rice Cooking' },
];

export function Layout() {
  const navigate = useNavigate();
  const isFetching = useIsFetching();
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries();
  }, [queryClient]);

  usePullToRefresh({ onRefresh: handleRefresh });
  useInvalidationSocket();
  useSwipeUpSearch({ onOpen: () => setShowSearch(true) });

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
            <NavDropdown title="☰ Menu" id="desktop-menu-dropdown" align="end">
              {menuItems.map(({ to, label }) => (
                <NavDropdown.Item key={to} as={NavLink} to={to}>
                  {label}
                </NavDropdown.Item>
              ))}
            </NavDropdown>
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
          {mobileNavItems.map(({ to, label, exact }) => (
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
          <button
            type="button"
            className="flex-fill text-center py-2 text-decoration-none small text-secondary border-0 bg-transparent"
            style={{ fontSize: '0.65rem' }}
            onClick={() => setShowMenu(true)}
          >
            ☰ Menu
          </button>
        </div>
      </nav>

      {/* Mobile offcanvas menu */}
      <Offcanvas
        show={showMenu}
        onHide={() => setShowMenu(false)}
        placement="bottom"
        className="bg-dark text-white"
        style={{ maxHeight: '60vh' }}
      >
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <ListGroup variant="flush">
            {menuItems.map(({ to, label }) => (
              <ListGroup.Item
                key={to}
                action
                as={NavLink}
                to={to}
                className="bg-dark text-white border-secondary"
                onClick={() => setShowMenu(false)}
              >
                {label}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Search drawer */}
      <SearchDrawer show={showSearch} onHide={() => setShowSearch(false)} />

      {/* Background refresh throbber */}
      {isFetching > 0 && (
        <div className="refresh-throbber">
          <Spinner animation="border" size="sm" variant="secondary" />
        </div>
      )}
    </div>
  );
}
