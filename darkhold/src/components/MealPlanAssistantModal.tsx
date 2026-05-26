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
              variant="outline-secondary"
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

  const selectedReasons = analysis.selected.components.filter((component) => component.score > 0);
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
          {selectedReasons.length === 0 ? (
            <p className="text-muted small mb-0">
              This meal won mainly because other candidates scored lower.
            </p>
          ) : (
            <ListGroup>
              {selectedReasons.map((component) => (
                <ListGroup.Item
                  key={component.key}
                  className="d-flex justify-content-between gap-3"
                >
                  <div>
                    <div className="fw-semibold">{component.label}</div>
                    <div className="text-muted small">{component.detail}</div>
                  </div>
                  <Badge bg="success" pill className={SCORE_BADGE_CLASS}>
                    {formatScore(component.score)}
                  </Badge>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
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
              {analysis.alternatives.map((alternative) => {
                const topReasons = alternative.components
                  .filter((component) => component.score > 0)
                  .slice(0, 3);
                return (
                  <ListGroup.Item key={alternative.recipe.id}>
                    <AlternativeRecipePreview
                      recipe={alternative.recipe}
                      score={alternative.score}
                      reasons={
                        topReasons.length > 0
                          ? topReasons.map((reason) => reason.detail).join(' · ')
                          : 'Viable fallback with fewer positive signals.'
                      }
                      warnings={alternative.warnings}
                      isSwitching={isSwitching}
                      onSelect={onSelectAlternative}
                    />
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}
        </section>
      </Modal.Body>
    </Modal>
  );
}
