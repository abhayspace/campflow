import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { callFunction } from '../lib/api';
import { supabase } from '../lib/supabase';
import { cx } from '../lib/utils';
import GeminiMark from './GeminiMark';
import './gemini-chat.css';

interface Draft {
  submission_type: 'complaint' | 'request';
  visibility: 'personal' | 'campus';
  title: string;
  description: string;
  location: string;
  category: string;
  priority: string;
  preferred_outcome: string | null;
}

interface Card {
  type: 'submission_preview' | 'result';
  idempotency_key?: string;
  draft?: Draft;
  title?: string;
  detail?: string;
  href?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards: Card[];
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

type Mode = 'chat' | 'task';

const PROMPTS: Record<string, Record<Mode, string[]>> = {
  student: {
    chat: [
      'How do I use Campflow?',
      'What is the difference between a complaint and a request?',
      'How do I support a campus proposal?',
    ],
    task: [
      'The Wi-Fi is not working in the library.',
      'Show my open tickets.',
      'Help me request longer library hours.',
    ],
  },
  teacher: {
    chat: [
      'Several students are reporting Wi-Fi issues in the library. What should I do?',
      'How does department routing work?',
      'Explain how priority scores are used.',
    ],
    task: [
      'Summarize complaints assigned to me.',
      'Draft a short update for a student whose ticket is in progress.',
      'Which surveys have responses?',
    ],
  },
  head: {
    chat: [
      'Which issues keep coming back in my department?',
      'How should I prioritize the open work?',
      'Explain the complaint status flow.',
    ],
    task: [
      'Summarize my department\'s open workload.',
      'Which tickets are overdue or high priority?',
      'Draft a short department status update.',
    ],
  },
  admin: {
    chat: [
      'Where are complaints clustering right now?',
      'How is department routing configured?',
      'What should I look at before changing a workflow?',
    ],
    task: [
      'Summarize institution complaint trends.',
      'Which departments have the most open tickets?',
      'What recurring locations show up in the data?',
    ],
  },
};

function blurb(role: string, head: boolean) {
  if (role === 'admin') return 'I can help you read campus trends, department workload, and operational reports from records you can access.';
  if (role === 'teacher' && head) return 'I can help you review your department\'s open work, spot overdue tickets, and draft updates.';
  if (role === 'teacher') return 'I can help you review assigned issues, draft student updates, and summarize feedback you are allowed to see.';
  return 'I can help you report an issue, track your complaints, understand campus updates, and share feedback.';
}

function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const bullets = lines.every((line) => /^[-*]\s+/.test(line.trim()) || line.trim() === '');
        if (bullets) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.filter((line) => line.trim()).map((line) => <li key={line}>{inline(line.replace(/^[-*]\s+/, ''))}</li>)}
            </ul>
          );
        }
        if (lines[0]?.trim().startsWith('```')) {
          const code = lines.filter((line) => !line.trim().startsWith('```')).join('\n');
          return <pre key={index} className="gemini-code">{code}</pre>;
        }
        return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="gemini-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  });
}

function PromptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 6h14M5 12h14M5 18h9" strokeLinecap="round" />
    </svg>
  );
}

