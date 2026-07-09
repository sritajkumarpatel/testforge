import { useState, useRef, useEffect } from 'react';

export default function AgentResults({
  jsonOutput,
  setJsonOutput,
  agentLogs,
  agentsRunning,
  pipelineStage,
  onParse,
  parsedCount,
  parseStatus,
  parseStatusClass,
  runId,
  onExportLog,
}) {
  const fileRef = useRef(null);
  const consoleRef = useRef(null);
  const [activeLogTab, setActiveLogTab] = useState('all');

  // Auto-scroll only the terminal console div (prevents entire page from jumping/jittering)
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [agentLogs]);

  const downloadJson = () => {
    if (!jsonOutput.trim()) return;
    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setJsonOutput(text);
      setTimeout(() => onParse?.(text), 100);
    };
    reader.readAsText(file);
  };

  const hasContent = jsonOutput.trim().length > 0;

  // Filter logs per active log channel tab
  const filteredLogs = agentLogs.filter((log) => {
    if (activeLogTab === 'all') return true;
    if (activeLogTab === 'analyst') return log.agentId === 'requirements-analyst';
    if (activeLogTab === 'classifier') return log.agentId === 'classifier';
    if (activeLogTab === 'designer')
      return ['ui-agent', 'api-agent', 'mock-agent'].includes(log.agentId);
    if (activeLogTab === 'writer')
      return ['test-case-writer', 'test-case-writer-bdd'].includes(log.agentId);
    return true;
  });

  return (
    <>
      {/* Agent Progress & Console logs */}
      <div className="card card-emphasis" id="adoAgentProgressCard">
        <div className="ado-card-header">
          <span className="ado-card-title">
            <span className="material-icons">terminal</span>
            Agent Terminal Console
          </span>
          <span
            className={`section-badge ${agentsRunning ? 'active' : hasContent ? 'done' : 'pending'}`}
          >
            {agentsRunning ? '● Executing' : hasContent ? '✓ Idle' : '○ Standby'}
          </span>
        </div>

        {/* Tab channels */}
        <div className="agent-progress-tabs">
          {[
            { id: 'all', label: 'All Log Feed' },
            { id: 'analyst', label: 'Analyst' },
            { id: 'classifier', label: 'Classifier' },
            { id: 'designer', label: 'Designers' },
            { id: 'writer', label: 'Case Writer' },
          ].map((t) => (
            <button
              key={t.id}
              className={`agent-progress-tab${activeLogTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveLogTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ado-card-body" style={{ padding: 12 }}>
          <div className="agent-console" ref={consoleRef}>
            {filteredLogs.length === 0 && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 80 }}>
                {agentsRunning
                  ? 'Awakening agents...'
                  : 'Console output will stream here during run.'}
              </div>
            )}
            {filteredLogs.map((log, i) => (
              <div
                key={i}
                className={log.type ? `log-${log.type}` : ''}
                style={{ marginBottom: 4 }}
              >
                {log.message && <span>{log.message}</span>}
                {log.type === 'stream' && log.text && (
                  <span style={{ color: '#818cf8', opacity: 0.9 }}>{log.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Generated Raw JSON Editor */}
      <div className="card card-emphasis" id="adoResultsCard">
        <div className="ado-card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="ado-card-title">
            <span className="material-icons">fact_check</span>
            Generated Test Cases
          </span>
          <span
            className={`section-badge ${hasContent ? (parseStatusClass === 'ok' ? 'done' : 'active') : 'pending'}`}
          >
            {hasContent ? (parseStatusClass === 'ok' ? '✓ Ready' : 'Review') : '○ Pending'}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {runId && (
              <button className="btn btn-outline btn-sm" onClick={onExportLog}>
                <span className="material-icons" style={{ fontSize: 16 }}>
                  article
                </span>{' '}
                Export Log
              </button>
            )}
            {hasContent && (
              <button className="btn btn-outline btn-sm" onClick={downloadJson}>
                <span className="material-icons" style={{ fontSize: 16 }}>
                  download
                </span>{' '}
                Download JSON
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
              <span className="material-icons" style={{ fontSize: 16 }}>
                upload
              </span>{' '}
              Upload JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </div>
        </div>

        <div className="ado-card-body">
          <div className="scenarios-textarea-wrap">
            <textarea
              id="adoScenariosInput"
              className="mono-textarea"
              value={jsonOutput}
              onChange={(e) => setJsonOutput(e.target.value)}
              placeholder='[&#10;  {&#10;    "title": "Login — Valid credentials",&#10;    "tags": ["Login", "HappyPath"],&#10;    "steps": [{&#10;      "action": "Navigate to login page.",&#10;      "expected": "Login page loads."&#10;    }]&#10;  }&#10;]'
              style={{ minHeight: 280 }}
            />
          </div>
          <div className="ado-parse-row">
            <button className="btn btn-outline btn-sm" onClick={() => onParse?.(jsonOutput)}>
              <span className="material-icons" style={{ fontSize: 16 }}>
                checklist
              </span>{' '}
              Parse &amp; Validate
            </button>
            <span className={`ado-parse-status${parseStatusClass ? ` ${parseStatusClass}` : ''}`}>
              {parseStatus || 'Paste or generate JSON above, then click Parse & Validate.'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
