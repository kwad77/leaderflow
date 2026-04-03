import React, { useEffect, useRef, useState } from 'react';
import type { OrgMember, OrgTree, WorkItem, WorkItemType, Priority } from '@leaderflow/shared';
import { createWorkItem } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenTree(node: OrgTree): OrgMember[] {
  return [node, ...node.directReports.flatMap(flattenTree)];
}

// ─── Segmented control ────────────────────────────────────────────────────────

interface SegOption<T extends string> {
  value: T;
  label: string;
  activeColor: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '5px 0',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              border: `1px solid ${isActive ? opt.activeColor : '#334155'}`,
              borderRadius: 5,
              cursor: 'pointer',
              background: isActive ? opt.activeColor : '#1e293b',
              color: isActive ? '#fff' : '#94a3b8',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: SegOption<WorkItemType>[] = [
  { value: 'INGRESS', label: 'INGRESS', activeColor: '#f97316' },
  { value: 'DELEGATION', label: 'DELEGATION', activeColor: '#3b82f6' },
  { value: 'ESCALATION', label: 'ESCALATION', activeColor: '#ef4444' },
];

const PRIORITY_OPTIONS: SegOption<Priority>[] = [
  { value: 'LOW', label: 'LOW', activeColor: '#64748b' },
  { value: 'MEDIUM', label: 'MEDIUM', activeColor: '#3b82f6' },
  { value: 'HIGH', label: 'HIGH', activeColor: '#f97316' },
  { value: 'URGENT', label: 'URGENT', activeColor: '#ef4444' },
];

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Modal ────────────────────────────────────────────────────────────────────

export const CreateItemModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { orgTree, items, setItems } = useAppStore();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkItemType>('INGRESS');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [toMemberId, setToMemberId] = useState('');
  const [fromMemberId, setFromMemberId] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState<'Submit' | '✓ Created'>('Submit');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const members: OrgMember[] = orgTree ? flattenTree(orgTree) : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setErrorMsg('Title is required.');
      return;
    }
    if (!toMemberId) {
      setErrorMsg('Assigned to is required.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      let newItem: WorkItem;

      if (DEMO_MODE) {
        // In demo mode, fake the creation without hitting the API
        const now = new Date().toISOString();
        newItem = {
          id: `demo-${Math.random().toString(36).slice(2, 10)}`,
          title: title.trim(),
          description: description.trim() || null,
          type,
          status: 'PENDING',
          priority,
          source: 'manual',
          sourceRef: null,
          orgId: 'demo',
          fromMemberId: fromMemberId || null,
          from: fromMemberId ? members.find((m) => m.id === fromMemberId) ?? null : null,
          fromExternal: null,
          toMemberId,
          to: members.find((m) => m.id === toMemberId) ?? null,
          dueAt: dueAt || null,
          acknowledgedAt: null,
          completedAt: null,
          aiSuggestedOwner: null,
          aiSuggestedPriority: null,
          aiRationale: null,
          aiAutomatable: false,
          aiAutomationNotes: null,
          updates: [],
          tags: [],
          metadata: null,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        newItem = await createWorkItem({
          title: title.trim(),
          type,
          priority,
          toMemberId,
          fromMemberId: fromMemberId || undefined,
          description: description.trim() || undefined,
          dueAt: dueAt || undefined,
        });
      }

      setItems([...items, newItem]);
      setSubmitLabel('✓ Created');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#f1f5f9',
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 200,
        }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create work item"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: '100%',
          maxWidth: 480,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        // Prevent backdrop click bubbling from inside the card
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
            Create Work Item
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px' }}>
          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              placeholder="Brief description of the work item"
              required
              style={inputStyle}
            />
          </div>

          {/* Type */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Type</label>
            <SegmentedControl
              options={TYPE_OPTIONS}
              value={type}
              onChange={setType}
            />
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Priority</label>
            <SegmentedControl
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
            />
          </div>

          {/* Assigned to */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Assigned to <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={toMemberId}
              onChange={(e) => setToMemberId(e.target.value)}
              required
              style={selectStyle}
            >
              <option value="" disabled>
                Select a member…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* From (optional) */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>From (optional)</label>
            <select
              value={fromMemberId}
              onChange={(e) => setFromMemberId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— None —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Additional context…"
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: 72,
                fontFamily: 'inherit',
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: '#475569',
                marginTop: 3,
                textAlign: 'right',
              }}
            >
              {description.length}/500
            </div>
          </div>

          {/* Due date */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Due date (optional)</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <div
              style={{
                color: '#ef4444',
                fontSize: 12,
                marginBottom: 10,
                padding: '6px 10px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 5,
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '9px 0',
              background: submitLabel === '✓ Created' ? '#16a34a' : '#3b82f6',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              transition: 'background 0.2s',
              letterSpacing: '0.02em',
            }}
          >
            {submitLabel === '✓ Created' ? '✓ Created' : submitting ? 'Creating…' : 'Create Item'}
          </button>
        </form>
      </div>
    </>
  );
};
