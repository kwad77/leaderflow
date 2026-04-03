import React, { useState } from 'react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Path = 'choose' | 'csv' | 'manual';
type Step = 'welcome' | 'import' | 'manual' | 'done';

interface CsvRow {
  name: string;
  email: string;
  role: string;
  manager: string;
}

interface ManualMember {
  name: string;
  email: string;
  role: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1, 11).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return {
      name: row['name'] ?? '',
      email: row['email'] ?? '',
      role: row['role'] ?? '',
      manager: row['manager'] ?? '',
    };
  });
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const CARD_STYLE: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 12,
  maxWidth: 560,
  width: '100%',
  padding: '32px 32px 28px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
  color: '#f1f5f9',
  fontFamily: 'inherit',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#f1f5f9',
  margin: 0,
  letterSpacing: '-0.02em',
};

const SUBTEXT_STYLE: React.CSSProperties = {
  color: '#64748b',
  fontSize: 13,
  marginTop: 6,
  lineHeight: 1.5,
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: '10px 20px',
  background: '#3b82f6',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
};

const BTN_SECONDARY: React.CSSProperties = {
  padding: '10px 20px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 7,
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#f1f5f9',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom: 4,
  display: 'block',
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [path, setPath] = useState<Path>('choose');

  // CSV state
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Manual state
  const [root, setRoot] = useState<ManualMember>({ name: '', email: '', role: '' });
  const [rootId, setRootId] = useState<string | null>(null);
  const [rootSaving, setRootSaving] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [report, setReport] = useState<ManualMember>({ name: '', email: '', role: '' });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  // ─── Welcome step ──────────────────────────────────────────────────────────
  const handleChooseCsv = () => {
    setPath('csv');
    setStep('import');
  };

  const handleChooseManual = () => {
    setPath('manual');
    setStep('manual');
  };

  // ─── CSV step ──────────────────────────────────────────────────────────────
  const handlePreview = () => {
    setCsvError(null);
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      setCsvError('Could not parse any rows. Make sure the first line is a header (name,email,role,manager).');
      return;
    }
    setCsvPreview(rows);
  };

  const handleImportCsv = async () => {
    setCsvError(null);
    if (!csvText.trim()) {
      setCsvError('Paste your CSV data first.');
      return;
    }
    setCsvImporting(true);
    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMemberCount(data.count ?? csvPreview.length);
      setStep('done');
    } catch (err: unknown) {
      setCsvError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setCsvImporting(false);
    }
  };

  // ─── Manual step ──────────────────────────────────────────────────────────
  const handleCreateRoot = async () => {
    setRootError(null);
    if (!root.name.trim() || !root.email.trim() || !root.role.trim()) {
      setRootError('All fields are required.');
      return;
    }
    setRootSaving(true);
    try {
      const res = await fetch('/api/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: root.name, email: root.email, role: root.role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const member = await res.json();
      setRootId(member.id);
      setMemberCount(1);
    } catch (err: unknown) {
      setRootError(err instanceof Error ? err.message : 'Failed to create member');
    } finally {
      setRootSaving(false);
    }
  };

  const handleAddReport = async () => {
    setReportError(null);
    if (!report.name.trim() || !report.email.trim() || !report.role.trim()) {
      setReportError('All fields are required.');
      return;
    }
    setReportSaving(true);
    try {
      const res = await fetch('/api/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: report.name, email: report.email, role: report.role, parentId: rootId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setReport({ name: '', email: '', role: '' });
      setMemberCount((c) => c + 1);
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setReportSaving(false);
    }
  };

  const handleManualDone = () => {
    setStep('done');
  };

  // ─── Done step ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (step === 'done') {
      const timer = setTimeout(() => onComplete(), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, onComplete]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={OVERLAY_STYLE}>
      <div style={CARD_STYLE}>
        {step === 'welcome' && (
          <WelcomeStep
            demoMode={demoMode}
            onCsv={handleChooseCsv}
            onManual={handleChooseManual}
          />
        )}
        {step === 'import' && path === 'csv' && (
          <CsvStep
            csvText={csvText}
            setCsvText={(v) => { setCsvText(v); setCsvPreview([]); }}
            csvPreview={csvPreview}
            onPreview={handlePreview}
            onImport={handleImportCsv}
            onRepaste={() => setCsvPreview([])}
            importing={csvImporting}
            error={csvError}
            onBack={() => { setStep('welcome'); setPath('choose'); }}
          />
        )}
        {step === 'manual' && (
          <ManualStep
            root={root}
            setRoot={setRoot}
            rootId={rootId}
            rootSaving={rootSaving}
            rootError={rootError}
            onCreateRoot={handleCreateRoot}
            report={report}
            setReport={setReport}
            reportSaving={reportSaving}
            reportError={reportError}
            onAddReport={handleAddReport}
            memberCount={memberCount}
            onDone={handleManualDone}
            onBack={() => { setStep('welcome'); setPath('choose'); setRootId(null); setMemberCount(0); }}
          />
        )}
        {step === 'done' && (
          <DoneStep memberCount={memberCount} />
        )}
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface WelcomeStepProps {
  demoMode: boolean;
  onCsv: () => void;
  onManual: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ demoMode, onCsv, onManual }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        LeaderFlow
      </span>
    </div>

    <h1 style={HEADING_STYLE}>Welcome to LeaderFlow</h1>
    <p style={{ ...SUBTEXT_STYLE, fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
      Your org chart is your interface.
    </p>

    <p style={{ ...SUBTEXT_STYLE, marginTop: 16 }}>
      LeaderFlow maps your organization as a living graph and routes work through it.
      Each person is a node — colored by their activity signal:
    </p>

    <div
      style={{
        marginTop: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: '#1e293b',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      {[
        { color: '#ef4444', label: 'Red', desc: 'Escalation or at-risk item needing attention' },
        { color: '#3b82f6', label: 'Blue', desc: 'Active ingress — work arriving from above or outside' },
        { color: '#f97316', label: 'Orange', desc: 'Stale or delegated item waiting on a report' },
      ].map(({ color, label, desc }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{label}</span> — {desc}
          </span>
        </div>
      ))}
    </div>

    <p style={{ ...SUBTEXT_STYLE, marginTop: 16 }}>
      Let's get your team set up. How would you like to start?
    </p>

    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      <button style={BTN_PRIMARY} onClick={onCsv}>
        Import from CSV
      </button>
      <button style={BTN_SECONDARY} onClick={onManual}>
        Add team manually
      </button>
    </div>

    <div style={{ marginTop: 14 }}>
      {demoMode ? (
        <span style={{ fontSize: 12, color: '#475569' }}>You are viewing demo data.</span>
      ) : (
        <a
          href={`${window.location.origin}?demo=true`}
          style={{ fontSize: 12, color: '#475569', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Use demo data instead
        </a>
      )}
    </div>
  </div>
);

// ─── CSV Step ────────────────────────────────────────────────────────────────

interface CsvStepProps {
  csvText: string;
  setCsvText: (v: string) => void;
  csvPreview: CsvRow[];
  onPreview: () => void;
  onImport: () => void;
  onRepaste: () => void;
  importing: boolean;
  error: string | null;
  onBack: () => void;
}

const CsvStep: React.FC<CsvStepProps> = ({
  csvText, setCsvText, csvPreview, onPreview, onImport, onRepaste, importing, error, onBack,
}) => (
  <div>
    <button
      onClick={onBack}
      style={{ background: 'none', border: 'none', color: '#475569', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 16 }}
    >
      ← Back
    </button>

    <h2 style={{ ...HEADING_STYLE, fontSize: 18, marginBottom: 4 }}>Import from CSV</h2>
    <p style={SUBTEXT_STYLE}>
      Paste your CSV below. The first row must be a header:{' '}
      <code style={{ color: '#7dd3fc', fontSize: 11 }}>name,email,role,manager</code>
    </p>

    <div style={{ marginTop: 4 }}>
      <a
        href="/api/import/template"
        download
        style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}
      >
        Download template ↓
      </a>
    </div>

    <textarea
      value={csvText}
      onChange={(e) => setCsvText(e.target.value)}
      placeholder={'name,email,role,manager\nAlice Smith,alice@acme.com,CEO,\nBob Jones,bob@acme.com,VP Engineering,Alice Smith'}
      style={{
        ...INPUT_STYLE,
        marginTop: 12,
        minHeight: 120,
        resize: 'vertical',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    />

    {error && (
      <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>{error}</div>
    )}

    {csvPreview.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Preview ({csvPreview.length} row{csvPreview.length !== 1 ? 's' : ''})
        </div>
        <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid #1e293b' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#1e293b' }}>
                {['Name', 'Email', 'Role', 'Manager'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      color: '#64748b',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvPreview.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid #1e293b', background: i % 2 === 0 ? 'transparent' : '#0a0f1a' }}
                >
                  <td style={{ padding: '5px 10px', color: '#f1f5f9' }}>{row.name || '—'}</td>
                  <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{row.email || '—'}</td>
                  <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{row.role || '—'}</td>
                  <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{row.manager || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      {csvPreview.length === 0 ? (
        <button style={BTN_SECONDARY} onClick={onPreview} disabled={!csvText.trim()}>
          Preview
        </button>
      ) : (
        <button style={BTN_PRIMARY} onClick={onImport} disabled={importing}>
          {importing ? 'Importing…' : 'Import'}
        </button>
      )}
      {csvPreview.length > 0 && (
        <button style={BTN_SECONDARY} onClick={onRepaste}>
          Re-paste
        </button>
      )}
    </div>
  </div>
);

// ─── Manual Step ─────────────────────────────────────────────────────────────

interface ManualStepProps {
  root: ManualMember;
  setRoot: React.Dispatch<React.SetStateAction<ManualMember>>;
  rootId: string | null;
  rootSaving: boolean;
  rootError: string | null;
  onCreateRoot: () => void;
  report: ManualMember;
  setReport: React.Dispatch<React.SetStateAction<ManualMember>>;
  reportSaving: boolean;
  reportError: string | null;
  onAddReport: () => void;
  memberCount: number;
  onDone: () => void;
  onBack: () => void;
}

const ManualStep: React.FC<ManualStepProps> = ({
  root, setRoot, rootId, rootSaving, rootError, onCreateRoot,
  report, setReport, reportSaving, reportError, onAddReport,
  memberCount, onDone, onBack,
}) => (
  <div>
    <button
      onClick={onBack}
      style={{ background: 'none', border: 'none', color: '#475569', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 16 }}
    >
      ← Back
    </button>

    <h2 style={{ ...HEADING_STYLE, fontSize: 18, marginBottom: 4 }}>Add your team</h2>
    <p style={SUBTEXT_STYLE}>Start with the root of your org — usually the CEO or team lead.</p>

    {!rootId ? (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MemberField label="Name" value={root.name} onChange={(v) => setRoot((r) => ({ ...r, name: v }))} placeholder="e.g. Alice Smith" />
          <MemberField label="Email" value={root.email} onChange={(v) => setRoot((r) => ({ ...r, email: v }))} placeholder="alice@company.com" type="email" />
          <MemberField label="Role / Title" value={root.role} onChange={(v) => setRoot((r) => ({ ...r, role: v }))} placeholder="e.g. CEO" />
        </div>
        {rootError && <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>{rootError}</div>}
        <button style={{ ...BTN_PRIMARY, marginTop: 16 }} onClick={onCreateRoot} disabled={rootSaving}>
          {rootSaving ? 'Saving…' : 'Create root member'}
        </button>
      </div>
    ) : (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            background: '#1e293b',
            borderRadius: 7,
            padding: '10px 14px',
            fontSize: 13,
            color: '#94a3b8',
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#4ade80', marginRight: 6 }}>✓</span>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{root.name}</span> added as root.{' '}
          {memberCount > 1 && <span>{memberCount - 1} direct report{memberCount - 1 !== 1 ? 's' : ''} added.</span>}
        </div>

        <div
          style={{
            background: '#0a0f1a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            padding: '14px 14px 12px',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>
            Add direct reports (optional)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MemberField label="Name" value={report.name} onChange={(v) => setReport((r) => ({ ...r, name: v }))} placeholder="e.g. Bob Jones" />
            <MemberField label="Email" value={report.email} onChange={(v) => setReport((r) => ({ ...r, email: v }))} placeholder="bob@company.com" type="email" />
            <MemberField label="Role / Title" value={report.role} onChange={(v) => setReport((r) => ({ ...r, role: v }))} placeholder="e.g. VP Engineering" />
          </div>
          {reportError && <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>{reportError}</div>}
          <button
            style={{ ...BTN_SECONDARY, marginTop: 12, fontSize: 12 }}
            onClick={onAddReport}
            disabled={reportSaving}
          >
            {reportSaving ? 'Adding…' : '+ Add member'}
          </button>
        </div>

        <button style={{ ...BTN_PRIMARY, marginTop: 14 }} onClick={onDone}>
          Done
        </button>
      </div>
    )}
  </div>
);

interface MemberFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

const MemberField: React.FC<MemberFieldProps> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label style={LABEL_STYLE}>{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={INPUT_STYLE}
    />
  </div>
);

// ─── Done Step ────────────────────────────────────────────────────────────────

const DoneStep: React.FC<{ memberCount: number }> = ({ memberCount }) => (
  <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 36, marginBottom: 12 }}>✦</div>
    <h2 style={{ ...HEADING_STYLE, textAlign: 'center', marginBottom: 8 }}>You're set up!</h2>
    <p style={{ ...SUBTEXT_STYLE, textAlign: 'center' }}>
      {memberCount > 0
        ? `${memberCount} member${memberCount !== 1 ? 's' : ''} added to your org.`
        : 'Your organization has been configured.'}
    </p>
    <p style={{ marginTop: 10, fontSize: 12, color: '#334155' }}>Loading your org chart…</p>
  </div>
);
