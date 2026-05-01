import { Container, Navbar, Nav } from 'react-bootstrap';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: '🏠 Dashboard', exact: true },
  { to: '/all-recipes', label: '📖 All Recipes' },
  { to: '/search', label: '🔍 Search' },
  { to: '/meal-plan', label: '📅 Meal Plan' },
  { to: '/shopping', label: '🛒 Shopping' },
];

export function Layout() {
  const navigate = useNavigate();

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
        style={{ zIndex: 1030 }}
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
    </div>
  );
}
