import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYearInFoodSummary, parseYearInFoodStreamEvent } from './useYearInFoodSummary';
import type { YearInFoodSummary } from '../utils/yearInFood';

const summary = {
  year: 2024,
  mealCount: 12,
} as YearInFoodSummary;

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseYearInFoodStreamEvent', () => {
  it('parses progress, complete, and error stream events', () => {
    expect(
      parseYearInFoodStreamEvent(
        JSON.stringify({
          type: 'progress',
          progress: { completed: 1, total: 2, label: 'Loading' },
        }),
      ),
    ).toMatchObject({ type: 'progress', progress: { label: 'Loading' } });
    expect(parseYearInFoodStreamEvent(JSON.stringify({ type: 'complete', summary }))).toMatchObject(
      { type: 'complete', summary },
    );
    expect(
      parseYearInFoodStreamEvent(
        JSON.stringify({ type: 'error', error: 'Failed', detail: 'Boom' }),
      ),
    ).toMatchObject({ type: 'error', error: 'Failed', detail: 'Boom' });
  });

  it('ignores invalid stream events', () => {
    expect(parseYearInFoodStreamEvent('not json')).toBeNull();
    expect(parseYearInFoodStreamEvent(JSON.stringify({ type: 'complete' }))).toBeNull();
  });
});

describe('fetchYearInFoodSummary', () => {
  it('returns a summary when the final complete event is not newline terminated', async () => {
    const progress = { completed: 1, total: 2, label: 'Halfway' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          streamResponse([
            `${JSON.stringify({ type: 'progress', progress })}\n`,
            JSON.stringify({ type: 'complete', summary }),
          ]),
        ),
    );
    const onProgress = vi.fn();

    await expect(fetchYearInFoodSummary(2024, onProgress)).resolves.toEqual(summary);
    expect(onProgress).toHaveBeenCalledWith(progress);
  });

  it('includes server error details from stream error events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        streamResponse([
          JSON.stringify({
            type: 'error',
            error: 'Unable to build the year-in-food summary right now.',
            detail: 'Tandoor fetch failed for /recipe/1/: HTTP 404',
          }),
        ]),
      ),
    );

    await expect(fetchYearInFoodSummary(2024, vi.fn())).rejects.toThrow(
      'Tandoor fetch failed for /recipe/1/: HTTP 404',
    );
  });

  it('reports the last progress and malformed payload when the stream ends early', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          streamResponse([
            `${JSON.stringify({ type: 'progress', progress: { completed: 2, total: 3, label: 'Fetching recipe details' } })}\n`,
            'proxy error page',
          ]),
        ),
    );

    await expect(fetchYearInFoodSummary(2024, vi.fn())).rejects.toThrow(
      'Last progress update: Fetching recipe details. Last unparsed stream payload: proxy error page',
    );
  });

  it('includes server error details from non-ok JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () =>
          Promise.resolve({
            error: 'Unable to build the year-in-food summary right now.',
            detail: 'Tandoor fetch failed for /meal-plan/: HTTP 401',
          }),
      }),
    );

    await expect(fetchYearInFoodSummary(2024, vi.fn())).rejects.toThrow(
      'Tandoor fetch failed for /meal-plan/: HTTP 401',
    );
  });
});
