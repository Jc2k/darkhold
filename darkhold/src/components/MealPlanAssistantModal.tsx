import { Alert, Badge, Button, ListGroup, Modal } from 'react-bootstrap';
import type { MealPlan, Recipe } from '../api/tandoor-types';
import type { MealAssistantSlotPlan } from '../utils/mealPlanningAssistant';
import { parseLocalDate } from '../utils/dateUtils';
import { proxyMediaUrl } from '../utils/mediaUrl';

interface Props {
  analysis: MealAssistantSlotPlan | null;
  currentEntry?: MealPlan | null;
  isSwitching?: boolean;
  onSelectAlternative?: (recipe: Recipe) => void;
  onHide: () => void;
}

function formatScore(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMealPlannerDate(value: string): string {
  const parsed = parseLocalDate(value);
  return parsed
    ? parsed.toLocaleDateString('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : value;
}

const SCORE_BADGE_CLASS = 'd-inline-flex align-items-center justify-content-center text-center';

function sortScoreComponents(
  components: MealAssistantSlotPlan['selected']['components'],
  direction: 'positive' | 'negative' | 'neutral',
) {
  if (direction === 'positive') {
    return components
      .filter((component) => component.score > 0)
      .slice()
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  }
  if (direction === 'negative') {
    return components
      .filter((component) => component.score < 0)
      .slice()
      .sort((left, right) => left.score - right.score || left.label.localeCompare(right.label));
  }
  return components
    .filter((component) => component.score === 0)
    .slice()
    .sort((left, right) => left.label.localeCompare(right.label));
}

function ScoreComponentList({
  components,
  badgeVariant,
}: {
  components: MealAssistantSlotPlan['selected']['components'];
  badgeVariant: 'success' | 'danger' | 'secondary';
}) {
  return (
    <ListGroup>
      {components.map((component) => (
        <ListGroup.Item key={component.key} className="d-flex justify-content-between gap-3">
          <div>
            <div className="fw-semibold">{component.label}</div>
            <div className="text-muted small">{component.detail}</div>
          </div>
          <Badge bg={badgeVariant} pill className={SCORE_BADGE_CLASS}>
            {formatScore(component.score)}
          </Badge>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
}

function buildAlternativeReason(
  alternative: MealAssistantSlotPlan['alternatives'][number],
  selectedScore: number,
): string {
  const scoreGap = selectedScore - alternative.score;
  const penalties = sortScoreComponents(alternative.components, 'negative').slice(0, 2);
  if (penalties.length > 0) {
    return `Why not: ${penalties.map((penalty) => penalty.detail).join(' · ')}`;
  }
  const positives = sortScoreComponents(alternative.components, 'positive').slice(0, 2);
  if (scoreGap > 0 && positives.length > 0) {
    return `Why not: ${scoreGap} points behind despite ${positives
      .map((positive) => positive.detail)
      .join(' · ')}`;
  }
  const neutrals = sortScoreComponents(alternative.components, 'neutral').slice(0, 1);
  if (neutrals.length > 0) return `Why not: ${neutrals[0].detail}`;
  return scoreGap > 0
    ? `Why not: ${scoreGap} points behind the selected meal.`
    : 'Close fallback with a similar score profile.';
}

function RecipePreview({ recipe, title }: { recipe: Recipe; title?: string }) {
  return (
    <div className="d-flex align-items-center gap-3">
      <img
        src={recipe.image ? proxyMediaUrl(recipe.image) : undefined}
        alt=""
        width={72}
        height={72}
        className="rounded border flex-shrink-0"
        style={{ objectFit: 'cover' }}
      />
      <div className="min-w-0">
        {title && <div className="text-muted small">{title}</div>}
        <div className="fw-semibold">{recipe.name}</div>
      </div>
    </div>
  );
}

function AlternativeRecipePreview({
  recipe,
  score,
  reasons,
  warnings,
  isSwitching,
  onSelect,
}: {
  recipe: Recipe;
  score: number;
  reasons: string;
  warnings: string[];
  isSwitching?: boolean;
  onSelect?: (recipe: Recipe) => void;
}) {
  return (
    <div className="d-flex align-items-start gap-3">
      <img
        src={recipe.image ? proxyMediaUrl(recipe.image) : undefined}
        alt=""
        width={72}
        height={72}
        className="rounded border flex-shrink-0"
        style={{ objectFit: 'cover' }}
      />
      <div className="d-flex justify-content-between align-items-start gap-3 flex-grow-1 min-w-0">
        <div className="min-w-0">
          <div className="fw-semibold">{recipe.name}</div>
          <div className="text-muted small">{reasons}</div>
          {warnings.length > 0 && (
            <div className="text-warning-emphasis small mt-1">{warnings.join(' · ')}</div>
          )}
        </div>
        <div className="d-flex flex-column align-items-end gap-2 flex-shrink-0">
          <Badge bg="light" text="dark" pill className={SCORE_BADGE_CLASS}>
            {score}
          </Badge>
          {onSelect && (
            <Button
              variant="secondary"
              size="sm"
              disabled={isSwitching}
              aria-label={`Use ${recipe.name} instead`}
              onClick={() => onSelect(recipe)}
            >
              {isSwitching ? 'Switching…' : 'Use this meal'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MealPlanAssistantModal({
  analysis,
  currentEntry,
  isSwitching,
  onSelectAlternative,
  onHide,
}: Props) {
  if (!analysis) return null;

  const selectedPositiveFactors = sortScoreComponents(
    analysis.selected.components,
    'positive',
  ).slice(0, 5);
  const selectedPenalties = sortScoreComponents(analysis.selected.components, 'negative').slice(
    0,
    5,
  );
  const selectedNeutralFactors = sortScoreComponents(analysis.selected.components, 'neutral').slice(
    0,
    4,
  );
  const hardExclusions = (analysis.hardExclusions ?? []).slice(0, 5);
  const currentDate = currentEntry?.from_date.split('T')[0] ?? analysis.date;
  const modalDate = formatMealPlannerDate(currentDate);

  return (
    <Modal
      show={!!analysis}
      onHide={onHide}
      centered
      size="lg"
      scrollable
      dialogClassName="meal-plan-assistant-modal"
      contentClassName="meal-plan-assistant-modal-content"
    >
      <Modal.Header closeButton className="meal-plan-assistant-modal-header">
        <Modal.Title className="fs-6 d-flex align-items-center gap-2 flex-wrap">
          <span>{modalDate}</span>
          <Badge bg="secondary">{analysis.roleLabel}</Badge>
          <Badge bg="light" text="dark" className={SCORE_BADGE_CLASS}>
            Score {analysis.selected.score}
          </Badge>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="meal-plan-assistant-modal-body">
        <section className="mb-4">
          <RecipePreview recipe={analysis.selected.recipe} title="Current meal" />
        </section>

        <section className="mb-4">
          <h6 className="mb-2">Why it was selected</h6>
          {analysis.roleFlavourDetail && (
            <p className="text-muted small mb-2">{analysis.roleFlavourDetail}</p>
          )}
          <div className="d-grid gap-3">
            <div>
              <div className="fw-semibold small mb-2">Top positive factors</div>
              {selectedPositiveFactors.length > 0 ? (
                <ScoreComponentList components={selectedPositiveFactors} badgeVariant="success" />
              ) : (
                <p className="text-muted small mb-0">
                  No positive scoring signals stood out; neutral eligibility and penalties explain
                  the choice instead.
                </p>
              )}
            </div>

            {selectedPenalties.length > 0 && (
              <div>
                <div className="fw-semibold small mb-2">Top penalties</div>
                <ScoreComponentList components={selectedPenalties} badgeVariant="danger" />
              </div>
            )}

            {selectedNeutralFactors.length > 0 && (
              <div>
                <div className="fw-semibold small mb-2">Neutral and balance factors</div>
                <ScoreComponentList components={selectedNeutralFactors} badgeVariant="secondary" />
              </div>
            )}
          </div>
        </section>

        {analysis.selected.warnings.length > 0 && (
          <section className="mb-4">
            <h6 className="mb-2">Warnings</h6>
            <Alert variant="warning" className="mb-0">
              <ul className="mb-0 ps-3">
                {analysis.selected.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          </section>
        )}

        <section>
          <h6 className="mb-2">Best alternatives</h6>
          {analysis.alternatives.length === 0 ? (
            <p className="text-muted small mb-0">No other suitable alternatives were retained.</p>
          ) : (
            <ListGroup>
              {analysis.alternatives.map((alternative) => (
                <ListGroup.Item key={alternative.recipe.id}>
                  <AlternativeRecipePreview
                    recipe={alternative.recipe}
                    score={alternative.score}
                    reasons={buildAlternativeReason(alternative, analysis.selected.score)}
                    warnings={alternative.warnings}
                    isSwitching={isSwitching}
                    onSelect={onSelectAlternative}
                  />
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </section>

        {hardExclusions.length > 0 && (
          <section className="mt-4">
            <h6 className="mb-2">Hard filters</h6>
            <ListGroup>
              {hardExclusions.map((exclusion) => (
                <ListGroup.Item key={exclusion.recipe.id}>
                  <div className="fw-semibold">
                    {exclusion.recipe.name} · {exclusion.reason}
                  </div>
                  <div className="text-muted small">{exclusion.detail}</div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </section>
        )}
      </Modal.Body>
    </Modal>
  );
}
