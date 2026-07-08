import { useState, useEffect, useCallback, useRef } from 'react';
import TabNav from './components/common/TabNav';
import GeneratorTab from './components/generator/GeneratorTab';
import SettingsTab from './components/settings/SettingsTab';

const STAGES = ['load', 'generate', 'results'];

export default function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [config, setConfig] = useState({ org: '', project: '', chromePath: '', providers: [] });
  const [provider, setProvider] = useState({ id: 'ollama', config: {} });
  const [parsedScenarios, setParsedScenarios] = useState([]);
  const [resultRows, setResultRows] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState('load');
  const [attachedFile, setAttachedFile] = useState({ name: '', content: '' });
  const [agentsRunning, setAgentsRunning] = useState(false);
  const abortRef = useRef(null);

  const handleTabSwitch = (tab) => {
    if (agentsRunning) {
      if (confirm('Agents are still running. Cancel and switch?')) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        setAgentsRunning(false);
        setActiveTab(tab);
      }
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.providers?.length) {
          setProvider({ id: cfg.providers[0].id, config: {} });
        }
      })
      .catch(() => console.warn('Failed to load config'));
  }, []);

  const resetAll = useCallback(() => {
    setParsedScenarios([]);
    setResultRows([]);
    setAttachedFile({ name: '', content: '' });
    setPipelineStage('plan');
    setIsRunning(false);
  }, []);

  const providerObj = config.providers?.find((p) => p.id === provider.id);
  const providerName = providerObj?.name || provider.id;

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-brand">
            <span className="app-header-logo">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
              </svg>
            </span>
            <span className="app-header-name">TestForge</span>
          </div>
          <div className="app-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={resetAll}>
              <span className="material-icons" style={{ fontSize: 16 }}>
                refresh
              </span>
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="page-wrap">
        <TabNav activeTab={activeTab} onSwitch={handleTabSwitch} />

        <div
          style={{
            display: activeTab === 'generator' ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <GeneratorTab
            config={config}
            provider={provider}
            providerName={providerName}
            providers={config.providers || []}
            parsedScenarios={parsedScenarios}
            setParsedScenarios={setParsedScenarios}
            resultRows={resultRows}
            setResultRows={setResultRows}
            isRunning={isRunning}
            setIsRunning={setIsRunning}
            pipelineStage={pipelineStage}
            setPipelineStage={setPipelineStage}
            attachedFile={attachedFile}
            setAttachedFile={setAttachedFile}
            onSwitchToSettings={() => handleTabSwitch('settings')}
            agentsRunning={agentsRunning}
            setAgentsRunning={setAgentsRunning}
            abortRef={abortRef}
          />
        </div>

        <div
          style={{
            display: activeTab === 'settings' ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <SettingsTab
            config={config}
            setConfig={setConfig}
            provider={provider}
            setProvider={setProvider}
          />
        </div>
      </div>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span className="app-footer-copy">&copy; 2026 Sritaj Kumar Patel</span>
          <span className="app-footer-dot" />
          <span className="app-footer-tagline">AI-powered test case generation</span>
          <span className="app-footer-dot" />
          <span className="app-footer-version">v{config.version || '2.0.0'}</span>
        </div>
      </footer>
    </>
  );
}
