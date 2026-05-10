import {
  Container,
  Navbar,
  Nav,
  Spinner,
  NavDropdown,
  Offcanvas,
  ListGroup,
} from 'react-bootstrap';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  RocketTakeoff,
  Book,
  Search,
  CalendarDay,
  Cart4,
  JournalRichtext,
} from 'react-bootstrap-icons';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useInvalidationSocket } from '../hooks/useInvalidationSocket';

const navItems = [
  { to: '/dashboard', Icon: RocketTakeoff, label: 'Dashboard' },
  { to: '/all-recipes', Icon: Book, label: 'Recipes' },
  { to: '/search', Icon: Search, label: 'Search' },
  { to: '/meal-plan', Icon: CalendarDay, label: 'Plan' },
  { to: '/shopping', Icon: Cart4, label: 'Shopping' },
];

const menuItems = [
  { to: '/settings', icon: '⚙️', label: 'Settings' },
  { to: '/utilities/gas-marks', icon: '🔥', label: 'Gas Marks' },
  { to: '/utilities/unit-converter', icon: '📐', label: 'Unit Converter' },
  { to: '/utilities/rice-cooking', icon: '🍚', label: 'Rice Cooking' },
];

export function Layout() {
  const navigate = useNavigate();
  const isFetching = useIsFetching();
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries();
  }, [queryClient]);

  usePullToRefresh({ onRefresh: handleRefresh });
  useInvalidationSocket();

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Top navbar - desktop */}
      <Navbar bg="dark" variant="dark" expand="md" className="d-none d-md-flex px-3">
        <Navbar.Brand
          className="d-inline-flex align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <JournalRichtext className="me-2" /> Recipes
        </Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Nav className="me-auto">
            {navItems.map(({ to, Icon, label }) => (
              <Nav.Link key={to} as={NavLink} to={to}>
                <Icon className="me-1" /> {label}
              </Nav.Link>
            ))}
          </Nav>
          <Nav>
            <NavDropdown title="☰ Menu" id="desktop-menu-dropdown" align="end">
              {menuItems.map(({ to, icon, label }) => (
                <NavDropdown.Item key={to} as={NavLink} to={to}>
                  {icon} {label}
                </NavDropdown.Item>
              ))}
            </NavDropdown>
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      {/* Top navbar - mobile */}
      <Navbar
        bg="dark"
        variant="dark"
        className="d-md-none px-3 pb-2"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <Navbar.Brand
          className="d-inline-flex align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <JournalRichtext className="me-2" /> Recipes
        </Navbar.Brand>
        <button
          type="button"
          aria-label="Menu"
          className="ms-auto text-white border-0 bg-transparent"
          style={{ fontSize: '1.5rem' }}
          onClick={() => setShowMenu(true)}
        >
          ☰
        </button>
      </Navbar>

      {/* Page content */}
      <Container fluid className="flex-grow-1 py-3 pb-md-3 page-content">
        <Outlet />
      </Container>

      {/* Bottom tab bar - mobile */}
      <nav
        className="d-md-none fixed-bottom bg-dark border-top border-secondary"
        style={{ zIndex: 1030, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="d-flex">
          {navItems.map(({ to, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                `flex-fill text-center py-2 text-decoration-none ${isActive ? 'text-white fw-semibold' : 'text-secondary'}`
              }
              style={{ fontSize: '1.5rem' }}
            >
              <Icon />
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile offcanvas menu */}
      <Offcanvas
        show={showMenu}
        onHide={() => setShowMenu(false)}
        placement="bottom"
        scroll={true}
        className="bg-dark text-white"
        style={{ maxHeight: '60vh' }}
      >
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <ListGroup variant="flush">
            {menuItems.map(({ to, icon, label }) => (
              <ListGroup.Item
                key={to}
                action
                as={NavLink}
                to={to}
                className="bg-dark text-white border-secondary"
                onClick={() => setShowMenu(false)}
              >
                {icon} {label}
              </ListGroup.Item>
            ))}
          </ListGroup>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </Offcanvas.Body>
      </Offcanvas>

      {/* Background refresh throbber */}
      {isFetching > 0 && (
        <div className="refresh-throbber">
          <Spinner animation="border" size="sm" variant="secondary" />
        </div>
      )}
    </div>
  );
}
