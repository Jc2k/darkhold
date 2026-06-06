import type React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Card, Col, ProgressBar, Row } from 'react-bootstrap';
import {
  BarChartLine,
  Calendar3,
  CloudSun,
  Diagram3,
  InfoCircle,
  Stars,
  Tags,
} from 'react-bootstrap-icons';
import { LoadingMascot } from '../components/LoadingMascot';
import { useRecipeStats } from '../hooks/useRecipeStats';
import {
  mealAssistantDayNumberToDate,
  type MealAssistantRecipeHistory,
  type MealAssistantTrend,
} from '../utils/mealAssistantPrecalculation';
import { describeCalendarAppointmentFeature } from '../utils/calendarFeatures';
import { weatherTagLabel } from '../utils/weatherFeatures';

interface BarDatum {
  label: string;
  value: number;
  detail?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const SEASON_LABELS = ['Winter', 'Spring', 'Summer', 'Autumn'];
const MIN_CHART_TOTAL = 3;
const MIN_CHART_CATEGORIES = 2;
const TOP_SIMILAR_RECIPE_COUNT = 5;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function hasEnoughChartData(data: BarDatum[], total: number): boolean {
  return (
    total >= MIN_CHART_TOTAL && data.filter((item) => item.value > 0).length >= MIN_CHART_CATEGORIES
  );
}

function trendData(
  record: Record<string, MealAssistantTrend>,
  labelForKey: (key: string) => string,
): BarDatum[] {
  return Object.entries(record)
    .map(([key, trend]) => ({
      label: labelForKey(key),
      value: trend.count,
      detail: `${formatPercent(trend.share)} of ${pluralize(trend.total, 'plan')}`,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function monthData(history: MealAssistantRecipeHistory): BarDatum[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const dayNumber of history.dates) {
    const month = new Date(`${mealAssistantDayNumberToDate(dayNumber)}T00:00:00Z`).getUTCMonth();
    counts[month] += 1;
  }
  return counts.map((value, index) => ({ label: MONTH_LABELS[index], value }));
}

function MiniBarChart({
  data,
  total,
  ariaLabel,
}: {
  data: BarDatum[];
  total: number;
  ariaLabel: string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="recipe-stats-chart" role="img" aria-label={ariaLabel}>
      {data.map((item) => {
        const percent = total > 0 ? item.value / total : 0;
        return (
          <div className="recipe-stats-chart-row" key={item.label}>
            <span className="recipe-stats-chart-label">{item.label}</span>
            <div className="recipe-stats-chart-track" aria-hidden="true">
              <div
                className="recipe-stats-chart-bar"
                style={{
                  width: `${item.value === 0 ? 0 : Math.max(4, (item.value / max) * 100)}%`,
                }}
              />
            </div>
            <span className="recipe-stats-chart-value">
              {item.value}
              <span className="text-muted ms-1">{formatPercent(percent)}</span>
            </span>
            {item.detail && (
              <span className="recipe-stats-chart-detail text-muted">{item.detail}</span>
            )}
          </div>
        );
      })}
    </div>
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

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="recipe-stats-section">
      <h3 className="h4 d-flex align-items-center gap-2 mb-3">
        <span className="recipe-stats-section-icon">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function RecipeStats() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useRecipeStats(id);

  if (isLoading && !data) return <LoadingMascot />;
  if (isError) return <Alert variant="danger">Failed to load recipe statistics.</Alert>;
  if (!data) return <Alert variant="warning">Recipe statistics are not available yet.</Alert>;
  if (!data.recipe || !data.features || !data.history || !data.insights) {
    return (
      <Alert variant="warning">
        No nightly meal-assistant statistics were found for this recipe.
      </Alert>
    );
  }

  const {
    recipe,
    features,
    history,
    insights,
    planningSignals,
    cluster,
    clusterDetail,
    similarities,
    recipesById,
  } = data;
  const total = history.totalPlanCount;
  const dayData = history.dayCounts.map((value, index) => ({ label: DAY_LABELS[index], value }));
  const seasonData = history.seasonCounts.map((value, index) => ({
    label: SEASON_LABELS[index],
    value,
  }));
  const months = monthData(history);
  const weatherData = trendData(insights.weather, weatherTagLabel);
  const calendarData = trendData(insights.calendar, describeCalendarAppointmentFeature);
  const firstDate =
    history.firstPlannedDate == null
      ? null
      : mealAssistantDayNumberToDate(history.firstPlannedDate);
  const lastDate =
    history.lastPlannedDate == null ? null : mealAssistantDayNumberToDate(history.lastPlannedDate);
  const topSimilar = similarities.slice(0, TOP_SIMILAR_RECIPE_COUNT);

  return (
    <div className="recipe-stats-page">
      <div className="recipe-stats-hero rounded mb-4">
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <Badge bg="light" text="dark" className="recipe-stats-eyebrow">
              Meal assistant replay
            </Badge>
            <span className="text-white-50 small">Generated {formatDate(data.generatedAt)}</span>
          </div>
          <h2 className="display-5 fw-bold mb-2">{recipe.name}</h2>
          <p className="lead mb-0">
            The debugging readout behind why this recipe stands out statistically.
          </p>
        </div>
        <Link to={`/recipe/${recipe.id}`} className="btn btn-light">
          Back to recipe
        </Link>
      </div>

      <Row className="g-3 mb-4">
        <Col md={3} sm={6}>
          <StatCard label="planned" value={total} detail="historic meal-plan entries" />
        </Col>
        <Col md={3} sm={6}>
          <StatCard
            label="complexity"
            value={features.complexityBucket}
            detail={`${features.complexityScore} assistant score`}
          />
        </Col>
        <Col md={3} sm={6}>
          <StatCard
            label="ingredients"
            value={features.distinctFoodCount}
            detail={`${features.ingredientLineCount} lines, ${features.stepCount} steps`}
          />
        </Col>
        <Col md={3} sm={6}>
          <StatCard
            label="affinity"
            value={cluster?.label ?? 'solo'}
            detail={cluster ? `${cluster.size} compatible recipes` : 'no affinity cluster'}
          />
        </Col>
      </Row>

      <Section icon={<Diagram3 />} title="Affinity">
        <Row className="g-3">
          <Col lg={5}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 text-uppercase text-muted">Affinity group</h4>
                {cluster ? (
                  <>
                    <div className="h3 mb-2">{cluster.label}</div>
                    <p className="text-muted mb-2">
                      Affinity cluster {cluster.clusterId} contains{' '}
                      {pluralize(clusterDetail?.size ?? cluster.size, 'recipe')}.
                    </p>
                    <div className="d-flex flex-wrap gap-2">
                      {cluster.labelTerms.map((term) => (
                        <Badge bg="primary" key={term}>
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0">
                    This recipe does not currently belong to a multi-recipe affinity cluster.
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col lg={7}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 text-uppercase text-muted">Nearest neighbours</h4>
                {topSimilar.length > 0 ? (
                  <div className="d-grid gap-3">
                    {topSimilar.map((similar) => {
                      const similarRecipe = recipesById[String(similar.recipeId)];
                      return (
                        <div key={similar.recipeId}>
                          <div className="d-flex justify-content-between gap-3">
                            <Link to={`/recipe/${similar.recipeId}/stats`}>
                              {similarRecipe?.name ?? `Recipe #${similar.recipeId}`}
                            </Link>
                            <span className="fw-semibold">{formatPercent(similar.score)}</span>
                          </div>
                          <ProgressBar
                            now={similar.score * 100}
                            className="recipe-stats-progress my-1"
                          />
                          {similar.sharedTerms.length > 0 && (
                            <div className="small text-muted">
                              Shared: {similar.sharedTerms.join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted mb-0">
                    No compatible recipe swaps crossed the assistant threshold.
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Section>

      <Section icon={<Calendar3 />} title="Date">
        <Row className="g-3">
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 text-uppercase text-muted">Days</h4>
                {hasEnoughChartData(dayData, total) ? (
                  <MiniBarChart data={dayData} total={total} ariaLabel="Day of week distribution" />
                ) : (
                  <p className="text-muted mb-0">
                    Not enough day-of-week history for a useful chart.
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 text-uppercase text-muted">Months</h4>
                {hasEnoughChartData(months, total) ? (
                  <MiniBarChart data={months} total={total} ariaLabel="Month distribution" />
                ) : (
                  <p className="text-muted mb-0">Not enough month history for a useful chart.</p>
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 text-uppercase text-muted">Seasons</h4>
                {hasEnoughChartData(seasonData, total) ? (
                  <MiniBarChart data={seasonData} total={total} ariaLabel="Season distribution" />
                ) : (
                  <p className="text-muted mb-0">Not enough seasonal history for a useful chart.</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <Card className="mt-3">
          <Card.Body className="d-flex flex-wrap gap-3 text-muted">
            <span>
              First planned: <strong>{firstDate ? formatDate(firstDate) : 'unknown'}</strong>
            </span>
            <span>
              Last planned: <strong>{lastDate ? formatDate(lastDate) : 'unknown'}</strong>
            </span>
            <span>
              Average gap:{' '}
              <strong>
                {history.averageDaysBetweenPlans == null
                  ? 'n/a'
                  : pluralize(Math.round(history.averageDaysBetweenPlans), 'day')}
              </strong>
            </span>
            <span>
              Median gap:{' '}
              <strong>
                {history.medianDaysBetweenPlans == null
                  ? 'n/a'
                  : pluralize(Math.round(history.medianDaysBetweenPlans), 'day')}
              </strong>
            </span>
          </Card.Body>
        </Card>
      </Section>

      <Section icon={<Stars />} title="Planning signals">
        <Card>
          <Card.Body>
            {planningSignals.length > 0 ? (
              <div className="d-flex flex-wrap gap-2">
                {planningSignals.map((signal) => (
                  <Badge bg="primary" key={signal.key} className="text-wrap text-start">
                    {signal.label} · score {signal.score} · {signal.count}/{signal.total}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted mb-0">
                No month, season, weather, or calendar planning signal has enough support yet.
              </p>
            )}
          </Card.Body>
        </Card>
      </Section>

      <Section icon={<CloudSun />} title="Weather">
        <Card>
          <Card.Body>
            {weatherData.length > 0 ? (
              <MiniBarChart
                data={weatherData}
                total={total}
                ariaLabel="Weather trend distribution"
              />
            ) : (
              <p className="text-muted mb-0">
                No weather trend has enough support in the collected nightly statistics.
              </p>
            )}
          </Card.Body>
        </Card>
      </Section>

      <Section icon={<Calendar3 />} title="Calendar">
        <Card>
          <Card.Body>
            {calendarData.length > 0 ? (
              <MiniBarChart
                data={calendarData}
                total={total}
                ariaLabel="Calendar trend distribution"
              />
            ) : (
              <p className="text-muted mb-0">
                No calendar trend has enough support in the collected nightly statistics.
              </p>
            )}
          </Card.Body>
        </Card>
      </Section>

      <Section icon={<Stars />} title="Other">
        <Row className="g-3">
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 d-flex align-items-center gap-2">
                  <Tags /> Recipe signals
                </h4>
                <div className="d-flex flex-wrap gap-2">
                  {[...features.keywords, ...(features.categories ?? []), ...features.produce]
                    .length > 0 ? (
                    [...features.keywords, ...(features.categories ?? []), ...features.produce].map(
                      (term) => (
                        <Badge bg="secondary" key={term}>
                          {term}
                        </Badge>
                      ),
                    )
                  ) : (
                    <span className="text-muted">
                      No keyword, category, or produce signals collected.
                    </span>
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 d-flex align-items-center gap-2">
                  <BarChartLine /> Build profile
                </h4>
                <dl className="row mb-0 small">
                  <dt className="col-7">Cooking time</dt>
                  <dd className="col-5 text-end">{features.cookingTimeMinutes ?? 0} min</dd>
                  <dt className="col-7">Waiting time</dt>
                  <dd className="col-5 text-end">{features.waitingTimeMinutes ?? 0} min</dd>
                  <dt className="col-7">Total time</dt>
                  <dd className="col-5 text-end">{features.totalTimeMinutes ?? 0} min</dd>
                  <dt className="col-7">Servings</dt>
                  <dd className="col-5 text-end">{features.servings ?? 'n/a'}</dd>
                </dl>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={4}>
            <Card className="h-100">
              <Card.Body>
                <h4 className="h6 d-flex align-items-center gap-2">
                  <InfoCircle /> Nutrition signal
                </h4>
                {insights.nutrition ? (
                  <dl className="row mb-0 small">
                    <dt className="col-7">Assistant score</dt>
                    <dd className="col-5 text-end">{insights.nutrition.score}</dd>
                    <dt className="col-7">Protein</dt>
                    <dd className="col-5 text-end">
                      {insights.nutrition.proteinG == null
                        ? 'n/a'
                        : `${insights.nutrition.proteinG} g`}
                    </dd>
                    <dt className="col-7">Calories</dt>
                    <dd className="col-5 text-end">
                      {insights.nutrition.caloriesKcal == null
                        ? 'n/a'
                        : `${insights.nutrition.caloriesKcal} kcal`}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-muted mb-0">No nutrition signal was collected.</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Section>
    </div>
  );
}
