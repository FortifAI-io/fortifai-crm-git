import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, MessageSquare, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import type {
  AskMeChatMessage,
  AskMeContactPill,
  Contact,
  ContactType,
} from '../types/crm';

interface AskMeDrawerProps {
  isOpen: boolean;
  messages: AskMeChatMessage[];
  isLoading: boolean;
  geminiConfigured: boolean;
  contacts: Contact[];
  onClose: () => void;
  onClearConversation: () => void;
  onSendMessage: (text: string) => void;
  onOpenContact: (contactId: string) => void;
  onDraftInComposer: (
    contactIds: string[],
    audienceType: ContactType,
    subject?: string,
    bodyTemplate?: string
  ) => void;
}

interface PromptGroup {
  group: string;
  visible: boolean;
  prompts: string[];
}

export function AskMeDrawer(props: AskMeDrawerProps) {
  const p = props as Record<string, any>;
  const isOpen = Boolean(p.isOpen);
  const onClose = p.onClose as () => void;
  const messages = (Array.isArray(p.messages) ? p.messages : []) as Array<Record<string, any>>;
  const loading = Boolean(p.isLoading);
  const onSend = p.onSendMessage as ((query: string) => void) | undefined;
  const onClear = undefined;
  const onSelectContact = p.onOpenContact as ((id: string) => void) | undefined;
  const onDraftAction = p.onDraftInComposer as ((action: any) => void) | undefined;

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loading, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !onSend) return;
    onSend(trimmed);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <aside
      aria-label="Ask Scale Chat"
      className="fixed top-[46px] right-0 bottom-0 z-40 w-full sm:w-[400px] bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col text-[var(--tx-primary)] transition-transform duration-200"
    >
      {/* Minimal Slide-Out Header */}
      <div className="h-12 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Sparkles size={13} />
          </span>
          <span className="text-[13.5px] font-semibold tracking-tight text-[var(--tx-primary)]">
            Ask Scale
          </span>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Clear conversation"
              className="p-1.5 rounded-md text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-canvas)] transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close Ask Scale"
            className="p-1.5 rounded-md text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-canvas)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Conversation Body (Zero Suggested Prompt Clutter) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 select-none">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--tx-muted)] mb-3">
              <MessageSquare size={16} />
            </div>
            <p className="text-[13px] font-medium text-[var(--tx-primary)]">
              How can I help?
            </p>
            <p className="text-xs text-[var(--tx-muted)] mt-1 leading-relaxed">
              Ask any question across your accounts, pipeline deals, or investors.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const structured = msg.structured as Record<string, any> | undefined;
            const metrics = Array.isArray(structured?.metrics) ? structured.metrics : [];
            const rows = Array.isArray(structured?.rows) ? structured.rows : [];
            const matchedContacts = Array.isArray(structured?.matchedContacts)
              ? structured.matchedContacts
              : [];
            const draftAction = structured?.composerAction || structured?.draftAction;

            if (isUser) {
              return (
                <div key={msg.id || idx} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-[#2E5A8A] text-white text-[13px] leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id || idx} className="flex justify-start">
                <div className="w-full rounded-xl px-3.5 py-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3 text-[13px]">
                  <div
                    className={`leading-relaxed whitespace-pre-wrap ${
                      msg.error ? 'text-rose-400' : 'text-[var(--tx-primary)]'
                    }`}
                  >
                    {structured?.summary || msg.text}
                  </div>

                  {/* Optional KPI Strip */}
                  {metrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {metrics.map((m: any, mIdx: number) => (
                        <div
                          key={mIdx}
                          className="px-2.5 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                        >
                          <div className="text-[10.5px] text-[var(--tx-muted)] truncate">
                            {m.label}
                          </div>
                          <div className="text-sm font-semibold font-mono tabular-nums text-[var(--tx-primary)] mt-0.5">
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Optional Compact Data Table */}
                  {rows.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                      <table className="w-full text-left border-collapse text-[11.5px]">
                        <thead>
                          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">
                            {Object.keys(rows[0]).map((col) => (
                              <th key={col} className="py-1.5 px-2.5 font-medium whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {rows.slice(0, 12).map((r: Record<string, any>, rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-[var(--bg-canvas)]/40">
                              {Object.keys(rows[0]).map((col) => (
                                <td
                                  key={col}
                                  className="py-1.5 px-2.5 text-[var(--tx-primary)] whitespace-nowrap max-w-[180px] truncate"
                                >
                                  {String(r[col] ?? '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Optional Clickable Contact Pills */}
                  {matchedContacts.length > 0 && onSelectContact && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {matchedContacts.slice(0, 8).map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelectContact(c.id)}
                          className="px-2 py-1 rounded-md text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sky-400 hover:border-sky-400/50 transition-colors"
                        >
                          {c.full_name || c.name} · {c.organization}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Optional 1-Click Outreach Action */}
                  {draftAction && onDraftAction && (
                    <button
                      type="button"
                      onClick={() => onDraftAction(draftAction)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#2E5A8A] text-white hover:bg-[#244870] transition-colors"
                    >
                      <Send size={12} />
                      {draftAction.label || 'Open in Outreach Composer'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3.5 py-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:-0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:-0.1s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Clean Bottom Chat Input */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-end gap-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus-within:border-sky-400/70 px-3 py-2 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message Ask Scale..."
            className="flex-1 max-h-[120px] resize-none bg-transparent text-[13px] text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none leading-relaxed py-0.5"
          />
          <button
            type="button"
            disabled={!input.trim() || loading}
            onClick={handleSubmit}
            aria-label="Send message"
            className="w-7 h-7 rounded-lg bg-[#2E5A8A] text-white flex items-center justify-center hover:bg-[#244870] disabled:opacity-35 disabled:hover:bg-[#2E5A8A] transition-colors shrink-0"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
