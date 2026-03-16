/**
 * SolutionStepList — scrollable document view of the full solution.
 *
 * Steps are grouped by question_ref so Q1 / Q2 / Q3 … appear as distinct
 * sections.  Steps without a question_ref are rendered sequentially in a
 * single ungrouped section.
 */

import { Question, SolutionStep } from '../types';
import { PythonSandbox } from './PythonSandbox';
import { SyntaxLine } from './execution/tokenize';

// ── Step type colours (matches SolutionExecutionView palette) ─────────────────
const SCFG: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  explanation: { bg: 'rgba(139,92,246,0.07)', border: 'rgba(139,92,246,0.22)', text: '#a78bfa', accent: '#8b5cf6' },
  code:        { bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.22)',  text: '#60a5fa', accent: '#3b82f6' },
  command:     { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.22)',  text: '#fbbf24', accent: '#f59e0b' },
  git:         { bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.22)',  text: '#34d399', accent: '#10b981' },
  docker:      { bg: 'rgba(14,165,233,0.07)',  border: 'rgba(14,165,233,0.22)',  text: '#38bdf8', accent: '#0ea5e9' },
  output:      { bg: 'rgba(148,163,184,0.07)', border: 'rgba(148,163,184,0.22)', text: '#94a3b8', accent: '#64748b' },
};
const sc = (t: string) => SCFG[t] ?? SCFG.output;

// ── Grouping ──────────────────────────────────────────────────────────────────

interface Group { qRef: number | null; steps: SolutionStep[] }

function groupByQuestion(steps: SolutionStep[]): Group[] {
  const groups: Group[] = [];
  for (const step of steps) {
    const ref = step.question_ref ?? null;
    const last = groups[groups.length - 1];
    if (last && last.qRef === ref) {
      last.steps.push(step);
    } else {
      groups.push({ qRef: ref, steps: [step] });
    }
  }
  return groups;
}

// ── Step card ─────────────────────────────────────────────────────────────────

function stepPrompt(step: SolutionStep): string {
  if (step.type === 'git')    return '$ git ';
  if (step.type === 'docker') return '$ docker ';
  if (step.type === 'command') return '$ ';
  return '';
}

function stepCmd(step: SolutionStep): string {
  if (step.type === 'git') return step.content.replace(/^git\s+/, '');
  return step.content;
}

// ── Syntax-highlighted code block ─────────────────────────────────────────────

