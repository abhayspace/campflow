import { useEffect, useRef, useState } from 'react';
import { Button, Card, CardBody, Select, Textarea } from './ui';
import { cx } from '../lib/utils';

// Real browser speech recognition — no fake recording states.
// When the API is missing (Firefox, some WebViews) we say so plainly and
// the student simply types instead.

interface SpeechResultItem {
  0: { transcript: string };
  isFinal: boolean;
  length: number;
}
interface SpeechResultEvent {
  results: { [i: number]: SpeechResultItem; length: number };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export default function VoiceCapture({ onUseTranscript, disabled }: {
  onUseTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported] = useState(() => !!getRecognition());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('en-IN');
  const [recError, setRecError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const start = () => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    setRecError(null);
    setInterim('');
    rec.onresult = (ev) => {
      let final = '';
      let interimText = '';
      for (const k of Object.keys(ev.results)) {
        const r = ev.results[Number(k)]!;
        if (r.isFinal) final += r[0]!.transcript + ' ';
        else interimText += r[0]!.transcript;
      }
      if (final) setTranscript((t) => (t + ' ' + final).trim());
      setInterim(interimText);
    };
    rec.onerror = (ev) => {
      setRecError(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? 'Microphone access was denied — allow mic permission or type instead.'
        : `Recognition stopped (${ev.error}). You can edit the transcript or type instead.`);
      setListening(false);
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  const stop = () => { recRef.current?.stop(); setListening(false); };

  if (!supported) {
    return (
      <Card className="border-dashed">
        <CardBody className="flex items-start gap-3 py-4">
          <span className="text-xl">🎤</span>
          <div className="text-sm">
            <p className="font-semibold text-slate-700">Voice reporting isn't available in this browser</p>
            <p className="mt-0.5 text-slate-500">
              Chrome and Edge support live speech-to-text (English, हिन्दी, Hinglish).
              No problem — just describe the issue below and everything works the same.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={cx(listening && 'ring-2 ring-red-200')}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={disabled}
            aria-pressed={listening}
            className={cx(
              'flex h-12 w-12 items-center justify-center rounded-full text-xl text-white transition-all',
              listening ? 'animate-pulse bg-red-500 shadow-lg shadow-red-200' : 'bg-brand-600 hover:bg-brand-700',
              disabled && 'opacity-50',
            )}
            aria-label={listening ? 'Stop recording' : 'Start voice reporting'}
          >
            {listening ? '■' : '🎤'}
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {listening ? 'Listening… speak naturally' : 'Speak your report'}
            </p>
            <p className="text-xs text-slate-400">
              English, हिन्दी, or Hinglish — you can edit everything before it goes anywhere.
            </p>
          </div>
          <Select value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening} className="!w-auto">
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">हिन्दी</option>
            <option value="en-US">English (US)</option>
          </Select>
        </div>

        {recError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800" role="alert">{recError}</p>}

        {(transcript || interim || listening) && (
          <>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Transcript — edit freely</p>
              <Textarea className="mt-1.5 border-0 !bg-transparent p-0 ring-0 focus:!ring-0" rows={3}
                value={transcript + (interim ? ` ${interim}` : '')}
                onChange={(e) => setTranscript(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={transcript.trim().length < 10}
                onClick={() => { onUseTranscript(transcript.trim()); setTranscript(''); }}>
                Use this description
              </Button>
              {listening && <Button size="sm" variant="ghost" onClick={stop}>Stop</Button>}
              {!listening && transcript && <Button size="sm" variant="ghost" onClick={() => setTranscript('')}>Clear</Button>}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
