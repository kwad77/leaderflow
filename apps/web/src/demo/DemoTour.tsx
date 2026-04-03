import React, { useState, useEffect } from 'react';

const TOUR_STORAGE_KEY = 'leaderflow-demo-tour-done';

interface TourStep {
  id: string;
  title: string;
  body: string;
  position: 'center' | 'top-center' | 'right' | 'bottom-center' | 'top-right';
  highlight: 'orgchart' | 'flowpanel' | 'topbar' | null;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to LeaderFlow',
    body: 'Your org chart is the interface. Work items flow through your org as animated particles — you see the health of your entire organization at a glance.',
    position: 'center',
    highlight: null,
  },
  {
    id: 'particles',
    title: 'Work in Motion',
    body: 'Each particle is a live work item.\n\n🔴 Red flowing upward = escalations\n🔵 Blue flowing downward = delegations\n🟠 Orange = new ingress waiting for triage',
    position: 'top-center',
    highlight: 'orgchart',
  },
  {
    id: 'node',
    title: 'Tap Any Node',
    body: "Tap a person's node to open their work queue — every item assigned to them, with age, priority, and status. No more \"what's on your plate?\" meetings.",
    position: 'right',
    highlight: 'orgchart',
  },
  {
    id: 'flowpanel',
    title: 'Your Hot Spots',
    body: 'The bottom bar shows your three queues:\n\n📥 Ingress — new work needing triage\n🚨 Escalations — items bubbling up\n⚠️ At Risk — items about to slip',
    position: 'bottom-center',
    highlight: 'flowpanel',
  },
  {
    id: 'itemrow',
    title: 'Age Is King',
    body: "Every item shows FROM → TO and how long it's been alive. The oldest items surface first. Age is the most important signal — nothing hides from the clock.",
    position: 'bottom-center',
    highlight: 'flowpanel',
  },
  {
    id: 'ai',
    title: 'AI Pre-Sorts Everything',
    body: 'Before you even open an item, Claude has already classified its priority and suggested the best owner — with a one-sentence rationale. Your decisions, not your sorting.',
    position: 'center',
    highlight: null,
  },
  {
    id: 'weekly',
    title: 'Weekly Review',
    body: 'See your delegation ratio trending up over time. Track triage speed, escalation response, and automation opportunities — patterns that tell you whether your leadership habits are improving.',
    position: 'top-right',
    highlight: 'topbar',
  },
];

function getHighlightRegion(highlight: TourStep['highlight']): React.CSSProperties | null {
  if (!highlight) return null;
  switch (highlight) {
    case 'topbar':
      return { top: 0, left: 0, right: 0, height: 44 };
    case 'orgchart':
      return { top: 44, left: 0, right: 0, bottom: 148 };
    case 'flowpanel':
      return { bottom: 0, left: 0, right: 0, height: 148 };
    default:
      return null;
  }
}

function getCardPosition(position: TourStep['position']): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    width: 400,
    zIndex: 160,
  };
  switch (position) {
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'top-center':
      return { ...base, top: 60, left: '50%', transform: 'translateX(-50%)' };
    case 'top-right':
      return { ...base, top: 60, right: 20 };
    case 'right':
      return { ...base, top: '50%', right: 20, transform: 'translateY(-50%)' };
    case 'bottom-center':
      return { ...base, bottom: 160, left: '50%', transform: 'translateX(-50%)' };
    default:
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}

export const DemoTour: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!done) {
      // Small delay so org chart renders first
      const t = setTimeout(() => {
        setVisible(true);
        setEntering(true);
        setTimeout(() => setEntering(false), 200);
      }, 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
    setVisible(false);
  };

  const next = () => {
    if (step >= TOUR_STEPS.length - 1) {
      dismiss();
      return;
    }
    setEntering(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setEntering(false);
    }, 150);
  };

  const back = () => {
    if (step <= 0) return;
    setEntering(true);
    setTimeout(() => {
      setStep((s) => s - 1);
      setEntering(false);
    }, 150);
  };

  if (!visible) return null;

  const currentStep = TOUR_STEPS[step];
  const highlightRegion = getHighlightRegion(currentStep.highlight);
  const cardPos = getCardPosition(currentStep.position);
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Dark overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 150,
          background: 'rgba(0,0,0,0.55)',
          pointerEvents: 'none',
        }}
      />

      {/* Highlight glow region */}
      {highlightRegion && (
        <div
          style={{
            position: 'fixed',
            ...highlightRegion,
            zIndex: 151,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.7)',
            borderRadius: 4,
            animation: 'tour-pulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Tour card */}
      <div
        style={{
          ...cardPos,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 14,
          padding: '24px 24px 18px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          opacity: entering ? 0 : 1,
          transform: entering
            ? `${cardPos.transform ?? ''} translateY(8px)`.trim()
            : cardPos.transform ?? 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'all',
        }}
      >
        {/* Step counter */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          {step + 1} / {TOUR_STEPS.length}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 10,
            letterSpacing: '-0.02em',
          }}
        >
          {currentStep.title}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 13,
            color: '#94a3b8',
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
            marginBottom: 20,
          }}
        >
          {currentStep.body}
        </div>

        {/* Dot indicators */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 16,
          }}
        >
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? '#3b82f6' : '#334155',
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {step > 0 && (
            <button
              onClick={back}
              style={{
                padding: '7px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              fontSize: 12,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Skip tour
          </button>
          <button
            onClick={next}
            style={{
              padding: '7px 18px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: inset 0 0 0 2px rgba(59,130,246,0.7), 0 0 20px rgba(59,130,246,0.2); }
          50% { box-shadow: inset 0 0 0 2px rgba(59,130,246,1), 0 0 40px rgba(59,130,246,0.4); }
        }
      `}</style>
    </>
  );
};
