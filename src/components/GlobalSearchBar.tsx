import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Building2, Search, Sparkles, X } from 'lucide-react';
import type { Contact, CustomFieldDefinition } from '../types/crm';
import { formatCurrency, getStageBadgeStyle } from '../utils/crmHelpers';

interface GlobalSearchBarProps {
  contacts: Contact[];
  customFields: CustomFieldDefinition[];
  canViewCustomers: boolean;
  canViewInvestors: boolean;
  onSelectContact: (contactId: string) => void;
}

interface SearchMatch {
  contact: Contact;
  score: number;
  matchContext: string | null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function GlobalSearchBar({
  contacts,
  customFields,
  canViewCustomers,
  canViewInvestors,
  onSelectContact,
}: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const customFieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cf of customFields) {
      map.set(cf.field_key, cf.field_label);
    }
    return map;
  }, [customFields]);

  const accessibleContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (c.contact_type === 'customer') return canViewCustomers;
      if (c.contact_type === 'investor') return canViewInvestors;
      return true;
    });
  }, [contacts, canViewCustomers, canViewInvestors]);

  const matches = useMemo<SearchMatch[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const results: SearchMatch[] = [];

    for (const c of accessibleContacts) {
      const nameLower = c.full_name.toLowerCase();
      const orgLower = c.organization.toLowerCase();
      const titleLower = (c.title || '').toLowerCase();
      const emailLower = (c.email || '').toLowerCase();
      const ownerLower = `${c.owner || ''} ${c.owner_email || ''}`.toLowerCase();
      const locationLower = `${c.location || ''} ${c.region || ''}`.toLowerCase();

      const oppEntries: { label: string; value: string }[] = [
        { label: 'Stage', value: c.stage || '' },
        { label: 'Outcome', value: c.outcome || '' },
        { label: 'Instrument / Product', value: c.product_or_instrument || '' },
        { label: 'Next Step', value: c.next_step || '' },
        { label: 'Expected Close', value: c.expected_close || '' },
        { label: 'Persona', value: c.buyer_persona || '' },
        { label: 'Industry', value: c.industry || '' },
        { label: 'Tier', value: c.tier || c.priority_tier || '' },
        { label: 'Wave', value: c.execution_wave || '' },
        { label: 'Check Size', value: c.check_size_label || '' },
        { label: 'Stage Focus', value: c.stage_focus || '' },
        { label: 'Thesis Fit', value: c.thesis_fit || '' },
        { label: 'Status', value: (c.delivery_status || '').replace(/_/g, ' ') },
        {
          label: c.contact_type === 'customer' ? 'Deal ARR' : 'Min Check',
          value:
            c.contact_type === 'customer' && c.amount_usd
              ? `${c.amount_usd} ${formatCurrency(c.amount_usd)}`
              : c.min_check_usd
              ? `${c.min_check_usd} ${formatCurrency(c.min_check_usd)}`
              : '',
        },
      ].filter((e) => e.value.trim().length > 0);

      const oppTextLower = oppEntries
        .map((e) => `${e.label} ${e.value}`)
        .join(' ')
        .toLowerCase();

      const customEntries: { label: string; rawKey: string; value: string }[] = Object.entries(
        c.custom_fields || {}
      )
        .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '')
        .map(([key, val]) => {
          const label = customFieldLabelMap.get(key) || humanizeKey(key);
          const value = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
          return { label, rawKey: key, value };
        });

      const customTextLower = customEntries
        .map((e) => `${e.label} ${e.rawKey} ${e.value}`)
        .join(' ')
        .toLowerCase();

      const notesEntries: { label: string; value: string }[] = [
        ...(c.custom_hook ? [{ label: 'Hook', value: c.custom_hook }] : []),
        ...(c.notes ? [{ label: 'Account Note', value: c.notes }] : []),
        ...(c.last_reply_subject
          ? [{ label: 'Reply', value: `${c.last_reply_subject} ${c.last_reply_snippet || ''}` }]
          : []),
        ...(c.quick_notes || []).map((qn) => ({
          label: `Quick Note (${qn.author_name})`,
          value: qn.text,
        })),
      ];

      const notesTextLower = notesEntries
        .map((n) => `${n.label} ${n.value}`)
        .join(' ')
        .toLowerCase();

      const combined = `${nameLower} ${orgLower} ${titleLower} ${emailLower} ${ownerLower} ${locationLower} ${oppTextLower} ${customTextLower} ${notesTextLower}`;

      if (!tokens.every((t) => combined.includes(t))) {
        continue;
      }

      let score = 10;
      let matchContext: string | null = null;

      if (nameLower.startsWith(trimmed)) score += 120;
      else if (nameLower.includes(trimmed)) score += 85;

      if (orgLower.startsWith(trimmed)) score += 105;
      else if (orgLower.includes(trimmed)) score += 75;

      if (emailLower.includes(trimmed)) score += 55;
      if (titleLower.includes(trimmed)) score += 45;

      const nameOrOrgMatched = tokens.every(
        (t) => nameLower.includes(t) || orgLower.includes(t)
      );

      // Detect specific field context when match comes from custom fields, deals, or notes
      const matchedCustom = customEntries.find((e) => {
        const pair = `${e.label} ${e.rawKey} ${e.value}`.toLowerCase();
        return tokens.some((t) => pair.includes(t));
      });
      if (matchedCustom) {
        score += 35;
        if (!nameOrOrgMatched) {
          matchContext = `Custom · ${matchedCustom.label}: ${matchedCustom.value}`;
        }
      }

      const matchedOpp = oppEntries.find((e) => {
        const pair = `${e.label} ${e.value}`.toLowerCase();
        return tokens.some((t) => pair.includes(t));
      });
      if (matchedOpp) {
        score += 30;
        if (!matchContext && !nameOrOrgMatched) {
          matchContext = `${c.contact_type === 'customer' ? 'Deal' : 'Track'} · ${matchedOpp.label}: ${matchedOpp.value}`;
        }
      }

      const matchedNote = notesEntries.find((e) => {
        const pair = `${e.label} ${e.value}`.toLowerCase();
        return tokens.some((t) => pair.includes(t));
      });
      if (matchedNote) {
        score += 18;
        if (!matchContext && !nameOrOrgMatched) {
          const snippet =
            matchedNote.value.length > 72
              ? `${matchedNote.value.slice(0, 72).trim()}…`
              : matchedNote.value;
          matchContext = `${matchedNote.label}: ${snippet}`;
        }
      }

      if (!matchContext && !nameOrOrgMatched) {
        if (tokens.some((t) => ownerLower.includes(t))) {
          matchContext = `Owner · ${c.owner || c.owner_email}`;
        } else if (tokens.some((t) => locationLower.includes(t))) {
          matchContext = `Location · ${c.location || c.region}`;
        } else if (tokens.some((t) => emailLower.includes(t))) {
          matchContext = `Email · ${c.email}`;
        }
      }

      results.push({ contact: c, score, matchContext });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.contact.full_name.localeCompare(b.contact.full_name);
    });

    return results;
  }, [accessibleContacts, customFieldLabelMap, query]);

  const visibleMatches = useMemo(() => matches.slice(0, 20), [matches]);

  // Reset highlighted index when query or results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Global "/" shortcut to focus search bar when user is not typing in another field
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      setIsOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleOpenContact = (contactId: string) => {
    onSelectContact(contactId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md min-w-[190px]">
      <div className="relative flex items-center">
        <Search
          size={14}
          className="absolute left-3 text-slate-400 pointer-events-none shrink-0"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label="Global search across contacts, opportunities, and custom columns"
          placeholder="Search contacts, deals, custom columns..."
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              inputRef.current?.blur();
              return;
            }
            if (!isOpen || visibleMatches.length === 0) return;

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIndex((prev) => (prev + 1) % visibleMatches.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightedIndex(
                (prev) => (prev - 1 + visibleMatches.length) % visibleMatches.length
              );
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const chosen = visibleMatches[highlightedIndex];
              if (chosen) {
                handleOpenContact(chosen.contact.id);
              }
            }
          }}
          className="w-full h-9 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:bg-white focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200/60 transition-colors"
        />

        {query ? (
          <button
            type="button"
            aria-label="Clear global search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            <X size={13} />
          </button>
        ) : (
          <kbd className="hidden md:inline-block absolute right-2.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-[#E2E8F0] rounded pointer-events-none">
            /
          </kbd>
        )}
      </div>

      {isOpen && query.trim().length > 0 && (
        <div
          role="listbox"
          aria-label="Global search results"
          className="absolute left-0 mt-1.5 w-[min(480px,calc(100vw-2rem))] bg-white border border-[#E2E8F0] rounded-lg shadow-xl z-30 overflow-hidden"
        >
          <div className="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium tabular-nums">
              {matches.length === 0
                ? 'No matches found'
                : matches.length > visibleMatches.length
                ? `Showing top ${visibleMatches.length} of ${matches.length} results`
                : `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`}
            </span>
            <span className="hidden sm:inline text-slate-400">
              ↑↓ navigate · ↵ open drawer · esc close
            </span>
          </div>

          {visibleMatches.length === 0 ? (
            <div className="px-4 py-7 text-center space-y-1">
              <p className="text-xs font-medium text-slate-700">
                No contacts, opportunities, or custom column data matched &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400">
                Try searching by name, company, email, stage, check size, quick note, or custom field value.
              </p>
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {visibleMatches.map(({ contact, matchContext }, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const isInvestor = contact.contact_type === 'investor';
                const financialLabel = isInvestor
                  ? contact.check_size_label ||
                    (contact.min_check_usd ? formatCurrency(contact.min_check_usd) : '')
                  : contact.amount_usd
                  ? `${formatCurrency(contact.amount_usd)} ARR`
                  : '';

                return (
                  <button
                    key={contact.id}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleOpenContact(contact.id)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors flex flex-col gap-1 ${
                      isHighlighted ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isInvestor ? (
                          <Sparkles size={13} className="text-indigo-600 shrink-0" />
                        ) : (
                          <Building2 size={13} className="text-slate-500 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {contact.full_name}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          · {contact.organization}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded border whitespace-nowrap ${
                            isInvestor
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isInvestor ? 'Investor' : 'Enterprise'}
                        </span>
                        {financialLabel && (
                          <span className="text-[11px] font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            {financialLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pl-5">
                      <span className="truncate">
                        {contact.title || contact.email}
                        {contact.owner ? ` · Owner: ${contact.owner}` : ''}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 text-[10px] font-medium rounded border whitespace-nowrap shrink-0 ${getStageBadgeStyle(
                          contact.stage
                        )}`}
                      >
                        {contact.stage}
                      </span>
                    </div>

                    {matchContext && (
                      <div className="flex items-center gap-1.5 text-[11px] text-indigo-700 pl-5 truncate">
                        <Briefcase size={11} className="shrink-0 text-indigo-500" />
                        <span className="truncate">{matchContext}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
