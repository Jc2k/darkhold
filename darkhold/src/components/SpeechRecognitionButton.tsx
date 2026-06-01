import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { Mic, MicFill, StopCircle } from 'react-bootstrap-icons';

type SpeechRecognitionResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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

export function SpeechRecognitionButton({
  disabled = false,
  onResult,
}: SpeechRecognitionButtonProps) {
  const [SpeechRecognition] = useState(() => getSpeechRecognitionConstructor());
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
    },
    [],
  );

  if (!SpeechRecognition) return null;

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    setError(null);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript.trim();
      if (transcript) onResultRef.current(transcript);
      // Explicitly stop after one item so Safari releases the microphone promptly.
      stopListening();
    };
    recognition.onerror = (event) => {
      setError(getSpeechRecognitionErrorMessage(event.error));
      stopListening();
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
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
    <div className="mb-3">
      <Button
        type="button"
        variant={isListening ? 'danger' : 'outline-primary'}
        size="sm"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        aria-pressed={isListening}
      >
        {isListening ? (
          <>
            <StopCircle className="me-2" aria-hidden="true" />
            Stop listening
          </>
        ) : (
          <>
            <Mic className="me-2" aria-hidden="true" />
            Add item with voice
          </>
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
      {error && (
        <Alert variant="danger" className="py-1 px-2 mt-2 mb-0 small">
          {error}
        </Alert>
      )}
    </div>
  );
}
