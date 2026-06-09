import { useMemo, useState } from 'react';
import { Alert, Button, Card, Form, ProgressBar, Stack } from 'react-bootstrap';
import { Clipboard, ClipboardCheck } from 'react-bootstrap-icons';
import { LoadingMascot } from '../components/LoadingMascot';
import { useYearInFoodSummary } from '../hooks/useYearInFoodSummary';
import type { YearInFoodSummary } from '../utils/yearInFood';

const MOOD_OPTIONS = [
  { value: 'curious', label: 'Curious', description: 'insightful, observant, lightly analytical' },
  { value: 'cheeky', label: 'Cheeky', description: 'playful, teasing, affectionate, never mean' },
  {
    value: 'health coach',
    label: 'Health coach',
    description: 'encouraging, practical, nutrition-aware',
  },
  { value: 'cosy', label: 'Cosy', description: 'warm, nostalgic, kitchen-table storytelling' },
  {
    value: 'data nerd',
    label: 'Data nerd',
    description: 'spreadsheet-loving, precise, delighted by patterns',
  },
];

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const current = currentYear();
  return Array.from({ length: current - 1969 }, (_, index) => current - index);
}

function formatHours(minutes: number): string {
  return `${Math.round(minutes / 60)} hours`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildPrompt(summary: YearInFoodSummary, mood: string): string {
  return `You are a senior editorial designer and copywriter creating a dinner-only food year-in-review infographic in the spirit of Spotify Wrapped and Monzo Year in Review.

Mood/vibe: ${mood}
Audience: a household reviewing its own dinner habits. Be witty and specific, but kind. Do not shame the household. Breakfast and lunch are out of scope.

Task:
Create an infographic concept for "Your year in food" for ${summary.year}. Pick the best 8 cards from the facts below. You may write a better title if a fact suggests one, for example "Sun, snow and... Aubergine?".

Card format:
- headline
- one big number
- one comparison, joke, or short commentary line
- one supporting visual idea

Design direction:
- Use bold colour blocks, rounded cards, playful charts, and simple food illustrations.
- Vary the cards: some nutrition, some ingredients, some repeats, some streaks, some records, some weather, calendar, or takeaway if available.
- Make the copy feel generated from the data, not generic.
- If a fact has low coverage or a limitation says it is incomplete, either avoid it or phrase it carefully.
- Do not invent private app details. The LLM only knows the data in this prompt.

Quick facts to consider:
- ${summary.mealCount} dinner meal-plan entries were included, covering about ${summary.totalHouseholdServings} household servings (${summary.averageHouseholdServingsPerDinner} per dinner on average).
- ${summary.uniqueRecipeCount} different recipes appeared at dinner.
- ${summary.uniqueIngredientCount} different ingredients appeared across dinner recipes.
- Produce totals are available both as household grams (scaled by meal-plan servings) and per-person grams (one recipe serving).
- Cooking effort estimate: ${formatHours(summary.cookingEffort.totalMinutes)} excluding ${summary.cookingEffort.takeawayExcludedCount} takeaway dinner(s); ${summary.cookingEffort.assumedDefaultMinutesCount} cooked dinner(s) used the 60-minute fallback.
- Takeaway count: ${summary.takeaway.count}; previous year: ${summary.takeaway.previousYearCount ?? 'unknown'}; delta: ${summary.takeaway.deltaFromPreviousYear ?? 'unknown'}.
- Cached weather signals: ${summary.weather?.topDinnerWeatherSignals?.map((item) => `${item.name} (${item.count})`).join(', ') || 'none available'}.
- Cached calendar signals: ${summary.calendar.topAppointmentSignals.map((item) => `${item.name} (${item.count})`).join(', ') || 'none available'}.

Full structured data:
${formatJson(summary)}

Return:
1. A title and subtitle.
2. The 8 selected cards in order, each with headline, big number, commentary, and visual.
3. A brief note on the visual system (palette, type, layout motifs).
4. Any caveats that should be kept small in the footer.`;
}

export function YearInFood() {
  const [year, setYear] = useState(currentYear());
  const [mood, setMood] = useState(MOOD_OPTIONS[0].value);
  const [copied, setCopied] = useState(false);
  const query = useYearInFoodSummary(year);
  const prompt = useMemo(
    () => (query.data ? buildPrompt(query.data, mood) : ''),
    [mood, query.data],
  );

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="pt-2 year-in-food-page">
      <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-3">
        <div>
          <h1 className="h3">Year in food prompt</h1>
          <p className="text-muted mb-0">
            Generate a dinner-only year-in-review prompt with Darkhold statistics for an LLM
            infographic brief.
          </p>
        </div>
      </div>

      <Card className="mb-3">
        <Card.Body>
          <Stack direction="horizontal" gap={3} className="year-in-food-controls align-items-end">
            <Form.Group controlId="year-in-food-year">
              <Form.Label>Year</Form.Label>
              <Form.Select
                value={year}
                onChange={(event) => setYear(Number.parseInt(event.target.value, 10))}
              >
                {yearOptions().map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="year-in-food-mood" className="flex-grow-1">
              <Form.Label>Mood/vibe hint</Form.Label>
              <Form.Select value={mood} onChange={(event) => setMood(event.target.value)}>
                {MOOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Stack>
        </Card.Body>
      </Card>

      {query.isLoading && (
        <Card className="mb-3">
          <Card.Body className="d-flex align-items-center gap-3">
            <LoadingMascot />
            <div className="flex-grow-1">
              <div className="fw-semibold">
                {query.progress?.label ?? 'Preparing year-in-food summary'}
              </div>
              {query.progress && query.progress.total > 0 && (
                <ProgressBar
                  className="mt-2"
                  now={(query.progress.completed / query.progress.total) * 100}
                  label={`${query.progress.completed}/${query.progress.total}`}
                />
              )}
            </div>
          </Card.Body>
        </Card>
      )}
      {query.isError && (
        <Alert variant="danger">
          {query.error instanceof Error ? query.error.message : 'Unable to load year-in-food data.'}
        </Alert>
      )}
      {query.data && (
        <>
          <Alert variant="info">
            Built from {query.data.mealCount} dinner entries. Lunch and breakfast are intentionally
            excluded because this infographic is about the household’s main dinner story.
          </Alert>
          <Card>
            <Card.Header className="d-flex flex-column flex-sm-row justify-content-between gap-2">
              <div>
                <div className="fw-semibold">LLM prompt</div>
                <div className="small text-muted">Copy this into your preferred model.</div>
              </div>
              <Button variant={copied ? 'success' : 'primary'} onClick={copyPrompt}>
                {copied ? <ClipboardCheck className="me-2" /> : <Clipboard className="me-2" />}
                {copied ? 'Copied' : 'Copy prompt'}
              </Button>
            </Card.Header>
            <Card.Body>
              <pre className="year-in-food-prompt mb-0">
                <code>{prompt}</code>
              </pre>
            </Card.Body>
          </Card>
        </>
      )}
    </div>
  );
}
