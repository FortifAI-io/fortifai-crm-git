import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Check, FileSpreadsheet, Link2, Sparkles, Upload, X } from 'lucide-react';
import type {
  Contact,
  ContactType,
  CrmUser,
  CustomFieldDefinition,
  CustomFieldType,
  DetectedColumnMapping,
  Quarter,
  Region,
} from '../../types/crm';
import { inferRegionFromLocation } from '../../utils/crmHelpers';

interface CsvImportModalProps {
  existingCustomFields: CustomFieldDefinition[];
  canEditCustomers: boolean;
  canEditInvestors: boolean;
  activeUsers: CrmUser[];
  defaultOwnerId: string;
  onClose: () => void;
  onImport: (contacts: Contact[], newCustomFields: CustomFieldDefinition[]) => void;
}

const CORE_HEADER_ALIASES: Record<string, string> = {
  email: 'email',
  'email address': 'email',
  'e-mail': 'email',
  'full name': 'full_name',
  name: 'full_name',
  partner: 'full_name',
  contact: 'full_name',
  'contact name': 'full_name',
  'first name': 'first_name',
  'last name': 'last_name',
  fund: 'organization',
  firm: 'organization',
  company: 'organization',
  account: 'organization',
  'account name': 'organization',
  organization: 'organization',
  title: 'title',
  role: 'title',
  sector: 'industry',
  industry: 'industry',
  vertical: 'industry',
  location: 'location',
  city: 'location',
  hq: 'location',
  country: 'location',
  region: 'region',
  tier: 'tier',
  'icp score': 'icp_score',
  score: 'icp_score',
  'fit score': 'icp_score',
  'fortune 500': 'fortune_500',
  f500: 'fortune_500',
  persona: 'buyer_persona',
  'buyer persona': 'buyer_persona',
  priority: 'priority_tier',
  wave: 'execution_wave',
  'execution wave': 'execution_wave',
  'check size': 'check_size_label',
  'custom hook': 'custom_hook',
  hook: 'custom_hook',
  status: 'stage',
  stage: 'stage',
  outcome: 'outcome',
  arr: 'amount_usd',
  'target arr': 'amount_usd',
  amount: 'amount_usd',
  check: 'amount_usd',
  probability: 'probability',
  'prob %': 'probability',
  quarter: 'expected_close',
  'expected close': 'expected_close',
  'close quarter': 'expected_close',
  aging: 'aging_days',
  'aging days': 'aging_days',
  owner: 'owner',
  'next step': 'next_step',
  notes: 'notes',
};

function toSlugKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function inferFieldTypeFromSamples(samples: string[]): {
  type: CustomFieldType;
  options?: string[];
} {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return { type: 'text' };

  const boolSet = new Set(['true', 'false', 'yes', 'no', 'y', 'n', '1', '0']);
  if (nonEmpty.every((v) => boolSet.has(v.toLowerCase()))) {
    return { type: 'boolean' };
  }

  if (nonEmpty.every((v) => !Number.isNaN(Number(v.replace(/[$,%]/g, ''))) && v !== '')) {
    return { type: 'number' };
  }

  if (
    nonEmpty.every(
      (v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)
    )
  ) {
    return { type: 'date' };
  }

  const distinct = Array.from(new Set(nonEmpty));
  if (distinct.length >= 2 && distinct.length <= 6 && nonEmpty.length >= 3) {
    return { type: 'select', options: distinct };
  }

  return { type: 'text' };
}

