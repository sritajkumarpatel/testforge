import { useState, useRef } from 'react';

export default function AgentResults({ jsonOutput, setJsonOutput, agentLogs, agentsRunning, pipelineStage, onParse, parsedCount, parseStatus, parseStatusClass, runId, onExportLog }) {
  const fileRef = useRef(null);

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
      // Auto-parse after upload
      setTimeout(() => onParse?.(text), 100);
    };
    reader.readAsText(file);
  };

  const hasContent = jsonOutput.trim().length > 0;

  return (
    <>
      {/* Agent Progress */}
      <div className="card card-emphasis" id="adoAgentProgressCard">
        <div className="ado-card-header">
          <span className="ado-card-title">
            <span className="material-icons">smart_toy</span>
            Agent Pipeline
          </span>
          <span className={`section-badge ${agentsRunning ? 'active' : hasContent ? 'done' : 'pending'}`}>
            {agentsRunning ? '● Running' : hasContent ? '✓ Done' : '○ Pending'}
          </span>
        </div>
        <div className="ado-card-body">
          {agentLogs.length === 0 && !agentsRunning && (
            <p className="ado-hint" style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>
              Load requirements and click <strong>Run Agents</strong> to start the pipeline.
            </p>
          )}
          {agentLogs.map((log, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6,
              padding: '6px 10px', borderRadius: 6,
              background: log.type === 'error' ? 'rgba(220,38,38,0.06)' :
                         log.type === 'done' ? 'rgba(5,150,105,0.06)' :
                         log.type === 'stream' ? 'transparent' : 'rgba(0,105,92,0.04)',
            }}>
              <span className="material-icons" style={{
                fontSize: 16, marginTop: 2, flexShrink: 0,
                color: log.type === 'error' ? '#dc2626' :
                       log.type === 'done' ? '#059669' :
                       log.type === 'stream' ? '#00695c' : '#00695c',
              }}>
                {log.type === 'error' ? 'error' : log.type === 'done' ? 'check_circle' : log.type === 'stream' ? 'chevron_right' : 'smart_toy'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: log.type === 'agent' ? 600 : 400, fontSize: 13, color: '#111827', marginBottom: log.type === 'stream' && log.text ? 2 : 0 }}>
                  {log.message}
                </div>
                {log.type === 'stream' && log.text && (
                  <pre style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: "'JetBrains Mono', monospace", maxHeight: 200, overflow: 'auto', background: '#f9fafb', borderRadius: 4, padding: '4px 8px' }}>
                    {log.text}
                  </pre>
                )}
              </div>
            </div>
          ))}
          {agentsRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', color: '#00695c' }}>
              <div className="scenarios-loader-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Agents running…</span>
            </div>
          )}
        </div>
      </div>

      {/* Generated Test Cases */}
      <div className="card card-emphasis" id="adoResultsCard">
        <div className="ado-card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="ado-card-title">
            <span className="material-icons">fact_check</span>
            Generated Test Cases
          </span>
          <span className={`section-badge ${hasContent ? (parseStatusClass === 'ok' ? 'done' : 'active') : 'pending'}`}>
            {hasContent ? (parseStatusClass === 'ok' ? '✓ Done' : 'Review') : '○ Pending'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {runId && (
              <button className="btn btn-outline btn-sm" onClick={onExportLog}>
                <span className="material-icons">article</span> Export Log
              </button>
            )}
            {hasContent && (
              <button className="btn btn-outline btn-sm" onClick={downloadJson}>
                <span className="material-icons">download</span> Download JSON
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
              <span className="material-icons">upload</span> Upload JSON
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleUpload} />
          </div>
        </div>
        <div className="ado-card-body">
          <div className="scenarios-textarea-wrap">
            <textarea id="adoScenariosInput" className="mono-textarea" value={jsonOutput}
              onChange={(e) => setJsonOutput(e.target.value)}
              placeholder='[&#10;  {&#10;    "title": "Login — Valid credentials",&#10;    "tags": ["Login", "HappyPath"],&#10;    "steps": [{&#10;      "action": "Navigate to login page.",&#10;      "expected": "Login page loads."&#10;    }]&#10;  }&#10;]'
              style={{ minHeight: 280 }} />
          </div>
          <div className="ado-parse-row">
            <button className="btn btn-outline btn-sm" onClick={() => onParse?.(jsonOutput)}>
              <span className="material-icons">checklist</span> Parse &amp; Validate
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
