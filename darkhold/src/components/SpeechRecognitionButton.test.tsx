import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechRecognitionButton } from './SpeechRecognitionButton';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type RecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type RecognitionErrorEvent = Event & {
  error: string;
};

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  continuous = true;
  interimResults = true;
  lang = '';
  maxAlternatives = 0;
  onend: (() => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onresult: ((event: RecognitionEvent) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
}

describe('SpeechRecognitionButton', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    MockSpeechRecognition.instances = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it('does not render when the browser does not expose speech recognition', () => {
    act(() => root.render(<SpeechRecognitionButton onResult={vi.fn()} />));

    expect(container.textContent).toBe('');
  });

  it('uses the Safari-prefixed constructor and returns one trimmed item', () => {
    vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition);
    const onResult = vi.fn();
    act(() => root.render(<SpeechRecognitionButton onResult={onResult} />));

    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    const recognition = MockSpeechRecognition.instances[0];
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.maxAlternatives).toBe(1);
    expect(container.textContent).not.toContain('Add item with voice');

    act(() =>
      recognition.onresult?.({
        resultIndex: 0,
        results: [[{ transcript: '  Milk  ' }]],
      } as unknown as RecognitionEvent),
    );

    expect(onResult).toHaveBeenCalledWith('Milk');
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('Listening for one shopping item');
  });

  it('stops listening and shows a useful message when microphone access is denied', () => {
    vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition);
    const onErrorChange = vi.fn();
    act(() =>
      root.render(<SpeechRecognitionButton onResult={vi.fn()} onErrorChange={onErrorChange} />),
    );
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    const recognition = MockSpeechRecognition.instances[0];

    act(() => recognition.onerror?.({ error: 'not-allowed' } as RecognitionErrorEvent));

    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(onErrorChange).toHaveBeenLastCalledWith(
      'Microphone access was denied. Allow access in your browser settings and try again.',
    );
  });

  it('stops listening when the app is hidden so voice input can be restarted', () => {
    vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition);
    act(() => root.render(<SpeechRecognitionButton onResult={vi.fn()} />));
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    const recognition = MockSpeechRecognition.instances[0];

    const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    if (visibilityStateDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityStateDescriptor);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }

    expect(recognition.stop).toHaveBeenCalledOnce();

    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(MockSpeechRecognition.instances).toHaveLength(2);
    expect(MockSpeechRecognition.instances[1]?.start).toHaveBeenCalledOnce();
  });
});
