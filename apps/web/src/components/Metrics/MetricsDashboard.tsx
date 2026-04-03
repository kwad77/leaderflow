import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { useAppStore } from '../../stores/appStore';
import {
  fetchWeeklyBriefing,
  fetchAutomationOpportunities,
  fetchAutomationRules,
  createAutomationRule,
} from '../../lib/api';
import type { WeeklyBriefing } from '@leaderflow/shared';
import type { WorkItem } from '@leaderflow/shared';

function formatDuration(ms: number | null): string {
  if (ms === null) return 'No data';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${f.toLocaleDateString(undefined, opts)} – ${t.toLocaleDateString(undefined, opts)}`;
}

interface CreateRuleFormProps {
  item: WorkItem;
  onDone: () => void;
}

const CreateRuleForm: React.FC<CreateRuleFormProps> = ({ item, onDone }) => {
  const [name, setName] = useState(
    item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  );
  const [type, setType] = useState('routing_rule');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#f1f5f9',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createAutomationRule({
        name,
        type,
        condition: { titleContains: item.title },
        action: {},
      });
      setDone(true);
      setTimeout(onDone, 1500);
    } catch (err) {
      console.error('Failed to create rule:', err);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div style={{ fontSize: 11, color: '#22c55e', padding: '4px 0' }}>
        Rule created successfully
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        style={inputStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Rule name"
        required
      />
      <select
        style={inputStyle}
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="routing_rule">Routing Rule</option>
        <option value="approval_chain">Approval Chain</option>
        <option value="recurring_task">Recurring Task</option>
        <option value="status_update">Status Update</option>
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onDone}
          style={{
            flex: 1,
            padding: '5px 0',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            flex: 2,
            padding: '5px 0',
            background: saving ? '#334155' : '#3b82f6',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Creating…' : 'Create Rule'}
        </button>
      </div>
    </form>
  );
};

interface MetricsDashboardProps {
  isDemo?: boolean;
  demoWeeklyData?: WeeklyBriefing;
  demoOpportunities?: WorkItem[];
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  isDemo = false,
  demoWeeklyData,
  demoOpportunities,
}) => {
  const { metricsOpen, setMetricsOpen } = useAppStore();
  const [data, setData] = useState<WeeklyBriefing | null>(null);
  const [opportunities, setOpportunities] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRuleForm, setExpandedRuleForm] = useState<string | null>(null);

  useEffect(() => {
    if (!metricsOpen) return;

    // In demo mode, use injected data directly — no fetch
    if (isDemo && demoWeeklyData) {
      setData(demoWeeklyData);
      setOpportunities(demoOpportunities ?? []);
      return;
    }

    setLoading(true);
    Promise.all([
      fetchWeeklyBriefing(),
      fetchAutomationOpportunities(),
    ])
      .then(([briefing, opps]) => {
        setData(briefing);
        setOpportunities(opps);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [metricsOpen, isDemo, demoWeeklyData, demoOpportunities]);

  if (!metricsOpen) return null;

  const cardStyle: React.CSSProperties = {
    background: '#1e293b',
    borderRadius: 10,
    padding: '16px 18px',
    border: '1px solid #334155',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 12,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'rgba(15,23,42,0.95)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            Weekly Review
          </div>
          {data && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {formatDateRange(data.period.from, data.period.to)}
            </div>
          )}
        </div>
        <button
          onClick={() => setMetricsOpen(false)}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#94a3b8',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              color: '#475569',
              fontSize: 13,
            }}
          >
            Loading metrics…
          </div>
        )}

        {!loading && data && (
          <>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={cardStyle}>
                <div style={sectionTitle}>Completed</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>
                  {data.stats.completedThisWeek}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>this week</div>
              </div>
              <div style={cardStyle}>
                <div style={sectionTitle}>Created</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}>
                  {data.stats.createdThisWeek}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>this week</div>
              </div>
              <div style={cardStyle}>
                <div style={sectionTitle}>Overdue Now</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: data.stats.overdueNow > 0 ? '#ef4444' : '#22c55e',
                  }}
                >
                  {data.stats.overdueNow}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>items</div>
              </div>
            </div>

            {/* Timing cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={cardStyle}>
                <div style={sectionTitle}>Avg Triage Speed</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>
                  {formatDuration(data.triageSpeedMs)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  INGRESS created → acknowledged
                </div>
              </div>
              <div style={cardStyle}>
                <div style={sectionTitle}>Avg Escalation Response</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>
                  {formatDuration(data.escalationResponseMs)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  ESCALATION created → acknowledged
                </div>
              </div>
            </div>

            {/* Delegation Ratio Chart */}
            <div style={cardStyle}>
              <div style={sectionTitle}>Delegation vs Ingress — Daily</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.delegationRatioByDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Line
                    type="monotone"
                    dataKey="delegations"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Delegations"
                  />
                  <Line
                    type="monotone"
                    dataKey="ingress"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    name="Ingress"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Team Completion Chart */}
            {data.completionByMember.length > 0 && (
              <div style={cardStyle}>
                <div style={sectionTitle}>Team Completion This Week</div>
                <ResponsiveContainer width="100%" height={Math.max(160, data.completionByMember.length * 36)}>
                  <BarChart
                    data={data.completionByMember}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 60, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                    <Bar dataKey="assigned" fill="#3b82f6" name="Assigned" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Automation Opportunities */}
            {opportunities.length > 0 && (
              <div style={cardStyle}>
                <div style={sectionTitle}>Automation Opportunities ({opportunities.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {opportunities.map((opp) => (
                    <div
                      key={opp.id}
                      style={{
                        padding: '10px 12px',
                        background: '#0f172a',
                        borderRadius: 8,
                        border: '1px solid #334155',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                            {opp.title}
                          </div>
                          {opp.aiAutomationNotes && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                              {opp.aiAutomationNotes}
                            </div>
                          )}
                        </div>
                        {expandedRuleForm !== opp.id && (
                          <button
                            onClick={() => setExpandedRuleForm(opp.id)}
                            style={{
                              padding: '4px 10px',
                              background: '#1e3a5f',
                              border: '1px solid #3b82f6',
                              borderRadius: 6,
                              color: '#7dd3fc',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Create Rule
                          </button>
                        )}
                      </div>
                      {expandedRuleForm === opp.id && (
                        <CreateRuleForm
                          item={opp}
                          onDone={() => setExpandedRuleForm(null)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {opportunities.length === 0 && (
              <div style={cardStyle}>
                <div style={sectionTitle}>Automation Opportunities</div>
                <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '16px 0' }}>
                  No automatable items found this week.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
