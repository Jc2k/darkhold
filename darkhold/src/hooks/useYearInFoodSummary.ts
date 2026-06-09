import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { YearInFoodSummary } from '../utils/yearInFood';

export interface YearInFoodProgress {
  completed: number;
  total: number;
  label: string;
}

type YearInFoodStreamEvent =
  | { type: 'progress'; progress: YearInFoodProgress }
  | { type: 'complete'; summary: YearInFoodSummary }
  | { type: 'error'; error: string; detail?: string };

export function parseYearInFoodStreamEvent(line: string): YearInFoodStreamEvent | null {
  try {
    const event = JSON.parse(line) as Partial<YearInFoodStreamEvent>;
    if (event.type === 'progress' && event.progress) return event as YearInFoodStreamEvent;
    if (event.type === 'complete' && event.summary) return event as YearInFoodStreamEvent;
    if (event.type === 'error' && typeof event.error === 'string')
      return event as YearInFoodStreamEvent;
  } catch {
    return null;
  }
  return null;
}

function formatYearInFoodStreamFailure(
  eventCount: number,
  lastProgress: YearInFoodProgress | null,
  lastUnparsedLine: string | null,
): string {
  const progressText = lastProgress ? ` Last progress update: ${lastProgress.label}.` : '';
  const rawText = lastUnparsedLine
    ? ` Last unparsed stream payload: ${lastUnparsedLine.slice(0, 200)}`
    : '';
  const eventText =
    eventCount > 0
      ? ` Received ${eventCount} stream event${eventCount === 1 ? '' : 's'} before the connection closed.`
      : ' No stream events were received before the connection closed.';
  return `Year-in-food summary stream ended before a summary was returned.${eventText}${progressText}${rawText}`;
}

export async function fetchYearInFoodSummary(
  year: number,
  onProgress: (progress: YearInFoodProgress) => void,
): Promise<YearInFoodSummary> {
  const res = await fetch(`/year-in-food-summary/stream?year=${year}`);
  if (!res.ok) {
    let message = `Year-in-food summary fetch failed: ${res.status}`;
    try {
      const payload = (await res.json()) as { detail?: string; error?: string };
      if (payload.error)
        message = payload.detail ? `${payload.error} ${payload.detail}` : payload.error;
    } catch {
      // Keep the status-based fallback when the response body is not JSON.
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Year-in-food summary response was not streamable.');

  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  let lastProgress: YearInFoodProgress | null = null;
  let lastUnparsedLine: string | null = null;

  function handleLine(line: string): YearInFoodSummary | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const event = parseYearInFoodStreamEvent(trimmed);
    if (!event) {
      lastUnparsedLine = trimmed;
      return null;
    }
    eventCount += 1;
    if (event.type === 'progress') {
      lastProgress = event.progress;
      onProgress(event.progress);
    }
    if (event.type === 'error') {
      throw new Error(event.detail ? `${event.error} ${event.detail}` : event.error);
    }
    if (event.type === 'complete') return event.summary;
    return null;
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const summary = handleLine(line);
      if (summary) return summary;
    }

    if (done) break;
  }

  const finalSummary = handleLine(buffer);
  if (finalSummary) return finalSummary;

  throw new Error(formatYearInFoodStreamFailure(eventCount, lastProgress, lastUnparsedLine));
}

export function useYearInFoodSummary(year: number) {
  const [progress, setProgress] = useState<YearInFoodProgress | null>(null);
  const query = useQuery({
    queryKey: ['year-in-food-summary', year],
    queryFn: () => fetchYearInFoodSummary(year, setProgress),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });

  return { ...query, progress };
}
