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
  | { type: 'error'; error: string };

function parseYearInFoodStreamEvent(line: string): YearInFoodStreamEvent | null {
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

async function fetchYearInFoodSummary(
  year: number,
  onProgress: (progress: YearInFoodProgress) => void,
): Promise<YearInFoodSummary> {
  const res = await fetch(`/year-in-food-summary/stream?year=${year}`);
  if (!res.ok) {
    let message = `Year-in-food summary fetch failed: ${res.status}`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status-based fallback when the response body is not JSON.
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Year-in-food summary response was not streamable.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseYearInFoodStreamEvent(line);
      if (!event) continue;
      if (event.type === 'progress') onProgress(event.progress);
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'complete') return event.summary;
    }

    if (done) break;
  }

  throw new Error('Year-in-food summary stream ended before a summary was returned.');
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
