import type { Tone } from '@/lib/report';
import type { LiveGoalState } from '@/lib/runView';

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`pill tone-${tone}`}>{label}</span>;
}

const ICON_COLOR: Record<LiveGoalState, string> = {
  queued: 'var(--line-strong)',
  running: 'var(--info)',
  PASS: 'var(--pass)',
  FAIL: 'var(--fail)',
  BLOCKED: 'var(--warn)',
  AGENT_ERROR: 'var(--muted)',
};

/** 14px glyph for a goal's state. Plain strokes, no emoji. */
export function GoalIcon({ state }: { state: LiveGoalState }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: ICON_COLOR[state],
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'goal-icon',
    'aria-label': state,
  };

  switch (state) {
    case 'PASS':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" />
          <path d="M4.3 7.2l1.8 1.8 3.6-3.8" />
        </svg>
      );
    case 'FAIL':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" />
          <path d="M5 5l4 4M9 5l-4 4" />
        </svg>
      );
    case 'BLOCKED':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" />
          <path d="M5.6 4.8v4.4M8.4 4.8v4.4" />
        </svg>
      );
    case 'AGENT_ERROR':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" strokeDasharray="2 2" />
          <path d="M5.6 5.6a1.5 1.5 0 1 1 1.9 1.4c-.4.1-.5.4-.5.8M7 9.7v.01" />
        </svg>
      );
    case 'running':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" stroke="var(--line)" />
          <path d="M7 1a6 6 0 0 1 6 6">
            <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.9s" repeatCount="indefinite" />
          </path>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" />
        </svg>
      );
  }
}
