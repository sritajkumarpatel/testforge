import { useState, useEffect } from 'react';

export default function SettingsTab({ config, setConfig, provider, setProvider }) {
  const [org, setOrg] = useState(config.org || '');
  const [project, setProject] = useState(config.project || '');
  const [chromePath, setChromePath] = useState(config.chromePath || '');

  const [selectedId, setSelectedId] = useState(provider.id || 'ollama');
  const [providerConfig, setProviderConfig] = useState(provider.config || {});
  const [testStatus, setTestStatus] = useState('');
  const [testStatusClass, setTestStatusClass] = useState('');
  const [models, setModels] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const currentProvider = config.providers?.find((p) => p.id === selectedId);

  useEffect(() => {
    if (currentProvider) {
      setProviderConfig({});
      setTestStatus('');
      setTestStatusClass('');
      setModels(currentProvider.models || []);
    }
  }, [selectedId]);

  useEffect(() => {
    setProvider({ id: selectedId, config: providerConfig });
  }, [selectedId, providerConfig]);

  const refreshModels = async () => {
    let endpoint = '';
    let apiKey = '';
    switch (selectedId) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/models';
        apiKey = providerConfig.apiKey || process.env.OPENAI_API_KEY;
        break;
      case 'google':
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
        apiKey = providerConfig.apiKey || process.env.GOOGLE_API_KEY;
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
          if (!line) { buf = ''; continue; }
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'chunk') received = true;
            if (ev.type === 'done') { setTestStatus(received ? '✓ Connected successfully' : '✓ Connected (no content)'); setTestStatusClass('ok'); return; }
            if (ev.type === 'error') { setTestStatus(`✗ ${ev.message}`); setTestStatusClass('err'); return; }
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
              <input id="adoOrg" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. MyOrganisation" />
            </div>
            <div className="ado-field">
              <label htmlFor="adoProject">ADO Project</label>
              <input id="adoProject" value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. MyProject" />
            </div>
            <div className="ado-field">
              <label htmlFor="adoChromePath">Chrome Path <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>(optional)</span></label>
              <input id="adoChromePath" value={chromePath} onChange={(e) => setChromePath(e.target.value)} placeholder="Auto-detected if left empty" />
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
            Choose which AI provider generates your test scenarios. API keys set via <code>.env</code> are loaded server-side; you can override them here for the session.
          </p>

          <div className="ado-field" style={{ marginBottom: 16 }}>
            <label htmlFor="adoLlmProvider">Provider</label>
            <select id="adoLlmProvider" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {(config.providers || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div id="adoLlmConfigFields">
            {currentProvider?.configFields?.map((field) => {
              const val = providerConfig[field.key] ?? field.defaultValue ?? '';
              if (field.type === 'select') {
                const options = field.key === 'model' ? (models.length ? models : field.options || []) : (field.options || []);
                return (
                  <div key={field.key} className="provider-config-field">
                    <label>{field.label}</label>
                    <select className="input" value={val} onChange={(e) => updateConfigField(field.key, e.target.value)}>
                      {options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                );
              }
              const inputType = field.type === 'password' ? 'password' : 'text';
              return (
                <div key={field.key} className="provider-config-field">
                  <label>{field.label}</label>
                  <input type={inputType} className="input" value={val === '••••••' ? '' : val} placeholder={field.placeholder || ''} onChange={(e) => updateConfigField(field.key, e.target.value)} />
                </div>
              );
            })}
          </div>

          <div className="action-bar" style={{ marginTop: 16, marginBottom: 0, justifyContent: 'flex-start' }}>
            <button className="btn btn-outline btn-sm" onClick={testConnection}>
              <span className="material-icons">network_check</span> Test Connection
            </button>
            <button className="btn btn-outline btn-sm" onClick={refreshModels} disabled={refreshing}>
              <span className="material-icons">refresh</span> {refreshing ? 'Refreshing…' : 'Refresh Models'}
            </button>
            <span className={`ado-parse-status${testStatusClass ? ` ${testStatusClass}` : ''}`} style={{ marginLeft: 10, flex: 1 }}>{testStatus}</span>
          </div>
        </div>
      </div>
    </>
  );
}
