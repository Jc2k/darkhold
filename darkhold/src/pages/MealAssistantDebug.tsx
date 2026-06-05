import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import {
  Activity,
  Bug,
  Calendar3,
  CheckCircle,
  CloudSun,
  Diagram3,
  ExclamationTriangle,
  PlayCircle,
  Terminal,
} from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { LoadingMascot } from '../components/LoadingMascot';
import {
  useMealAssistantDebug,
  useMealAssistantNightlyStatus,
  useMealAssistantPrecalculationMutation,
} from '../hooks/useMealAssistantDebug';
import {
  buildMealAssistantDebugStats,
  type MealAssistantDebugGroup,
  type MealAssistantDebugTopRecipe,
  type MealAssistantDebugWeekdayRecipeSignal,
} from '../utils/mealAssistantDebugStats';
import {
  useMealAssistantPrecalculationSocket,
  type MealAssistantPrecalculationEvent,
} from '../hooks/useInvalidationSocket';

function formatDateTime(value: string | undefined): string {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatPValue(value: number): string {
  if (value < 0.001) return '< 0.001';
  if (value < 0.01) return value.toFixed(3);
  return value.toFixed(2);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function SchemaBadge({ actual, expected }: { actual?: number; expected: number }) {
  const isCurrent = actual === expected;
  return (
    <Badge bg={isCurrent ? 'success' : 'danger'} className="fs-6">
      {actual == null ? 'missing' : actual} / expected {expected}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card className="recipe-stats-kpi h-100">
      <Card.Body>
        <div className="text-uppercase text-muted small fw-semibold">{label}</div>
        <div className="display-6 fw-bold">{value}</div>
        {detail && <div className="text-muted small">{detail}</div>}
      </Card.Body>
    </Card>
  );
}

function RecipeRow({ recipe, total }: { recipe: MealAssistantDebugTopRecipe; total: number }) {
  const percent = total > 0 ? recipe.count / total : recipe.share;
  return (
    <tr>
      <td>
        <Link to={`/recipe/${recipe.recipeId}`}>{recipe.name}</Link>
      </td>
      <td className="text-end text-nowrap">{recipe.count.toLocaleString()}</td>
      <td className="text-end text-nowrap text-muted">{formatPercent(percent)}</td>
    </tr>
  );
}

function TopRecipeTable({ group }: { group: MealAssistantDebugGroup }) {
  if (group.total === 0 || group.recipes.length === 0) {
    return <p className="text-muted mb-0">No meal-plan history was available for this bucket.</p>;
  }

  return (
    <Table responsive size="sm" className="mb-0 align-middle">
      <thead>
        <tr>
          <th>Recipe</th>
          <th className="text-end">Plans</th>
          <th className="text-end">Share</th>
        </tr>
      </thead>
      <tbody>
        {group.recipes.map((recipe) => (
          <RecipeRow key={recipe.recipeId} recipe={recipe} total={group.total} />
        ))}
      </tbody>
    </Table>
  );
}

function WeekdaySignalTable({ signals }: { signals: MealAssistantDebugWeekdayRecipeSignal[] }) {
  if (signals.length === 0) {
    return (
      <Alert variant="secondary" className="mb-0">
        No recipe has enough weekday concentration to clear the current p &lt; 0.05 significance
        threshold.
      </Alert>
    );
  }

  return (
    <Table responsive size="sm" className="mb-0 align-middle">
      <thead>
        <tr>
          <th>Recipe</th>
          <th>Most likely day(s)</th>
          <th className="text-end">Observed</th>
          <th className="text-end">Expected if random</th>
          <th className="text-end">Adjusted p-value</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((signal) => {
          const signalCount = signal.days.reduce((total, day) => total + day.count, 0);
          return (
            <tr key={signal.recipeId}>
              <td>
                <Link to={`/recipe/${signal.recipeId}`}>{signal.name}</Link>
                <div className="text-muted small">{pluralize(signal.total, 'historical plan')}</div>
              </td>
              <td>
                <div className="d-flex flex-wrap gap-1">
                  {signal.days.map((day) => (
                    <Badge bg="primary" key={day.label}>
                      {day.label} · {day.count.toLocaleString()}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="text-end text-nowrap">{formatPercent(signalCount / signal.total)}</td>
              <td className="text-end text-nowrap text-muted">
                {formatPercent(signal.expectedShare)}
              </td>
              <td className="text-end text-nowrap">{formatPValue(signal.pValue)}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function GroupCard({ group }: { group: MealAssistantDebugGroup }) {
  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex align-items-start justify-content-between gap-3 mb-2">
          <h4 className="h6 mb-0">{group.label}</h4>
          <Badge bg="secondary">{pluralize(group.total, 'plan')}</Badge>
        </div>
        <TopRecipeTable group={group} />
      </Card.Body>
    </Card>
  );
}

function GroupGrid({
  groups,
  emptyMessage,
}: {
  groups: MealAssistantDebugGroup[];
  emptyMessage: string;
}) {
  const visibleGroups = groups.filter((group) => group.total > 0);
  if (visibleGroups.length === 0) return <Alert variant="secondary">{emptyMessage}</Alert>;

  return (
    <Row className="g-3">
      {visibleGroups.map((group) => (
        <Col lg={4} md={6} key={group.label}>
          <GroupCard group={group} />
        </Col>
      ))}
    </Row>
  );
}

function isRunningPrecalculation(events: MealAssistantPrecalculationEvent[]): boolean {
  const latest = events[0];
  return latest?.status === 'started' || latest?.status === 'progress';
}

function PrecalculationControls({
  events,
  onRun,
  isPending,
  triggerError,
}: {
  events: MealAssistantPrecalculationEvent[];
  onRun: () => void;
  isPending: boolean;
  triggerError: boolean;
}) {
  const isRunning = isRunningPrecalculation(events);
  const latest = events[0];
  const buttonDisabled = isPending || isRunning;

  return (
    <Card className="mb-4">
      <Card.Body>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <h3 className="h5 d-flex align-items-center gap-2 mb-1">
              <PlayCircle aria-hidden="true" />
              Manual precalculation
            </h3>
            <p className="text-muted mb-0">
              Force the background precalculation step to start now. If another run is already in
              progress, the server will keep the existing run and stream its websocket events here.
            </p>
          </div>
          <Button variant="primary" onClick={onRun} disabled={buttonDisabled}>
            {isPending || isRunning ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                Precalculating
              </>
            ) : (
              'Run precalculation'
            )}
          </Button>
        </div>
        {triggerError && (
          <Alert variant="danger" className="mt-3 mb-0">
            Failed to request a meal assistant precalculation run.
          </Alert>
        )}
        {latest && (
          <div className="mt-3">
            <div className="d-flex align-items-center gap-2 text-muted small mb-2">
              <Terminal aria-hidden="true" />
              Latest websocket progress
            </div>
            <ListGroup variant="flush" className="border rounded">
              {events.slice(0, 8).map((event) => (
                <ListGroup.Item key={`${event.runId}-${event.updatedAt}-${event.message}`}>
                  <div className="d-flex flex-wrap justify-content-between gap-2">
                    <span className="fw-semibold text-capitalize">{event.status}</span>
                    <span className="text-muted small">{formatDateTime(event.updatedAt)}</span>
                  </div>
                  <div>{event.message}</div>
                  {event.detail && <div className="text-muted small">{event.detail}</div>}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function StatusAlert({
  status,
}: {
  status: ReturnType<typeof useMealAssistantNightlyStatus>['data'];
}) {
  if (!status) {
    return (
      <Alert variant="warning" className="d-flex gap-2 align-items-start">
        <ExclamationTriangle className="mt-1" aria-hidden="true" />
        <div>No nightly task status file has been written yet.</div>
      </Alert>
    );
  }

  const variant =
    status.status === 'success' ? 'success' : status.status === 'skipped' ? 'warning' : 'danger';
  const Icon = status.status === 'success' ? CheckCircle : ExclamationTriangle;

  return (
    <Alert variant={variant} className="d-flex gap-2 align-items-start">
      <Icon className="mt-1" aria-hidden="true" />
      <div className="w-100">
        <div className="fw-semibold">{status.message}</div>
        <div className="small">
          Last updated {formatDateTime(status.updatedAt)}
          {status.lastSuccessAt ? ` · Last success ${formatDateTime(status.lastSuccessAt)}` : ''}
        </div>
        {status.detail && <div className="small mt-2">{status.detail}</div>}
        {status.error && <pre className="meal-assistant-debug-error mt-2 mb-0">{status.error}</pre>}
      </div>
    </Alert>
  );
}

export function MealAssistantDebug() {
  const [precalculationEvents, setPrecalculationEvents] = useState<
    MealAssistantPrecalculationEvent[]
  >([]);
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<number | undefined>();
  const handlePrecalculationEvent = useCallback((event: MealAssistantPrecalculationEvent) => {
    setPrecalculationEvents((current) => [event, ...current].slice(0, 20));
  }, []);
  useMealAssistantPrecalculationSocket(handlePrecalculationEvent);

  const { data, isLoading, isError } = useMealAssistantDebug();
  const { data: status, isError: isStatusError } = useMealAssistantNightlyStatus();
  const precalculationMutation = useMealAssistantPrecalculationMutation();
  const runPrecalculation = useCallback(() => {
    precalculationMutation.mutate();
  }, [precalculationMutation]);

  const defaultMealTypeId = useMemo(() => {
    const mealTypes = data?.precalculation?.mealTypes ?? [];
    return (
      mealTypes.find((mealType) => mealType.name?.toLowerCase().includes('dinner'))?.id ??
      mealTypes[0]?.id
    );
  }, [data?.precalculation?.mealTypes]);
  const effectiveMealTypeId = selectedMealTypeId ?? defaultMealTypeId;
  const stats = useMemo(
    () =>
      data?.precalculation
        ? buildMealAssistantDebugStats(data.precalculation, effectiveMealTypeId)
        : data?.stats,
    [data?.precalculation, data?.stats, effectiveMealTypeId],
  );
  const schemaStatus = data?.schemaStatus;
  const generatedAt = stats?.generatedAt ?? data?.generatedAt;

  if (isLoading && !data) return <LoadingMascot />;
  if (isError) return <Alert variant="danger">Failed to load meal assistant debug data.</Alert>;

  return (
    <div className="recipe-stats-page">
      <div className="recipe-stats-hero rounded mb-4">
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <Badge bg="light" text="dark" className="recipe-stats-eyebrow">
              Internals debugging
            </Badge>
            {generatedAt && (
              <span className="text-white-50 small">
                Last updated {formatDateTime(generatedAt)}
              </span>
            )}
          </div>
          <h2 className="display-5 fw-bold mb-2">Meal planning assistant</h2>
          <p className="lead mb-0">
            Nightly precalculation health, schema state, and the highest-signal recipe patterns.
          </p>
        </div>
        {schemaStatus && (
          <div className="text-md-end">
            <div className="text-white-50 small mb-1">Schema version</div>
            <SchemaBadge
              actual={schemaStatus.actualSchemaVersion}
              expected={schemaStatus.expectedSchemaVersion}
            />
          </div>
        )}
      </div>

      <PrecalculationControls
        events={precalculationEvents}
        onRun={runPrecalculation}
        isPending={precalculationMutation.isPending}
        triggerError={precalculationMutation.isError}
      />

      {isStatusError ? (
        <Alert variant="danger">Failed to load the meal assistant nightly status file.</Alert>
      ) : (
        <StatusAlert status={status} />
      )}

      {!data?.hasPrecalculationFile && (
        <Alert variant="warning">
          No meal assistant precalculation file is available yet. The dashboard will populate after
          the nightly task succeeds.
        </Alert>
      )}
      {data?.hasPrecalculationFile && !data.isReadablePrecalculation && (
        <Alert variant="danger">
          A precalculation file exists, but it is not compatible with this app build. The schema
          badge above shows whether the file is old.
        </Alert>
      )}

      {stats && (
        <>
          {stats.mealTypes.length > 0 && (
            <Card className="mb-4">
              <Card.Body>
                <Form.Group controlId="meal-assistant-debug-meal-type">
                  <Form.Label className="fw-semibold">Meal type</Form.Label>
                  <Form.Select
                    value={effectiveMealTypeId ?? ''}
                    onChange={(event) => {
                      const value = Number.parseInt(event.currentTarget.value, 10);
                      setSelectedMealTypeId(Number.isFinite(value) ? value : undefined);
                    }}
                  >
                    {stats.mealTypes.map((mealType) => (
                      <option key={mealType.id} value={mealType.id}>
                        {mealType.label} ({pluralize(mealType.planCount, 'plan')})
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text>
                    Debug comparisons use only historical plans from the selected meal type.
                  </Form.Text>
                </Form.Group>
              </Card.Body>
            </Card>
          )}

          <Row className="g-3 mb-4">
            <Col md={4}>
              <StatCard label="Recipes indexed" value={stats.recipeCount.toLocaleString()} />
            </Col>
            <Col md={4}>
              <StatCard label="Historical plans" value={stats.plannedMealCount.toLocaleString()} />
            </Col>
            <Col md={4}>
              <StatCard
                label="Recipes with history"
                value={stats.activeRecipeCount.toLocaleString()}
                detail={`${formatPercent(stats.recipeCount > 0 ? stats.activeRecipeCount / stats.recipeCount : 0)} of indexed recipes`}
              />
            </Col>
          </Row>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <Activity />
              </span>
              Weekday vs weekend
            </h3>
            <Row className="g-3">
              <Col lg={6}>
                <GroupCard group={stats.weekdayMeals} />
              </Col>
              <Col lg={6}>
                <GroupCard group={stats.weekendMeals} />
              </Col>
            </Row>
          </section>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <Calendar3 />
              </span>
              Recipe weekday signals
            </h3>
            <p className="text-muted">
              This looks at each recipe first, then asks whether its history is concentrated on one
              or two weekdays more than a random weekday distribution would suggest. P-values are
              Bonferroni-adjusted for checking all one-day and two-day combinations.
            </p>
            <Card>
              <Card.Body>
                <WeekdaySignalTable signals={stats.recipeWeekdaySignals} />
              </Card.Body>
            </Card>
          </section>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <Calendar3 />
              </span>
              Most common recipes within each weekday
            </h3>
            <GroupGrid groups={stats.weekdays} emptyMessage="No weekday history was available." />
          </section>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <Calendar3 />
              </span>
              Most common recipes by month and season
            </h3>
            <GroupGrid
              groups={[...stats.months, ...stats.seasons]}
              emptyMessage="No monthly or seasonal history was available."
            />
          </section>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <Diagram3 />
              </span>
              Identified clusters
            </h3>
            <GroupGrid groups={stats.clusters} emptyMessage="No recipe clusters were identified." />
          </section>

          <section className="recipe-stats-section">
            <h3 className="h4 d-flex align-items-center gap-2 mb-3">
              <span className="recipe-stats-section-icon">
                <CloudSun />
              </span>
              Weather and calendar signals
            </h3>
            <Row className="g-3">
              <Col lg={6}>
                <h4 className="h5">Weather</h4>
                <GroupGrid
                  groups={stats.weather}
                  emptyMessage="No weather-backed recipe signals have enough support yet."
                />
              </Col>
              <Col lg={6}>
                <h4 className="h5">Calendar</h4>
                <GroupGrid
                  groups={stats.calendar}
                  emptyMessage="No calendar-backed recipe signals have enough support yet."
                />
              </Col>
            </Row>
          </section>
        </>
      )}

      <Card>
        <Card.Body className="d-flex gap-2 align-items-start text-muted">
          <Bug className="mt-1" aria-hidden="true" />
          <div>
            Data comes from <code>/meal-assistant-precalculation.json</code> and nightly status from{' '}
            <code>/meal-assistant-status.json</code>. Successful runs now write an explicit status
            file so this page can distinguish success, skipped, missing, incompatible, and failed
            states.
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
