import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import GeminiChat from './GeminiChat';
import GeminiMark from './GeminiMark';
import './gemini-chat.css';

export default function GeminiDock() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  if (pathname === '/assistant') return null;

  return (
    <div className="gemini-fab-wrap">
      {open && (
        <div className="gemini-pop">
          <GeminiChat compact />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close Flow' : 'Open Flow'}
        className="gemini-fab"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <GeminiMark size={30} />
        )}
      </button>
    </div>
  );
}
