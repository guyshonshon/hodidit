/**
 * PythonSandbox — interactive Python runner for a single solution step.
 *
 * Two kinds of editable fields:
 *  - 'input'  — feeds input() calls in order (from step.example_inputs)
 *  - 'const'  — top-level literal assignments extracted from the code;
 *               edited values are injected by rewriting those lines before execution
 *
 * Security: Pyodide WASM + JS-bridge block (see lib/pyodide.ts).
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { SolutionStep } from '../types';
import { runPython } from '../lib/pyodide';
import { parseCodeLines } from './execution/parseExecution';

// ── Var model ─────────────────────────────────────────────────────────────────

interface SandboxVar {
  name: string;
  value: string;
  /** 'input' → fed to input() queue; 'const' → injected by rewriting assignment */
  kind: 'input' | 'const';
}

/** Extract top-level simple literal assignments from Python code. */
function extractConstVars(code: string): SandboxVar[] {
  const lines = parseCodeLines(code);
  const seen = new Set<string>();
  const vars: SandboxVar[] = [];

  for (const line of lines) {
    if (
      line.indent === 0 &&
      line.category === 'assign' &&
      line.variable &&
      line.valueExpr &&
      !seen.has(line.variable)
    ) {
      const val = line.valueExpr.trim();
      // Expose simple scalars, plus list/tuple literals
      const isScalar = /^(True|False|None|-?\d+(\.\d+)?([eE][+-]?\d+)?|"[^"]*"|'[^']*')$/.test(val);
      const isCollection = /^(\[.*\]|\(.*\))$/.test(val);
      if (isScalar || isCollection) {
        seen.add(line.variable);
        vars.push({ name: line.variable, value: val, kind: 'const' });
      }
    }
  }

  return vars;
}

/** Apply const-var overrides by rewriting their assignment lines in the code. */
function applyConstOverrides(code: string, overrides: SandboxVar[]): string {
  if (overrides.length === 0) return code;
  const map = new Map(overrides.map(v => [v.name, v.value]));

  return code.split('\n').map(line => {
    // Match a top-level assignment (no leading whitespace)
    const m = line.match(/^([a-zA-Z_]\w*)\s*=\s*(?!=)/);
    if (m && map.has(m[1])) {
      return `${m[1]} = ${map.get(m[1])}`;
    }
    return line;
  }).join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { step: SolutionStep }

export function PythonSandbox({ step }: Props) {
  const [open, setOpen] = useState(false);

  const [vars, setVars] = useState<SandboxVar[]>(() => {
    const inputVars: SandboxVar[] = Object.entries(step.example_inputs ?? {}).map(
      ([name, value]) => ({ name, value, kind: 'input' as const }),
    );
    const constVars = extractConstVars(step.content);
    // Don't duplicate: if a name appears in example_inputs, skip it from consts
    const inputNames = new Set(inputVars.map(v => v.name));
    return [...inputVars, ...constVars.filter(v => !inputNames.has(v.name))];
  });

  const [output, setOutput] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running'>('idle');

  async function handleRun() {
    setRunError(null);
    setOutput(null);
    setStatus('loading');
    try {
      setStatus('running');
      const inputQueue = vars.filter(v => v.kind === 'input').map(v => v.value);
      const constOverrides = vars.filter(v => v.kind === 'const');
      const code = applyConstOverrides(step.content, constOverrides);
      const result = await runPython(code, inputQueue);
      if (result.error) setRunError(result.error);
      else setOutput(result.output);
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  }

  const isLoading = status !== 'idle';
  const hasVars = vars.length > 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-mono"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', fontSize: 10, fontWeight: 600,
          background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.22)',
          borderRadius: 5, color: '#a78bfa', cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        <Play size={9} />
        Try in Sandbox
        <ChevronDown size={9} style={{ opacity: 0.6 }} />
      </button>
    );
  }

  return (
    <div style={{
      border: '1px solid rgba(139,92,246,0.22)',
      borderRadius: 8, background: 'rgba(139,92,246,0.03)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px',
        background: 'rgba(139,92,246,0.07)',
        borderBottom: '1px solid rgba(139,92,246,0.14)',
      }}>
        <span className="font-mono" style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: '#a78bfa',
        }}>
          Python Sandbox
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleRun}
            disabled={isLoading}
            className="font-mono"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', fontSize: 10, fontWeight: 600,
              background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
              borderRadius: 5, color: '#34d399',
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {isLoading
              ? <RefreshCw size={10} style={{ animation: 'spin 0.9s linear infinite' }} />
              : <Play size={10} />}
            {status === 'loading' ? 'Loading…' : status === 'running' ? 'Running…' : 'Run'}
          </button>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: '0 4px',
            display: 'flex', alignItems: 'center',
          }}>
            <ChevronUp size={13} />
          </button>
        </div>
      </div>

      {/* Variable editor */}
      {hasVars && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
          {/* input() vars */}
          {vars.some(v => v.kind === 'input') && (
            <div style={{ marginBottom: vars.some(v => v.kind === 'const') ? 10 : 0 }}>
              <div className="font-mono" style={{
                fontSize: 9, color: '#a78bfa', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Input values
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {vars.filter(v => v.kind === 'input').map((v) => {
                  const i = vars.indexOf(v);
                  return (
                    <VarField key={v.name} v={v} onChange={val => {
                      const next = [...vars];
                      next[i] = { ...v, value: val };
                      setVars(next);
                    }} onEnter={handleRun} />
                  );
                })}
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 6 }}>
                Press Enter or click Run — input() calls receive these values in order
              </div>
            </div>
          )}

          {/* const vars */}
          {vars.some(v => v.kind === 'const') && (
            <div>
              <div className="font-mono" style={{
                fontSize: 9, color: '#fbbf24', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Variables
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {vars.filter(v => v.kind === 'const').map((v) => {
                  const i = vars.indexOf(v);
                  return (
                    <VarField key={v.name} v={v} accent="#fbbf24" onChange={val => {
                      const next = [...vars];
                      next[i] = { ...v, value: val };
                      setVars(next);
                    }} onEnter={handleRun} />
                  );
                })}
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 6 }}>
                Edit and click Run — values override the constants in the code
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="font-mono" style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-3)' }}>
          Downloading Python runtime (~10 MB, once per session)…
        </div>
      )}

      <AnimatePresence>
        {(output !== null || runError !== null) && (
          <motion.div key="output"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '10px 14px' }}>
              <div className="font-mono" style={{
                fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Output
              </div>
              {runError ? (
                <pre className="font-mono" style={{
                  fontSize: 11, color: '#f87171', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', margin: 0, lineHeight: 1.6,
                }}>{runError}</pre>
              ) : (
                <pre className="font-mono" style={{
                  fontSize: 12, color: '#c3e88d', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all', margin: 0, lineHeight: 1.65,
                }}>{output}</pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared input field ────────────────────────────────────────────────────────

function VarField({ v, accent = '#82aaff', onChange, onEnter }: {
  v: SandboxVar;
  accent?: string;
  onChange: (val: string) => void;
  onEnter: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span className="font-mono" style={{ fontSize: 12, color: accent, fontWeight: 600 }}>{v.name}</span>
      <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>=</span>
      <input
        className="font-mono"
        value={v.value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter(); }}
        style={{
          width: Math.max(52, v.value.length * 8 + 20),
          padding: '3px 8px', fontSize: 12,
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid rgba(139,92,246,0.28)`,
          borderRadius: 4, color: '#c3e88d',
          fontFamily: 'inherit', outline: 'none',
        }}
      />
    </div>
  );
}
