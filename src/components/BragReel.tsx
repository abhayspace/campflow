import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './brag-reel.css';

export interface ReelExample {
  label: string;
  title: string;
  place: string;
  team: string;
}

const DWELL = 6200;

interface Frame {
  kicker: string;
  title: string;
  body: string;
  points?: string[];
  visual: 'lost' | 'repeat' | 'roles' | 'flow' | 'after';
}

const FRAMES: Frame[] = [
  {
    kicker: 'THE PROBLEM',
    title: 'Campus problems disappear before anyone owns them.',
    body: 'A leaking tap, a dark corridor, Wi-Fi that drops. Students post in a group chat, email a lecturer, or just live with it. The right department never gets a clear report, so the day moves on and the problem stays.',
    points: ['No single place to report it', 'No one is clearly responsible', 'The person who noticed it has to chase'],
    visual: 'lost',
  },
  {
    kicker: 'WHAT IT COSTS',
    title: 'The same issue comes back. Nobody can see why.',
    body: 'Staff hear about things late, and only as fragments. A ticket can be marked done without anyone checking the fix. Administrators cannot tell which building, category, or department keeps failing.',
    points: ['Work is scattered across chats and inboxes', 'Repeat problems stay invisible', '“Resolved” is not the same as fixed'],
    visual: 'repeat',
  },
  {
    kicker: 'WHAT CAMPFLOW DOES',
    title: 'One private workspace for the whole campus.',
    body: 'Each institution gets its own place. Students file a complaint or a request. Routing rules send it to the department that can act. Everyone follows one timeline, and the student confirms the fix actually worked.',
    points: ['Students are heard once, then kept in the loop', 'Staff get location, history, and ownership together', 'Admins see patterns instead of anecdotes'],
    visual: 'roles',
  },
  {
    kicker: 'SEE IT MOVE',
    title: 'From a small report to a fix you can trust.',
    body: 'This is an example, not a real ticket. It shows the path every report takes: said clearly, sent to the right team, and followed until someone on campus confirms it is done.',
    visual: 'flow',
  },
  {
    kicker: 'THE DIFFERENCE',
    title: 'Less chasing. A campus that can see itself.',
    body: 'Campflow is for the everyday problems that make a campus harder to use. It does not replace the people who fix them. It makes sure those people get the report, and that the person who raised it can see it through.',
    points: ['A ticket for every report', 'Updates without the runaround', 'A record of what keeps coming back'],
    visual: 'after',
  },
];

function Visual({ kind, example }: { kind: Frame['visual']; example: ReelExample }) {
  if (kind === 'lost') {
    return (
      <div className="brag-visual-inner">
        <div className="reel-card">
          <div className="reel-row"><span className="reel-dot" style={{ background: '#f8def9' }}>💬</span><div><strong>Class group</strong><span>“Has anyone told facilities?”</span></div></div>
          <div className="reel-row"><span className="reel-dot" style={{ background: '#ffe88f' }}>✉️</span><div><strong>Unread email</strong><span>Forwarded twice. No owner.</span></div></div>
        </div>
        <div className="reel-note">The tap is still leaking. The report never became someone’s job.</div>
      </div>
    );
  }
  if (kind === 'repeat') {
    return (
      <div className="brag-visual-inner">
        <div className="reel-card">
          <div className="reel-row"><span className="reel-dot" style={{ background: '#ffd0c2' }}>↻</span><div><strong>{example.title}</strong><span>{example.place}</span></div><span className="reel-pill">3rd time</span></div>
          <div className="reel-row"><span className="reel-dot" style={{ background: '#e3dafe' }}>?</span><div><strong>Marked resolved last month</strong><span>Nobody confirmed it stayed fixed.</span></div></div>
        </div>
        <div className="reel-note">Without a shared history, the campus keeps paying for the same problem.</div>
      </div>
    );
  }
  if (kind === 'roles') {
    return (
      <div className="brag-visual-inner reel-roles">
        <div className="reel-role"><b>Students</b><span>Report it once. Follow the ticket. Confirm the fix.</span></div>
        <div className="reel-role"><b>Teachers & staff</b><span>A department queue with the location and the story attached.</span></div>
        <div className="reel-role"><b>Administrators</b><span>Departments, routing, and the places that keep failing.</span></div>
      </div>
    );
  }
  if (kind === 'flow') {
    return (
      <div className="brag-visual-inner reel-flow">
        <div className="reel-step"><span className="reel-num">1</span><div><strong>{example.title}</strong><span>{example.place} · {example.label}</span></div></div>
        <div className="reel-step"><span className="reel-num">2</span><div><strong>Sent to {example.team}</strong><span>Routing picks the department. Staff pick it up.</span></div></div>
        <div className="reel-step"><span className="reel-num">3</span><div><strong>You see it through</strong><span>Updates on one timeline. Reopen it if it isn’t really done.</span></div></div>
      </div>
    );
  }
  return (
    <div className="brag-visual-inner">
      <div className="reel-card">
        <div className="reel-row"><span className="reel-dot" style={{ background: '#d5f1df' }}>✓</span><div><strong>Report received</strong><span>{example.team} has the ticket.</span></div></div>
        <div className="reel-row"><span className="reel-dot" style={{ background: '#e3dafe' }}>→</span><div><strong>In progress</strong><span>Location, notes, and history stay together.</span></div></div>
        <div className="reel-row"><span className="reel-dot" style={{ background: '#ffe88f' }}>★</span><div><strong>Confirmed on campus</strong><span>The person who reported it says it’s fixed.</span></div></div>
      </div>
    </div>
  );
}

