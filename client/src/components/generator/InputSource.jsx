import { useState, useRef } from 'react';

const FILE_TYPES =
  '.txt,.md,.pdf,.docx,.csv,.json,.xml,.yaml,.yml,.html,.js,.ts,.tsx,.jsx,.py,.cs,.java,.sql,.feature';

export default function InputSource({
  config,
  onInputReady,
  providerName,
  pipelineStage,
  onSwitchToSettings,
  agentMode = 'regular',
  onAgentModeChange,
}) {
  const [tab, setTab] = useState('file');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [adoId, setAdoId] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusClass, setStatusClass] = useState('');
  const fileRef = useRef(null);
  const org = config.org || '';
  const project = config.project || '';

  const loadFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setStatus(`Reading ${file.name}…`);
    setStatusClass('');
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/parse/document', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        setRawText(data.text);
        setStatus(`✓ Loaded ${file.name} (${(data.size / 1024).toFixed(1)} KB)`);
        setStatusClass('ok');
      } else {
        setStatus(`✗ ${data.error || 'Parse failed'}`);
        setStatusClass('err');
      }
    } catch (err) {
      setStatus(`✗ ${err.message}`);
      setStatusClass('err');
    }
    setLoading(false);
  };

  const fetchAdo = async () => {
    if (!org || !project) {
      setStatus('Set your Organisation and Project in Settings first.');
      setStatusClass('err');
      return;
    }
    if (!adoId.trim()) {
      setStatus('Enter a work item ID.');
      setStatusClass('err');
      return;
    }
    setLoading(true);
    setStatus(`Fetching work item #${adoId}…`);
    setStatusClass('');
    try {
      const res = await fetch('/api/ado/fetch-work-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, project, id: adoId.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setRawText(data.text);
        setFileName(`ADO #${adoId}: ${data.title}`);
        setRequirementId(adoId.trim());
        setTicketTitle(data.title || '');
        setTicketNumber(adoId.trim());
        setStatus(`✓ Fetched ADO #${adoId} — ${data.title}`);
        setStatusClass('ok');
      } else {
        setStatus(`✗ ${data.error}`);
        setStatusClass('err');
      }
    } catch (err) {
      setStatus(`✗ ${err.message}`);
      setStatusClass('err');
    }
    setLoading(false);
  };

  const handleRun = () => {
    if (!rawText.trim()) {
      setStatus('Load or paste requirements first.');
      setStatusClass('err');
      return;
    }
    onInputReady(rawText, {
      mode: agentMode,
      requirementId,
      ticketTitle,
      ticketNumber,
    });
  };

  return (
    <div className="card card-emphasis" id="adoLoadCard">
      <div className="ado-card-header">
        <span className="ado-card-title">
          <span className="material-icons">input</span>
          Step 1: Load Requirements
        </span>
        <span className={`section-badge ${pipelineStage === 'load' ? 'active' : 'done'}`}>
          {pipelineStage === 'load' ? '● In Progress' : '✓ Loaded'}
        </span>
      </div>
      <div className="ado-card-body">
        <p className="ado-hint">
          Load requirements from a document, fetch an ADO work item, or paste text directly. The
          three AI agents will analyze and generate test cases.
        </p>

        <div className="ai-tabs">
          {['file', 'ado', 'paste'].map((t) => (
            <button
              key={t}
              className={`ai-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              <span className="material-icons">
                {t === 'file' ? 'upload_file' : t === 'ado' ? 'cloud' : 'edit_note'}
              </span>
              {t === 'file' ? 'Upload File' : t === 'ado' ? 'Azure DevOps' : 'Paste Text'}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <>
            <div
              className="drop-zone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#00695c';
                e.currentTarget.style.background = '#e0f2f1';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = '#b2dfdb';
                e.currentTarget.style.background = '#f4fffe';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer?.files?.[0];
                if (f) loadFile(f);
              }}
            >
              <span className="material-icons">upload_file</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: '#00695c', fontWeight: 600 }}>
                  {fileName || 'Drop a file here or click to browse'}
                </div>
                <div className="drop-zone-hint">
                  Supports PDF, Word (.docx), Markdown, text, code files
                </div>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={FILE_TYPES}
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
          </>
        )}

        {tab === 'ado' && (
          <>
            {org && project ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 14 }}>
                <div className="settings-section-grid" style={{ gap: 16 }}>
                  <div className="ado-field" style={{ marginBottom: 0 }}>
                    <label>Organisation</label>
                    <input value={org} readOnly className="input-readonly" />
                  </div>
                  <div className="ado-field" style={{ marginBottom: 0 }}>
                    <label>Project</label>
                    <input value={project} readOnly className="input-readonly" />
                  </div>
                </div>
                <div className="ado-field">
                  <label>Work Item ID</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={adoId}
                      onChange={(e) => setAdoId(e.target.value)}
                      placeholder="e.g. 1234567"
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={fetchAdo}
                      disabled={loading}
                      style={{ paddingLeft: 16, paddingRight: 16 }}
                    >
                      <span className="material-icons">download</span> Fetch
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ado-missing-config">
                <span className="material-icons">info</span>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#111827', fontSize: 14 }}>
                    Azure DevOps not configured
                  </p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                    Set your Organisation and Project in{' '}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onSwitchToSettings();
                      }}
                    >
                      Settings
                    </a>{' '}
                    to fetch work items.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'paste' && (
          <div className="ado-field" style={{ marginBottom: 14 }}>
            <label>Paste requirements text</label>
            <textarea
              className="mono-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste user story, feature specification, or any requirements text here…"
              style={{ minHeight: 200 }}
            />
          </div>
        )}

        <div className="action-bar">
          <div className="ado-mode-toggle">
            <label
              className={`ado-radio-label${agentMode === 'regular' ? ' active' : ''}`}
              onClick={() => onAgentModeChange?.('regular')}
            >
              <span className="material-icons">checklist</span>
              Regular
            </label>
            <label
              className={`ado-radio-label${agentMode === 'bdd' ? ' active' : ''}`}
              onClick={() => onAgentModeChange?.('bdd')}
            >
              <span className="material-icons">featured_play_list</span>
              BDD
            </label>
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleRun}
            disabled={loading || !rawText.trim()}
          >
            <span className="material-icons">smart_toy</span>
            Run Agents
          </button>
          <span className="provider-label">Using {providerName}</span>
        </div>

        {status && (
          <div className="ado-parse-row" style={{ marginTop: 8, paddingTop: 8 }}>
            <span className={`ado-parse-status${statusClass ? ` ${statusClass}` : ''}`}>
              {status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
