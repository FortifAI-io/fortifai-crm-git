import {
  AlertCircle,
  CheckCheck,
  Eye,
  Globe,
  MessageSquareReply,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type { DeliveryStatus } from '../types/crm';

interface DeliveryStatusBadgeProps {
  status?: DeliveryStatus;
  openedAt?: string;
  openedDurationSec?: number;
  isBotScan?: boolean;
  bouncedReason?: string;
}

export function DeliveryStatusBadge({
  status = 'not_sent',
  openedAt,
  openedDurationSec,
  isBotScan,
  bouncedReason,
}: DeliveryStatusBadgeProps) {
  // Filter out security scanner / bot hits (<10s) from showing as human Opened
  if (isBotScan || (status === 'opened' && openedDurationSec !== undefined && openedDurationSec < 10)) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-slate-100 text-slate-600 border-slate-200 whitespace-nowrap"
        title="Security scanner / bot open (<10s) automatically filtered out"
      >
        <ShieldAlert size={11} className="shrink-0" />
        Bot Scan (&lt;10s Filtered)
      </span>
    );
  }

  switch (status) {
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-slate-100 text-slate-700 border-slate-200 whitespace-nowrap">
          <Send size={11} className="shrink-0" />
          Sent
        </span>
      );
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
          <CheckCheck size={11} className="shrink-0" />
          Delivered / Received
        </span>
      );
    case 'opened':
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap"
          title={
            openedDurationSec
              ? `Verified human read (${openedDurationSec}s)`
              : 'Verified human open'
          }
        >
          <Eye size={11} className="shrink-0" />
          Opened{openedAt ? ` · ${openedAt}` : ''}
        </span>
      );
    case 'portal_visited':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-purple-50 text-purple-700 border-purple-200 whitespace-nowrap">
          <Globe size={11} className="shrink-0" />
          Portal Visited
        </span>
      );
    case 'replied':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">
          <MessageSquareReply size={11} className="shrink-0" />
          Replied
        </span>
      );
    case 'bounced':
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-rose-50 text-rose-700 border-rose-200 whitespace-nowrap"
          title={bouncedReason || 'Email bounced'}
        >
          <AlertCircle size={11} className="shrink-0" />
          Bounced
        </span>
      );
    default:
      return <span className="text-[11px] text-slate-400 whitespace-nowrap">Not sent</span>;
  }
}