function CodeBlock({ code, border }: { code: string; border: string }) {
  const lines = code.split('\n');
  return (
    <div style={{
      background: '#0a0e18', borderRadius: 6,
      border: `1px solid ${border}`,
      overflowX: 'auto', padding: '10px 0',
    }}>
      {lines.map((line, idx) => (
        <div key={idx} style={{ display: 'flex', minHeight: 22 }}>
          <span className="font-mono" style={{
            width: 36, minWidth: 36, textAlign: 'right',
            paddingRight: 12, paddingLeft: 8,
            color: 'rgba(120,140,170,0.35)',
            fontSize: 11, lineHeight: '22px',
            userSelect: 'none', flexShrink: 0,
          }}>
            {idx + 1}
          </span>
          <span className="font-mono" style={{
            fontSize: 12, lineHeight: '22px',
            whiteSpace: 'pre', paddingRight: 16, flex: 1,
          }}>
            {line.length === 0 ? '\u00a0' : <SyntaxLine code={line} />}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepCard({ step, index }: { step: SolutionStep; index: number }) {
  const cfg = sc(step.type);
  const isCode = step.type === 'code';
  const isTerm = step.type === 'command' || step.type === 'git' || step.type === 'docker';

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${cfg.border}`,
      background: 'var(--surface)',
      marginBottom: 10,
    }}>
      {/* Accent bar + header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px 10px',
        borderBottom: `1px solid ${cfg.border}`,
        background: cfg.bg,
        borderLeft: `3px solid ${cfg.accent}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span className="font-mono" style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 4,
              background: 'rgba(0,0,0,0.2)', color: cfg.text,
            }}>
              {step.type}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>
              #{index + 1}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
            {step.title}
          </div>
          {step.description && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>
              {step.description}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px' }}>
        {isCode && (
          <>
            <CodeBlock code={step.content} border={cfg.border} />

            {/* Inputs provided as stdin */}
            {step.example_inputs && Object.keys(step.example_inputs).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="font-mono" style={{
                  fontSize: 9, color: '#60a5fa', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 4,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', display: 'inline-block' }} />
                  Inputs
                </div>
                <div className="font-mono" style={{
                  fontSize: 12, background: 'rgba(0,0,0,0.25)',
                  borderRadius: 5, padding: '8px 12px', lineHeight: 1.8,
                }}>
                  {Object.entries(step.example_inputs).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ color: '#4a607a', flexShrink: 0 }}>{key}:</span>
                      <span style={{ color: '#eeffff' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Real output from backend execution */}
            {step.output && (
              <div style={{ marginTop: 8 }}>
                <div className="font-mono" style={{
                  fontSize: 9, color: '#34d399', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 4,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#34d399', display: 'inline-block',
                  }} />
                  Output
                </div>
                <pre className="font-mono" style={{
                  fontSize: 12, color: '#c3e88d', background: 'rgba(0,0,0,0.25)',
                  borderRadius: 5, padding: '8px 12px', margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
                }}>
                  {step.output}
                </pre>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <PythonSandbox step={step} />
            </div>
          </>
        )}

        {isTerm && (
          <>
            <div style={{
              background: '#080c18', borderRadius: 6,
              border: `1px solid ${cfg.border}`, overflow: 'hidden',
            }}>
              {/* Terminal title bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', background: 'rgba(255,255,255,0.03)',
                borderBottom: `1px solid rgba(255,255,255,0.05)`,
              }}>
                {['#f87171', '#fbbf24', '#34d399'].map((c, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.35 }} />
                ))}
              </div>
              <div className="font-mono" style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ color: cfg.accent, opacity: 0.8 }}>{stepPrompt(step)}</span>
                <span style={{ color: '#eeffff' }}>{stepCmd(step)}</span>
              </div>
              {step.output && (
                <div style={{ padding: '0 14px 12px' }}>
                  <pre className="font-mono" style={{
                    fontSize: 12, color: '#7a8fad',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    margin: 0, lineHeight: 1.6,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    paddingTop: 10,
                  }}>
                    {step.output}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}

        {!isCode && !isTerm && (
          <div style={{
            fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {step.content}
            {step.output && (
              <pre className="font-mono" style={{
                marginTop: 10, fontSize: 12, color: 'var(--text-3)',
                whiteSpace: 'pre-wrap', lineHeight: 1.6,
              }}>
                {step.output}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props { steps: SolutionStep[]; questions?: Question[] }

export function SolutionStepList({ steps, questions = [] }: Props) {
  if (steps.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 13 }}>
        No steps to display
      </div>
    );
  }

  const hasQuestionRefs = steps.some(s => s.question_ref != null);
  const groups = groupByQuestion(steps);
  const questionMap = new Map(questions.map(q => [q.number, q]));

  // Global step counter across all groups
  let globalIdx = 0;

  return (
    <div>
      {groups.map((group, gi) => {
        const question = group.qRef != null ? questionMap.get(group.qRef) : undefined;
        return (
          <div key={gi} style={{ marginBottom: 24 }}>
            {/* Question header — only shown when question_refs are present */}
            {hasQuestionRefs && group.qRef != null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: question ? 6 : 0 }}>
                  <div className="font-mono" style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
                    padding: '3px 10px', borderRadius: 4,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    flexShrink: 0,
                  }}>
                    Q{group.qRef}
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                {question && (
                  <div style={{
                    fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55,
                    padding: '6px 2px',
                  }}>
                    {question.full_text || question.text}
                  </div>
                )}
              </div>
            )}

            {/* Steps in this group */}
            {group.steps.map((step) => {
              const idx = globalIdx++;
              return <StepCard key={step.id} step={step} index={idx} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