export default function BragReel({
  open,
  onClose,
  motion,
  example,
}: {
  open: boolean;
  onClose: () => void;
  motion: boolean;
  example: ReelExample;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frame = FRAMES[step]!;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      setStep(0);
      setPlaying(true);
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (!open || !motion || !playing) return;
    const timer = window.setTimeout(() => {
      setStep((current) => (current + 1) % FRAMES.length);
    }, DWELL);
    return () => window.clearTimeout(timer);
  }, [open, motion, playing, step]);

  const go = (next: number) => {
    setPlaying(false);
    setStep((next + FRAMES.length) % FRAMES.length);
  };

  return (
    <dialog
      ref={dialog}
      className={`brag-reel ${playing && motion ? '' : 'paused'}`}
      aria-labelledby="brag-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(step + 1);
        if (event.key === 'ArrowLeft') go(step - 1);
      }}
    >
      <div className="brag-shell">
        <div className="brag-top">
          <div className="brag-progress" aria-label="Reel progress">
            {FRAMES.map((entry, index) => (
              <button
                key={entry.kicker}
                type="button"
                data-state={index === step ? 'active' : index < step ? 'done' : 'idle'}
                aria-label={entry.kicker}
                onClick={() => go(index)}
              >
                <i key={index === step ? `${step}-${playing}` : entry.kicker} />
              </button>
            ))}
          </div>
          <button type="button" className="brag-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="brag-stage">
          <div className="brag-visual" aria-hidden="true">
            <Visual key={frame.visual + example.title} kind={frame.visual} example={example} />
          </div>
          <div className="brag-copy" aria-live="polite">
            <span className="brag-kicker">{frame.kicker}</span>
            <h2 id="brag-title">{frame.title}</h2>
            <p>{frame.body}</p>
            {frame.points && (
              <ul className="brag-points">
                {frame.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}
              </ul>
            )}
            {step === FRAMES.length - 1 && (
              <div className="brag-actions">
                <Link to="/register" className="brag-cta" onClick={onClose}>Get your campus started</Link>
                <Link to="/join" className="brag-ghost" onClick={onClose}>Join with a code</Link>
              </div>
            )}
          </div>
        </div>

        <div className="brag-controls">
          <span>Campflow · what this solves</span>
          <div>
            <button type="button" onClick={() => go(step - 1)} aria-label="Previous">←</button>
            <button type="button" disabled={!motion} onClick={() => setPlaying((value) => !value)}>
              {!motion ? 'Reduced motion' : playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => go(step + 1)} aria-label="Next">→</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
