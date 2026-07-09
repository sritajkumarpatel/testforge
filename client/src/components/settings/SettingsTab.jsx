import { useState, useEffect } from 'react';

function loadStr(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadConfig(id) {
  try {
    const s = localStorage.getItem(`testforge_provider_${id}_config`);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export default function SettingsTab({ config, setConfig, provider, setProvider }) {
  const [org, setOrg] = useState(() => loadStr('testforge_org', config.org || ''));
  const [project, setProject] = useState(() => loadStr('testforge_project', config.project || ''));
  const [chromePath, setChromePath] = useState(() =>
    loadStr('testforge_chromePath', config.chromePath || '')
  );

  const [selectedId, setSelectedId] = useState(provider.id || 'ollama');
  const [providerConfig, setProviderConfig] = useState(() => loadConfig(selectedId));
  const [testStatus, setTestStatus] = useState('');
  const [testStatusClass, setTestStatusClass] = useState('');
  const [models, setModels] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState('');
  const [showEnvExample, setShowEnvExample] = useState(false);

  const currentProvider = config.providers?.find((p) => p.id === selectedId);

  useEffect(() => {
    if (currentProvider) {
      setProviderConfig(loadConfig(selectedId));
      setTestStatus('');
      setTestStatusClass('');
      setModels(currentProvider.models || []);
    }
  }, [selectedId]);

  useEffect(() => {
    setProvider({ id: selectedId, config: providerConfig });
  }, [selectedId, providerConfig]);

  const saveAll = () => {
    try {
      localStorage.setItem('testforge_org', org);
      localStorage.setItem('testforge_project', project);
      localStorage.setItem('testforge_chromePath', chromePath);
      localStorage.setItem(
        `testforge_provider_${selectedId}_config`,
        JSON.stringify(providerConfig)
      );
      setConfig((prev) => ({ ...prev, org, project, chromePath }));
      setProvider({ id: selectedId, config: providerConfig });
      setSaveIndicator('✓ Saved');
      setTimeout(() => setSaveIndicator(''), 2000);
    } catch {
      setSaveIndicator('✗ Save failed');
      setTimeout(() => setSaveIndicator(''), 2000);
    }
  };

  const refreshModels = async () => {
    let endpoint = '';
    let apiKey = '';
    switch (selectedId) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/models';
        apiKey = providerConfig.apiKey || '';
        break;
      case 'google':
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
        apiKey = providerConfig.apiKey || '';
        break;
      case 'ollama': {
        const baseUrl = providerConfig.baseUrl || 'http://localhost:11434';
        setRefreshing(true);
        try {
          const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`);
          if (res.ok) {
            const data = await res.json();
            const ollamaModels = (data.models || []).map((m) => m.name);
            setModels(ollamaModels);
            setTestStatus(`✓ ${ollamaModels.length} model(s) found`);
            setTestStatusClass('ok');
          } else {
            setTestStatus(`✗ Ollama returned ${res.status}`);
            setTestStatusClass('err');
          }
        } catch (err) {
          setTestStatus(`✗ Cannot reach Ollama: ${err.message}`);
          setTestStatusClass('err');
        }
        setRefreshing(false);
        return;
      }
      case 'claude':
      case 'opencode':
        setTestStatus('⚠ This provider does not support model discovery. Models are curated.');
        setTestStatusClass('');
        return;
      default:
        return;
    }

    if (!endpoint) return;
    setRefreshing(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const data = await res.json();
        let fetched = (data.data || []).map((m) => m.id);
        if (selectedId === 'openai') {
          fetched = fetched.filter((m) => m.includes('gpt') || m.includes('o'));
        }
        fetched.sort();
        setModels(fetched);
        setTestStatus(`✓ ${fetched.length} model(s) found`);
        setTestStatusClass('ok');
      } else {
        const text = await res.text().catch(() => '');
        setTestStatus(`✗ ${res.status}: ${text.slice(0, 200)}`);
        setTestStatusClass('err');
      }
    } catch (err) {
      setTestStatus(`✗ ${err.message}`);
      setTestStatusClass('err');
    }
    setRefreshing(false);
  };

  const testConnection = async () => {
    setTestStatus('Testing…');
    setTestStatusClass('');
    try {
      const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedId,
          config: providerConfig,
          systemPrompt: 'You are a helpful assistant. Reply with exactly: OK',
          userMessage: 'Say OK',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTestStatus(`✗ ${data.error || res.status}`);
        setTestStatusClass('err');
        return;
      }
      let received = false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (const part of buf.split('\n\n')) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) {
            buf = '';
            continue;
          }
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'chunk') received = true;
            if (ev.type === 'done') {
              setTestStatus(received ? '✓ Connected successfully' : '✓ Connected (no content)');
              setTestStatusClass('ok');
              return;
            }
            if (ev.type === 'error') {
              setTestStatus(`✗ ${ev.message}`);
              setTestStatusClass('err');
              return;
            }
          } catch {}
        }
      }
      setTestStatus(received ? '✓ Connected' : '⚠ No response');
      setTestStatusClass(received ? 'ok' : '');
    } catch (err) {
      setTestStatus(`✗ ${err.message}`);
      setTestStatusClass('err');
    }
  };

  const updateConfigField = (key, value) => {
    setProviderConfig((prev) => ({ ...prev, [key]: value }));
  };

  const envVal = (key) => config.env?.[key] || '';

  return (
    <>
      <div className="card">
        <div className="ado-card-header">
          <span className="ado-card-title">
            <span className="material-icons">folder</span>
            Project Details
          </span>
        </div>
        <div className="ado-card-body">
          <div className="settings-section-grid">
            <div className="ado-field">
              <label htmlFor="adoOrg">ADO Organisation</label>
              <input
                id="adoOrg"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="e.g. MyOrganisation"
              />
              {envVal('ADO_ORG') && (
                <span className="ado-env-hint">Server default: {envVal('ADO_ORG')}</span>
              )}
            </div>
            <div className="ado-field">
              <label htmlFor="adoProject">ADO Project</label>
              <input
                id="adoProject"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. MyProject"
              />
              {envVal('ADO_PROJECT') && (
                <span className="ado-env-hint">Server default: {envVal('ADO_PROJECT')}</span>
              )}
            </div>
            <div className="ado-field">
              <label htmlFor="adoChromePath">
                Chrome Path{' '}
                <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>
                  (optional)
                </span>
              </label>
              <input
                id="adoChromePath"
                value={chromePath}
                onChange={(e) => setChromePath(e.target.value)}
                placeholder="Auto-detected if left empty"
              />
              {envVal('CHROME_PATH') && (
                <span className="ado-env-hint">Server default: {envVal('CHROME_PATH')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ado-card-header">
          <span className="ado-card-title">
            <span className="material-icons">smart_toy</span>
            LLM Provider
          </span>
        </div>
        <div className="ado-card-body">
          <p className="ado-hint">
            Choose which AI provider generates your test scenarios. API keys set via{' '}
            <code>.env</code> are loaded server-side; you can override them here.
          </p>

          <div className="ado-field" style={{ marginBottom: 16 }}>
            <label htmlFor="adoLlmProvider">Provider</label>
            <select
              id="adoLlmProvider"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {(config.providers || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div id="adoLlmConfigFields">
            {currentProvider?.configFields?.map((field) => {
              const val = providerConfig[field.key] ?? field.defaultValue ?? '';
              if (field.type === 'select') {
                const options =
                  field.key === 'model'
                    ? models.length
                      ? models
                      : field.options || []
                    : field.options || [];
                return (
                  <div key={field.key} className="ado-field">
                    <label>{field.label}</label>
                    <select
                      className="input"
                      value={val}
                      onChange={(e) => updateConfigField(field.key, e.target.value)}
                    >
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    {field.envValue && (
                      <span className="ado-env-hint">Server default: {field.envValue}</span>
                    )}
                  </div>
                );
              }
              const inputType = field.type === 'password' ? 'password' : 'text';
              const showVal = field.type === 'password' && val === '••••••' ? '' : val;
              return (
                <div key={field.key} className="ado-field">
                  <label>{field.label}</label>
                  <input
                    type={inputType}
                    className="input"
                    value={showVal}
                    placeholder={field.placeholder || ''}
                    onChange={(e) => updateConfigField(field.key, e.target.value)}
                  />
                  {field.envValue && field.key !== 'apiKey' && (
                    <span className="ado-env-hint">Server default: {field.envValue}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="action-bar"
            style={{ marginTop: 16, marginBottom: 0, justifyContent: 'flex-start' }}
          >
            <button className="btn btn-outline btn-sm" onClick={testConnection}>
              <span className="material-icons">network_check</span> Test Connection
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={refreshModels}
              disabled={refreshing}
            >
              <span className="material-icons">refresh</span>{' '}
              {refreshing ? 'Refreshing…' : 'Refresh Models'}
            </button>
            <span
              className={`ado-parse-status${testStatusClass ? ` ${testStatusClass}` : ''}`}
              style={{ marginLeft: 10, flex: 1 }}
            >
              {testStatus}
            </span>
          </div>

          {config.envExample && (
            <div style={{ marginTop: 20 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowEnvExample(!showEnvExample)}
              >
                <span className="material-icons" style={{ fontSize: 16 }}>
                  {showEnvExample ? 'expand_less' : 'expand_more'}
                </span>
                {showEnvExample ? 'Hide' : 'Show'} .env Example
              </button>
              {showEnvExample && <pre className="ado-env-example">{config.envExample}</pre>}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 24,
          gap: 8,
        }}
      >
        <button className="btn btn-primary btn-lg" onClick={saveAll} style={{ minWidth: 200 }}>
          <span className="material-icons">save</span> Save All Settings
        </button>
        <div style={{ height: 20 }}>
          {saveIndicator && (
            <span
              className={`ado-parse-status ${saveIndicator.startsWith('✓') ? 'ok' : 'err'}`}
              style={{ display: 'inline-flex', alignItems: 'center', margin: 0, fontSize: 13 }}
            >
              {saveIndicator}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
