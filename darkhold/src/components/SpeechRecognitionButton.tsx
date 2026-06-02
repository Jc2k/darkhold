import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { MicFill } from 'react-bootstrap-icons';

type SpeechRecognitionResult = ArrayLike<{ transcript: string }> & {
  isFinal: boolean;
};

type SpeechRecognitionResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

interface SpeechRecognitionButtonProps {
  disabled?: boolean;
  onResult: (transcript: string) => void;
  onErrorChange?: (error: string | null) => void;
  onInterimResultChange?: (transcript: string | null) => void;
}

export interface SpeechRecognitionButtonHandle {
  reset: () => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function getSpeechRecognitionErrorMessage(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone access was denied. Allow access in your browser settings and try again.';
  }
  if (error === 'audio-capture') {
    return 'No microphone is available. Check your device settings and try again.';
  }
  if (error === 'no-speech') {
    return 'No speech was heard. Try again and say one shopping item.';
  }
  return 'Speech recognition failed. Please try again or type the item instead.';
}

export const SpeechRecognitionButton = forwardRef<
  SpeechRecognitionButtonHandle,
  SpeechRecognitionButtonProps
>(function SpeechRecognitionButton(
  { disabled = false, onResult, onErrorChange, onInterimResultChange },
  ref,
) {
  const [SpeechRecognition] = useState(() => getSpeechRecognitionConstructor());
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const stoppedRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorChangeRef = useRef(onErrorChange);
  const onInterimResultChangeRef = useRef(onInterimResultChange);
  onResultRef.current = onResult;
  onErrorChangeRef.current = onErrorChange;
  onInterimResultChangeRef.current = onInterimResultChange;

  const releaseRecognition = (recognition: SpeechRecognitionInstance, abort = false) => {
    if (recognitionRef.current === recognition) recognitionRef.current = null;
    if (stoppedRecognitionRef.current === recognition) stoppedRecognitionRef.current = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    if (abort) {
      recognition.abort();
    } else {
      recognition.stop();
      stoppedRecognitionRef.current = recognition;
    }
  };

  const abortStoppedRecognition = () => {
    const stoppedRecognition = stoppedRecognitionRef.current;
    if (stoppedRecognition) releaseRecognition(stoppedRecognition, true);
  };

  const resetSpeechRecognition = () => {
    const recognition = recognitionRef.current;
    if (recognition) releaseRecognition(recognition, true);
    abortStoppedRecognition();
    onInterimResultChangeRef.current?.(null);
    setIsListening(false);
    setError(null);
  };

  useImperativeHandle(ref, () => ({ reset: resetSpeechRecognition }));

  useEffect(
    () => () => {
      resetSpeechRecognition();
    },
    [],
  );

  useEffect(() => {
    onErrorChangeRef.current?.(error);
  }, [error]);

  useEffect(() => {
    const resetForVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetSpeechRecognition();
    };

    document.addEventListener('visibilitychange', resetForVisibilityChange);
    window.addEventListener('pagehide', resetSpeechRecognition);
    return () => {
      document.removeEventListener('visibilitychange', resetForVisibilityChange);
      window.removeEventListener('pagehide', resetSpeechRecognition);
    };
  }, []);

  if (!SpeechRecognition) return null;

  const stopListening = () => {
    const recognition = recognitionRef.current;
    if (recognition) releaseRecognition(recognition);
    onInterimResultChangeRef.current?.(null);
    setIsListening(false);
  };

  const startListening = () => {
    setError(null);
    abortStoppedRecognition();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const finalTranscripts: string[] = [];
      const interimTranscripts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript.trim();
        if (!transcript) continue;
        (result.isFinal ? finalTranscripts : interimTranscripts).push(transcript);
      }

      const finalTranscript = finalTranscripts.join(' ').trim();
      if (finalTranscript) {
        onResultRef.current(finalTranscript);
        // Explicitly stop after one final item so Safari releases the microphone promptly.
        stopListening();
      } else {
        onInterimResultChangeRef.current?.(interimTranscripts.join(' ').trim() || null);
      }
    };
    recognition.onerror = (event) => {
      setError(getSpeechRecognitionErrorMessage(event.error));
      stopListening();
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      stoppedRecognitionRef.current = recognition;
      onInterimResultChangeRef.current?.(null);
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setError('Speech recognition could not start. Please try again or type the item instead.');
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="sm"
        className="shopping-request-voice-button"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        aria-pressed={isListening}
        aria-label={isListening ? 'Stop voice input' : 'Add item with voice'}
      >
        {isListening ? (
          <Spinner animation="border" size="sm" aria-hidden="true" />
        ) : (
          <MicFill aria-hidden="true" />
        )}
      </Button>
      <span className="visually-hidden" aria-live="polite">
        {isListening ? (
          <>
            <MicFill aria-hidden="true" /> Listening for one shopping item.
          </>
        ) : (
          'Voice input is not listening.'
        )}
      </span>
    </>
  );
});
