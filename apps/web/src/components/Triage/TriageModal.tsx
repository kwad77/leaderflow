import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { createItem, delegateItem, fetchMembers } from '../../lib/api';
import type { OrgMember, WorkItemType, Priority } from '@leaderflow/shared';

export const TriageModal: React.FC = () => {
  const { triageOpen, triageParentItem, closeTriage, upsertItem, isOnline } = useAppStore();
  const [members, setMembers] = useState<OrgMember[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<WorkItemType>('INGRESS');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [toMemberId, setToMemberId] = useState('');
  const [fromMemberId, setFromMemberId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDelegating = !!triageParentItem;

  useEffect(() => {
    fetchMembers().then(setMembers).catch(console.error);
  }, []);

  // Pre-fill when delegating
  useEffect(() => {
    if (triageParentItem) {
      setTitle(triageParentItem.title);
      setDescription(triageParentItem.description ?? '');
      // Pre-select AI suggested priority if available, otherwise use item's priority
      setPriority((triageParentItem.aiSuggestedPriority as Priority) ?? triageParentItem.priority);
      setType('DELEGATION');
      // Pre-select AI suggested owner if available
      setToMemberId(triageParentItem.aiSuggestedOwner ?? '');
    } else {
      setTitle('');
      setDescription('');
      setType('INGRESS');
      setPriority('MEDIUM');
      setToMemberId('');
      setFromMemberId('');
      setDueAt('');
      setNote('');
    }
    setError(null);
  }, [triageParentItem, triageOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toMemberId) {
      setError('Please select a recipient');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (isDelegating && triageParentItem) {
        const updated = await delegateItem(triageParentItem.id, {
          toMemberId,
          note: note || undefined,
        });
        upsertItem(updated);
      } else {
        const created = await createItem({
          title,
          description: description || undefined,
          type,
          priority,
          toMemberId,
          fromMemberId: fromMemberId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        });
        upsertItem(created);
      }
      closeTriage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSubmitting(false);
    }
  };

  if (!triageOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 7,
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 4,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeTriage}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(480px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: '16px 18px 12px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
              {isDelegating ? 'Delegate Item' : 'Create Work Item'}
            </div>
            {isDelegating && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Delegating: {triageParentItem!.title.slice(0, 40)}
                {triageParentItem!.title.length > 40 ? '…' : ''}
              </div>
            )}
          </div>
          <button
            onClick={closeTriage}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
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

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          <form id="triage-form" onSubmit={handleSubmit}>
            {!isDelegating && (
              <>
                {/* Title */}
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Title *</label>
                  <input
                    style={inputStyle}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to happen?"
                    required
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional context..."
                  />
                </div>

                {/* Type + Priority row */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Type</label>
                    <select
                      style={inputStyle}
                      value={type}
                      onChange={(e) => setType(e.target.value as WorkItemType)}
                    >
                      <option value="INGRESS">Ingress</option>
                      <option value="DELEGATION">Delegation</option>
                      <option value="ESCALATION">Escalation</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Priority</label>
                    <select
                      style={inputStyle}
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                </div>

                {/* From member */}
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>From (optional)</label>
                  <select
                    style={inputStyle}
                    value={fromMemberId}
                    onChange={(e) => setFromMemberId(e.target.value)}
                  >
                    <option value="">External / Unknown</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.role}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* To member (always shown) */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>To (Recipient) *</label>
              <select
                style={inputStyle}
                value={toMemberId}
                onChange={(e) => setToMemberId(e.target.value)}
                required
              >
                <option value="">Select recipient...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.role}
                  </option>
                ))}
              </select>
              {isDelegating && triageParentItem?.aiSuggestedOwner && (() => {
                const suggested = members.find((m) => m.id === triageParentItem.aiSuggestedOwner);
                return suggested ? (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    ✦ AI suggests: {suggested.name} — {triageParentItem.aiRationale ?? ''}
                  </div>
                ) : null;
              })()}
            </div>

            {!isDelegating && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Due Date</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            )}

            {isDelegating && triageParentItem?.aiSuggestedPriority && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Priority</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      triageParentItem.aiSuggestedPriority === 'URGENT' ? '#7f1d1d' :
                      triageParentItem.aiSuggestedPriority === 'HIGH' ? '#7c2d12' :
                      triageParentItem.aiSuggestedPriority === 'MEDIUM' ? '#1e3a5f' :
                      '#1e293b',
                    color:
                      triageParentItem.aiSuggestedPriority === 'URGENT' ? '#fca5a5' :
                      triageParentItem.aiSuggestedPriority === 'HIGH' ? '#fdba74' :
                      triageParentItem.aiSuggestedPriority === 'MEDIUM' ? '#93c5fd' :
                      '#94a3b8',
                    border: '1px solid',
                    borderColor:
                      triageParentItem.aiSuggestedPriority === 'URGENT' ? '#ef4444' :
                      triageParentItem.aiSuggestedPriority === 'HIGH' ? '#f97316' :
                      triageParentItem.aiSuggestedPriority === 'MEDIUM' ? '#3b82f6' :
                      '#475569',
                  }}>
                    {triageParentItem.aiSuggestedPriority}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>✦ AI suggestion</span>
                </div>
              </div>
            )}

            {isDelegating && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Note (optional)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Context for the recipient..."
                />
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '8px 10px',
                  background: '#7f1d1d',
                  border: '1px solid #ef4444',
                  borderRadius: 6,
                  color: '#fca5a5',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={closeTriage}
            style={{
              flex: 1,
              padding: '9px 0',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="triage-form"
            disabled={submitting || !isOnline}
            style={{
              flex: 2,
              padding: '9px 0',
              background: submitting || !isOnline
                ? '#334155'
                : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting || !isOnline ? 'not-allowed' : 'pointer',
              opacity: !isOnline ? 0.5 : 1,
            }}
          >
            {!isOnline
              ? 'Offline'
              : submitting
              ? 'Saving...'
              : isDelegating
              ? 'Delegate'
              : 'Create Item'}
          </button>
        </div>
      </div>
    </>
  );
};
