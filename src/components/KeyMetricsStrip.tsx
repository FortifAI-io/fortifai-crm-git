import { CmsText } from './CmsText';

interface KeyMetricItem {
  label: string;
  value: string;
  detail: string;
}

interface KeyMetricsStripProps {
  title?: string;
  scopeSummary: string;
  metrics: KeyMetricItem[];
  cmsSection?: string;
  cmsKeyPrefix?: string;
}

export function KeyMetricsStrip({
  title = 'Key Metrics',
  scopeSummary,
  metrics,
  cmsSection = 'Key Metrics',
  cmsKeyPrefix,
}: KeyMetricsStripProps) {
  return (
    <section
      aria-label={title}
      className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden"
    >
      <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-slate-900 tracking-tight">
          {cmsKeyPrefix ? (
            <CmsText id={`${cmsKeyPrefix}.strip_title`} defaultValue={title} section={cmsSection} />
          ) : (
            title
          )}
        </h2>
        <div className="text-[11px] text-slate-500 tabular-nums">{scopeSummary}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 tabular-nums">
        {metrics.map((m, idx) => (
          <div key={m.label} className="px-5 py-3.5">
            <div className="text-[11px] font-medium text-slate-500">
              {cmsKeyPrefix ? (
                <CmsText
                  id={`${cmsKeyPrefix}.metric_${idx}_label`}
                  defaultValue={m.label}
                  section={cmsSection}
                />
              ) : (
                m.label
              )}
            </div>
            <div className="text-xl font-semibold text-slate-900 mt-1 tracking-tight font-mono">
              {m.value}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">{m.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