export default function GeminiChat({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [head, setHead] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');
  const [doneKeys, setDoneKeys] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const stop = useRef(false);
  const role = profile?.role ?? 'student';
  const key = role === 'admin' ? 'admin' : role === 'teacher' && head ? 'head' : role === 'teacher' ? 'teacher' : 'student';
  const prompts = PROMPTS[key][mode];
  const empty = messages.length === 0;

  const loadList = async () => {
    const { data, error: listError } = await supabase
      .from('assistant_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(30);
    if (listError) return;
    setConversations(data ?? []);
  };

  const loadMessages = async (id: string) => {
    const { data } = await supabase
      .from('assistant_messages')
      .select('id, role, content, cards, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as ChatMessage[]);
  };

  useEffect(() => {
    void loadList();
    if (!profile || profile.role !== 'teacher') return;
    supabase.from('department_members').select('membership_type').eq('profile_id', profile.id).eq('membership_type', 'head')
      .then(({ data }) => setHead((data ?? []).length > 0));
  }, [profile]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input, empty]);

  const send = async (text: string, retry = false) => {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setFailedText(null);
    setBusy(true);
    stop.current = false;
    if (!retry) {
      setMessages((current) => [...current, { id: `local-${Date.now()}`, role: 'user', content: message, cards: [] }]);
      setInput('');
    }
    try {
      const result = await callFunction<{ conversation_id: string; message: ChatMessage }>('gemini-assistant', {
        action: 'chat',
        conversation_id: conversationId,
        message,
        retry,
      });
      if (stop.current) return;
      setConversationId(result.conversation_id);
      await loadMessages(result.conversation_id);
      void loadList();
    } catch (e) {
      if (!stop.current) {
        setError(e instanceof Error ? e.message : 'The assistant could not answer.');
        setFailedText(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const startNew = async () => {
    setError(null);
    setMessages([]);
    setConversationId(null);
    setHistoryOpen(false);
    setInput('');
    try {
      const result = await callFunction<{ conversation: Conversation }>('gemini-assistant', { action: 'create' });
      setConversationId(result.conversation.id);
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a new chat.');
    }
  };

  const remove = async (id: string) => {
    await supabase.from('assistant_conversations').delete().eq('id', id);
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
    void loadList();
  };

  const confirm = async (card: Card) => {
    if (!card.draft || !card.idempotency_key || !conversationId) return;
    setConfirming(card.idempotency_key);
    setError(null);
    try {
      await callFunction('submit-complaint', { ...card.draft, idempotency_key: card.idempotency_key });
      const recorded = await callFunction<{ message: ChatMessage }>('gemini-assistant', {
        action: 'record_result',
        conversation_id: conversationId,
        idempotency_key: card.idempotency_key,
      });
      setDoneKeys((keys) => [...keys, card.idempotency_key!]);
      setMessages((current) => [...current, recorded.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The submission could not be completed.');
    } finally {
      setConfirming(null);
    }
  };

  const copy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch { /* clipboard may be blocked */ }
  };

  const composer = (
    <form
      className="gemini-composer-wrap"
      onSubmit={(event) => { event.preventDefault(); void send(input); }}
    >
      <div className={cx('gemini-composer', input.includes('\n') && 'is-tall')}>
        <button type="button" className="gemini-iconbtn" aria-label="New chat" onClick={() => void startNew()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        <textarea
          ref={box}
          value={input}
          rows={1}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={mode === 'task' ? 'Give Flow a task' : 'Ask Flow'}
          aria-label="Message Flow"
        />
        <span className="gemini-flash" title="Flow assistant">AI</span>
        {busy ? (
          <button type="button" className="gemini-send is-ready" aria-label="Stop" onClick={() => { stop.current = true; setBusy(false); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          <button type="submit" className={cx('gemini-send', input.trim() && 'is-ready')} disabled={!input.trim()} aria-label="Send">
            {input.trim() ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <GeminiMark size={18} />
            )}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className={cx('gemini-stage', compact && 'is-compact')}>
      <div className="gemini-glow" aria-hidden="true" />
      <div className="gemini-top">
        <button type="button" className="gemini-iconbtn" aria-label="Chats" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
          </svg>
        </button>
        <div className="gemini-brand">
          <GeminiMark size={18} />
          <span>
            Flow
            <small>Your Campflow AI assistant</small>
          </span>
        </div>
      </div>

      {historyOpen && (
        <aside className="gemini-history">
          <header>
            Chats
            <button type="button" className="gemini-iconbtn" aria-label="Close chats" onClick={() => setHistoryOpen(false)}>×</button>
          </header>
          <ul>
            {conversations.length === 0 && <li className="empty">No saved chats yet.</li>}
            {conversations.map((chat) => (
              <li key={chat.id} className={cx(conversationId === chat.id && 'is-on')}>
                <button
                  type="button"
                  className="title"
                  onClick={() => { setConversationId(chat.id); void loadMessages(chat.id); setHistoryOpen(false); }}
                >
                  {chat.title}
                </button>
                <button type="button" className="drop" aria-label={`Delete ${chat.title}`} onClick={() => void remove(chat.id)}>×</button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div ref={scroller} className="gemini-scroll">
        {empty ? (
          <div className="gemini-home">
            <h2>Where should we start?</h2>
            <p className="gemini-sub">{blurb(role, head)}</p>
            {composer}
            <div className="gemini-modes" role="tablist" aria-label="Assistant mode">
              <button type="button" role="tab" aria-selected={mode === 'chat'} className={cx('gemini-mode', mode === 'chat' && 'is-on')} onClick={() => setMode('chat')}>Chat</button>
              <button type="button" role="tab" aria-selected={mode === 'task'} className={cx('gemini-mode', mode === 'task' && 'is-on')} onClick={() => setMode('task')}>Task</button>
            </div>
            <div className="gemini-prompts">
              {prompts.map((prompt) => (
                <button key={prompt} type="button" className="gemini-prompt" onClick={() => void send(prompt)}>
                  <PromptIcon />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
            <p className="gemini-note">Flow can make mistakes. Nothing is submitted until you confirm.</p>
          </div>
        ) : (
          <div className="gemini-thread">
            {messages.map((message) => (
              message.role === 'user' ? (
                <p key={message.id} className="gemini-user">{message.content}</p>
              ) : (
                <article key={message.id} className="gemini-assistant">
                  <GeminiMark size={22} />
                  <div className="gemini-body">
                    <Markdown text={message.content} />
                    <button type="button" className="gemini-copy" onClick={() => void copy(message.id, message.content)}>
                      {copiedId === message.id ? 'Copied' : 'Copy'}
                    </button>
                    {(message.cards ?? []).map((card) => (
                      <div key={card.idempotency_key ?? card.href} className="gemini-card">
                        {card.type === 'submission_preview' && card.draft && (
                          <>
                            <p className="kicker">Preview · not submitted</p>
                            <h3>{card.draft.title}</h3>
                            <p>{card.draft.description}</p>
                            <p className="meta">{card.draft.location} · {card.draft.category} · {card.draft.visibility} · {card.draft.submission_type}</p>
                            {doneKeys.includes(card.idempotency_key ?? '') ? (
                              <p className="gemini-ok">Confirmed and sent through Campflow.</p>
                            ) : (
                              <button type="button" className="gemini-confirm" disabled={confirming === card.idempotency_key} onClick={() => void confirm(card)}>
                                {confirming === card.idempotency_key ? 'Submitting…' : 'Confirm and submit'}
                              </button>
                            )}
                          </>
                        )}
                        {card.type === 'result' && (
                          <>
                            <p className="kicker">Verified database result</p>
                            <h3>{card.title}</h3>
                            <p>{card.detail}</p>
                            {card.href && <Link className="gemini-link" to={card.href}>Open the ticket</Link>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )
            ))}
            {busy && (
              <div className="gemini-assistant" aria-live="polite">
                <GeminiMark size={22} />
                <div className="gemini-typing" aria-label="Flow is writing"><span /><span /><span /></div>
              </div>
            )}
          </div>
        )}
      </div>

      {!empty && (
        <div className="gemini-dockbar">
          {error && (
            <div className="gemini-error">
              <p>{error}</p>
              <p className="fallback">You can still report an issue from the Report page if the assistant is unavailable.</p>
              {failedText && <button type="button" className="gemini-retry" onClick={() => void send(failedText, true)}>Retry</button>}
            </div>
          )}
          {composer}
          <p className="gemini-note">Flow can make mistakes. Nothing is submitted until you confirm.</p>
        </div>
      )}
      {empty && error && (
        <div className="gemini-dockbar">
          <div className="gemini-error">
            <p>{error}</p>
            {failedText && <button type="button" className="gemini-retry" onClick={() => void send(failedText, true)}>Retry</button>}
          </div>
        </div>
      )}
    </div>
  );
}