function parseDelimitedText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect tab-separated (pasted straight from Google Sheets / Excel) vs comma-separated
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

  const splitRow = (line: string): string[] => {
    if (delimiter === '\t') return line.split('\t').map((c) => c.trim());
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitRow(lines[0]).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function normalizeGoogleSheetCsvUrl(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    const gidMatch = trimmed.match(/gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  }
  return trimmed;
}

export function CsvImportModal({
  existingCustomFields,
  canEditCustomers,
  canEditInvestors,
  activeUsers,
  defaultOwnerId,
  onClose,
  onImport,
}: CsvImportModalProps) {
  const [importType, setImportType] = useState<ContactType>(
    canEditCustomers ? 'customer' : 'investor'
  );
  const [rawText, setRawText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<DetectedColumnMapping[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const buildMappingsFromTable = (headers: string[], rows: Record<string, string>[]) => {
    const existingByKey = new Map(existingCustomFields.map((f) => [f.field_key, f]));

    const detected: DetectedColumnMapping[] = headers.map((header) => {
      const normalized = header.trim().toLowerCase();
      const coreField = CORE_HEADER_ALIASES[normalized];
      const slug = toSlugKey(header);
      const samples = rows.slice(0, 12).map((r) => String(r[header] ?? ''));
      const inferred = inferFieldTypeFromSamples(samples);
      const existingCustom = existingByKey.get(slug);

      if (coreField) {
        return {
          sourceHeader: header,
          normalizedKey: normalized,
          targetType: 'core',
          coreField,
          customLabel: header.trim(),
          customKey: slug,
          inferredType: inferred.type,
          sampleValues: samples.filter(Boolean).slice(0, 3),
        };
      }

      return {
        sourceHeader: header,
        normalizedKey: normalized,
        targetType: 'custom',
        customLabel: existingCustom ? existingCustom.field_label : header.trim(),
        customKey: slug,
        inferredType: existingCustom ? existingCustom.field_type : inferred.type,
        selectOptions: existingCustom ? existingCustom.select_options : inferred.options,
        sampleValues: samples.filter(Boolean).slice(0, 3),
        alreadyExists: Boolean(existingCustom),
      };
    });

    setParsedHeaders(headers);
    setParsedRows(rows);
    setMappings(detected);
  };

  const handleTextChange = (val: string) => {
    setRawText(val);
    setFileName(null);
    setErrorMsg(null);
    const { headers, rows } = parseDelimitedText(val);
    if (headers.length > 0 && rows.length > 0) {
      buildMappingsFromTable(headers, rows);
    } else {
      setParsedHeaders([]);
      setParsedRows([]);
      setMappings([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setErrorMsg('The uploaded workbook has no sheets.');
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      if (matrix.length < 2) {
        setErrorMsg('Sheet must contain a header row and at least one data row.');
        return;
      }

      const headers = (matrix[0] as unknown[])
        .map((h) => String(h ?? '').trim())
        .filter(Boolean);
      const rows: Record<string, string>[] = [];

      for (let i = 1; i < matrix.length; i++) {
        const line = matrix[i] as unknown[];
        if (!line || line.every((cell) => String(cell ?? '').trim() === '')) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = String(line[idx] ?? '').trim();
        });
        rows.push(row);
      }

      if (headers.length === 0 || rows.length === 0) {
        setErrorMsg('No columns or rows could be read from this file.');
        return;
      }

      buildMappingsFromTable(headers, rows);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? `Unable to parse file: ${err.message}` : 'Unable to parse file.'
      );
    }
  };

  const handleFetchGoogleSheet = async () => {
    if (!sheetUrl.trim()) return;
    setFetchingSheet(true);
    setErrorMsg(null);
    try {
      const csvUrl = normalizeGoogleSheetCsvUrl(sheetUrl);
      const resp = await fetch(csvUrl);
      if (!resp.ok) {
        throw new Error(
          `HTTP ${resp.status}. Make sure the Google Sheet sharing is set to "Anyone with the link can view" or File -> Share -> Publish to web as CSV.`
        );
      }
      const csvText = await resp.text();
      if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
        throw new Error(
          'Google returned a login page instead of CSV. Set the sheet to "Anyone with the link" or export as .xlsx / .csv and upload it.'
        );
      }
      setRawText(csvText);
      const { headers, rows } = parseDelimitedText(csvText);
      if (headers.length === 0 || rows.length === 0) {
        throw new Error('Fetched file did not contain valid CSV rows.');
      }
      setFileName('Google Sheet');
      buildMappingsFromTable(headers, rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch Google Sheet.');
    } finally {
      setFetchingSheet(false);
    }
  };

  const updateMapping = (index: number, patch: Partial<DetectedColumnMapping>) => {
    setMappings((prev) => prev.map((m, idx) => (idx === index ? { ...m, ...patch } : m)));
  };

  const newCustomColumnCount = useMemo(
    () => mappings.filter((m) => m.targetType === 'custom' && !m.alreadyExists).length,
    [mappings]
  );

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) {
      setErrorMsg('Upload an Excel/CSV file, fetch a Google Sheet, or paste rows first.');
      return;
    }

    const existingKeys = new Set(existingCustomFields.map((f) => f.field_key));
    const newCustomFields: CustomFieldDefinition[] = [];

    mappings
      .filter((m) => m.targetType === 'custom' && m.customKey && !existingKeys.has(m.customKey))
      .forEach((m, idx) => {
        existingKeys.add(m.customKey);
        newCustomFields.push({
          id: `cf_imp_${Date.now()}_${idx}`,
          entity_scope: importType,
          field_key: m.customKey,
          field_label: m.customLabel || m.sourceHeader,
          field_type: m.inferredType,
          select_options:
            m.inferredType === 'select'
              ? m.selectOptions && m.selectOptions.length > 0
                ? m.selectOptions
                : Array.from(
                    new Set(parsedRows.map((r) => r[m.sourceHeader]?.trim()).filter(Boolean))
                  ).slice(0, 12)
              : undefined,
        });
      });

    const parsedContacts: Contact[] = [];

    parsedRows.forEach((row, i) => {
      const core: Record<string, string> = {};
      const customFieldsObj: Record<string, string | number | boolean> = {};

      mappings.forEach((m) => {
        const rawVal = (row[m.sourceHeader] ?? '').trim();
        if (m.targetType === 'core' && m.coreField) {
          core[m.coreField] = rawVal;
        } else if (m.targetType === 'custom' && m.customKey && rawVal !== '') {
          if (m.inferredType === 'boolean') {
            customFieldsObj[m.customKey] = ['true', 'yes', 'y', '1'].includes(rawVal.toLowerCase());
          } else if (m.inferredType === 'number') {
            const num = Number(rawVal.replace(/[$,%]/g, ''));
            customFieldsObj[m.customKey] = Number.isNaN(num) ? rawVal : num;
          } else {
            customFieldsObj[m.customKey] = rawVal;
          }
        }
      });

      const org = core.organization || '';
      const email =
        core.email ||
        (org
          ? `contact@${org.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`
          : '');
      if (!email && !org && !core.full_name) return;

      const fullName =
        core.full_name ||
        `${core.first_name || ''} ${core.last_name || ''}`.trim() ||
        email.split('@')[0] ||
        org;

      const loc = core.location || '';
      const inferredRegion = (core.region as Region) || inferRegionFromLocation(loc);
      const outcome = core.outcome || '';
      const status =
        core.stage || (importType === 'investor' ? 'Not sent' : '2 Qualified');
      const isPassed = outcome.toLowerCase() === 'pass' || status.toLowerCase() === 'passed';
      const parsedAmount = Number((core.amount_usd || '250000').replace(/[^0-9]/g, ''));
      const parsedProb = core.probability
        ? Number(core.probability.replace(/[^0-9]/g, ''))
        : importType === 'customer'
        ? 20
        : 25;
      const parsedScore = core.icp_score
        ? Number(core.icp_score.replace(/[^0-9]/g, ''))
        : 88;

      const ownerInput = (core.owner || '').trim().toLowerCase();
      const matchedOwner =
        activeUsers.find(
          (u) =>
            u.id.toLowerCase() === ownerInput ||
            u.email.toLowerCase() === ownerInput ||
            u.full_name.toLowerCase() === ownerInput ||
            u.full_name.toLowerCase().startsWith(ownerInput)
        ) ||
        activeUsers.find((u) => u.id === defaultOwnerId) ||
        activeUsers[0];

      parsedContacts.push({
        id: `imp_${Date.now()}_${i}`,
        email,
        first_name: core.first_name || fullName.split(' ')[0] || '',
        last_name: core.last_name || fullName.split(' ').slice(1).join(' '),
        full_name: fullName,
        organization: org || 'Unknown Organization',
        title: core.title || (importType === 'investor' ? 'Partner' : 'Executive'),
        region: inferredRegion,
        location: loc || inferredRegion,
        contact_type: importType,
        priority_tier: (core.priority_tier as 'P1' | 'P2' | 'P3' | 'P4') || 'P2',
        execution_wave:
          core.execution_wave ||
          (inferredRegion === 'US'
            ? 'Wave 1 Lead'
            : 'India / UAE / Singapore Strategic & Family Offices'),
        us_inst_seed_track: inferredRegion === 'US',
        check_size_label: core.check_size_label || '',
        custom_hook: core.custom_hook || '',
        tier: (core.tier as 'Tier I' | 'Tier II') || 'Tier I',
        buyer_persona:
          (core.buyer_persona as 'CCO/GC' | 'CAE' | 'CFO' | 'CPO') || 'CCO/GC',
        industry: core.industry || 'Enterprise',
        icp_score: Math.min(100, Math.max(0, parsedScore || 88)),
        fortune_500: ['true', 'yes', 'y', '1'].includes(
          (core.fortune_500 || '').toLowerCase()
        ),
        stage: isPassed ? 'Passed' : status,
        outcome,
        amount_usd: parsedAmount || 250000,
        probability: Math.min(100, Math.max(0, parsedProb || 20)),
        expected_close: (core.expected_close as Quarter) || 'Q2 2027',
        aging_days: Number((core.aging_days || '15').replace(/[^0-9]/g, '')) || 15,
        owner_id: matchedOwner?.id || 'usr_varun',
        owner_email: matchedOwner?.email || 'varun@fortifai.io',
        owner: matchedOwner?.full_name || 'Varun Mowar',
        next_step: core.next_step || '',
        notes: core.notes || '',
        unsubscribed: isPassed,
        custom_fields: customFieldsObj,
      });
    });

    if (parsedContacts.length === 0) {
      setErrorMsg('No valid contact/account rows were parsed.');
      return;
    }

    onImport(parsedContacts, newCustomFields);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-lg max-w-3xl w-full p-6 space-y-4 shadow-xl my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Import Google Sheet or Excel (.xlsx / .csv) — Auto-Column Detection
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Target Table & File Upload */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Import Into:</span>
              {canEditCustomers && (
                <button
                  type="button"
                  onClick={() => setImportType('customer')}
                  className={`px-3 py-1.5 rounded border font-medium whitespace-nowrap ${
                    importType === 'customer'
                      ? 'bg-[#0D1520] text-white border-[#0D1520]'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Enterprise Customers
                </button>
              )}
              {canEditInvestors && (
                <button
                  type="button"
                  onClick={() => setImportType('investor')}
                  className={`px-3 py-1.5 rounded border font-medium whitespace-nowrap ${
                    importType === 'investor'
                      ? 'bg-[#0D1520] text-white border-[#0D1520]'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Investors ($3M Seed)
                </button>
              )}
            </div>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded cursor-pointer whitespace-nowrap">
              <Upload size={13} />
              {fileName ? `Loaded: ${fileName}` : 'Upload .xlsx / .xls / .csv'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.ods"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Direct Google Sheet URL Fetch */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 w-full">
              <Link2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="Or paste a public Google Sheet URL (https://docs.google.com/spreadsheets/d/...)"
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white"
              />
            </div>
            <button
              type="button"
              disabled={fetchingSheet || !sheetUrl.trim()}
              onClick={handleFetchGoogleSheet}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 rounded-md disabled:opacity-40 whitespace-nowrap"
            >
              {fetchingSheet ? 'Fetching...' : 'Fetch Sheet'}
            </button>
          </div>

          {/* Paste CSV / Tab-Separated Google Sheet / Excel Rows */}
          <div>
            <div className="text-[11px] text-slate-500 mb-1.5">
              Or copy &amp; paste rows directly from Google Sheets / Excel. Unrecognized columns
              are automatically inferred and added as new CRM data columns:
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={`Account,Full Name,Email,Sector,Location,Tier,ICP Score,ARR,SOC2 Certified,Primary ERP\nSiemens,Hans Weber,hans.weber@siemens.com,Industrial Automation,Munich Europe,Tier I,94,300000,Yes,SAP S/4HANA`}
              className="w-full p-2.5 font-mono text-[11px] bg-slate-50 border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white"
            />
          </div>

          {/* Live Auto-Detected Column Schema Mapping Preview */}
          {mappings.length > 0 && (
            <div className="border border-[#E2E8F0] rounded-md overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Sparkles size={13} className="text-indigo-600" />
                  Detected {parsedHeaders.length} Columns across {parsedRows.length} Rows
                </div>
                <span className="text-[11px] text-indigo-700 font-medium">
                  {newCustomColumnCount} new custom{' '}
                  {newCustomColumnCount === 1 ? 'column' : 'columns'} will be created automatically
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {mappings.map((m, idx) => (
                  <div
                    key={m.sourceHeader}
                    className="px-3.5 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 truncate">
                        {m.sourceHeader}
                      </div>
                      <div className="text-slate-400 truncate">
                        Sample: {m.sampleValues.join(', ') || '—'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={m.targetType}
                        onChange={(e) =>
                          updateMapping(idx, {
                            targetType: e.target.value as 'core' | 'custom' | 'skip',
                          })
                        }
                        className="bg-white border border-[#E2E8F0] rounded px-2 py-1 text-slate-700 font-medium"
                      >
                        {m.coreField && <option value="core">Core Field ({m.coreField})</option>}
                        <option value="custom">
                          {m.alreadyExists ? 'Existing Custom Column' : '+ Auto-Create Column'}
                        </option>
                        <option value="skip">Skip Column</option>
                      </select>

                      {m.targetType === 'custom' && (
                        <select
                          value={m.inferredType}
                          onChange={(e) =>
                            updateMapping(idx, {
                              inferredType: e.target.value as CustomFieldType,
                            })
                          }
                          className="bg-slate-50 border border-[#E2E8F0] rounded px-2 py-1 text-slate-700"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="select">Select</option>
                          <option value="boolean">Yes/No</option>
                          <option value="date">Date</option>
                        </select>
                      )}

                      {m.targetType === 'core' && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium px-1.5">
                          <Check size={12} /> Mapped
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMsg && <div className="text-[11px] text-rose-600 font-medium">{errorMsg}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={parsedRows.length === 0}
            className="px-4 py-2 text-xs font-medium bg-[#0D1520] text-white rounded-md hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
          >
            Import {parsedRows.length > 0 ? `${parsedRows.length} Rows` : 'Rows'} &amp; Sync
            Columns
          </button>
        </div>
      </div>
    </div>
  );
}
