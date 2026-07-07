import { useState, useRef } from 'react';
import Pipeline from './Pipeline';
import PreReqStep from './PreReqStep';
import InputSource from './InputSource';
import AgentResults from './AgentResults';
import CreateStep from './CreateStep';
import LogResults from './LogResults';

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const scrollMap = {
  signin: 'adoPrereqCard',
  load: 'adoLoadCard',
  generate: 'adoResultsCard',
  results: 'adoLogResultsCard',
};

export default function GeneratorTab(props) {
  const {
    config, provider, providerName, providers,
    pipelineStage, setPipelineStage,
    parsedScenarios, setParsedScenarios,
    resultRows, setResultRows,
    isRunning, setIsRunning,
    agentsRunning, setAgentsRunning, abortRef,
  } = props;

  const [jsonOutput, setJsonOutput] = useState('');
  const [agentLogs, setAgentLogs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [chromeStatus, setChromeStatus] = useState({ text: 'Launch Chrome and sign into Azure DevOps.', cls: '' });
  const [parseStatus, setParseStatus] = useState('');
  const [parseStatusClass, setParseStatusClass] = useState('');
  const [agentMode, setAgentMode] = useState('regular');

  const handleInputReady = async (text, mode) => {
    setAgentsRunning(true);
    setAgentLogs([]);
    setJsonOutput('');
    setParseStatus('');
    setParseStatusClass('');
    setParsedScenarios([]);
    setPipelineStage('generate');

    const controller = new AbortController();
    abortRef.current = controller;

    const logs = [];
    const addLog = (type, message, text) => {
      logs.push({ type, message, text });
      setAgentLogs([...logs]);
    };

    addLog('system', 'Starting 3-agent pipeline…');

    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          provider: provider.id,
          providerConfig: provider.config || {},
          mode: mode || agentMode,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addLog('error', `✗ Server error: ${data.error || res.status}`);
        setAgentsRunning(false);
        abortRef.current = null;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let currentAgent = '';
      let agentStreamBuf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);

            switch (ev.type) {
              case 'agent-start':
                currentAgent = ev.agent;
                agentStreamBuf = '';
                addLog('agent', `🧠 ${ev.agent} analyzing…`);
                break;

              case 'agent-chunk':
                agentStreamBuf += ev.text;
                // Show last ~500 chars as preview
                const preview = agentStreamBuf.slice(-500);
                // Update last log entry with streaming preview
                const lastIdx = logs.length - 1;
                if (lastIdx >= 0 && logs[lastIdx].type === 'stream') {
                  logs[lastIdx].text = preview;
                } else {
                  logs.push({ type: 'stream', message: '', text: preview });
                }
                setAgentLogs([...logs]);
                break;

              case 'agent-done':
                addLog('done', `✓ ${ev.agent} complete`);
                break;

              case 'agent-error':
                addLog('error', `✗ ${ev.agent || 'Agent'} error: ${ev.message}`);
                break;

              case 'pipeline-done':
                addLog('done', '✓ All agents finished. Parsing test cases…');
                setJsonOutput(ev.output || '');
                setAgentsRunning(false);
                abortRef.current = null;
                // Auto-parse the result
                setTimeout(() => handleParse(ev.output), 200);
                break;

              case 'error':
                addLog('error', `✗ ${ev.message}`);
                setAgentsRunning(false);
                abortRef.current = null;
                break;
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        addLog('error', '⚠ Cancelled by user');
      } else {
        addLog('error', `✗ Network error: ${err.message}`);
      }
      setAgentsRunning(false);
      abortRef.current = null;
    }
  };

  const stripFences = (s) => s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  const handleParse = (json) => {
    const raw = stripFences(json || jsonOutput);
    if (!raw) {
      setParsedScenarios([]);
      setParseStatus('Paste or generate JSON above, then click Parse & Validate.');
      setParseStatusClass('');
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { setParsedScenarios([]); setParseStatus(`✗ JSON parse error: ${e.message}`); setParseStatusClass('err'); return; }
    if (!Array.isArray(parsed)) { setParsedScenarios([]); setParseStatus('✗ Expected a JSON array.'); setParseStatusClass('err'); return; }

    const valid = [];
    const invalid = [];
    for (let i = 0; i < parsed.length; i++) {
      const s = parsed[i];
      if (!s.title) invalid.push(`[${i}] missing "title"`);
      else if (!Array.isArray(s.steps) || s.steps.length === 0) invalid.push(`[${i}] "${(s.title || '').slice(0, 60)}…" — no steps`);
      else valid.push(s);
    }
    if (!valid.length) { setParsedScenarios([]); setParseStatus('✗ No valid scenarios found.'); setParseStatusClass('err'); return; }

    setParsedScenarios(valid);
    setPipelineStage('results');
    if (invalid.length) { setParseStatus(`⚠ ${valid.length} ready — ${invalid.length} skipped`); setParseStatusClass(''); }
    else { setParseStatus(`✓ ${valid.length} scenario${valid.length !== 1 ? 's' : ''} ready`); setParseStatusClass('ok'); }
  };

  return (
    <>
      <Pipeline stage={pipelineStage} onScrollTo={(s) => scrollToId(scrollMap[s])} />

      <PreReqStep config={config} chromeStatus={chromeStatus} setChromeStatus={setChromeStatus} />

      <InputSource
        config={config}
        onInputReady={handleInputReady}
        providerName={providerName}
        pipelineStage={pipelineStage}
        onSwitchToSettings={props.onSwitchToSettings}
        agentMode={agentMode}
        onAgentModeChange={setAgentMode}
      />

      <AgentResults
        jsonOutput={jsonOutput}
        setJsonOutput={setJsonOutput}
        agentLogs={agentLogs}
        agentsRunning={agentsRunning}
        pipelineStage={pipelineStage}
        onParse={handleParse}
        parsedCount={parsedScenarios.length}
        parseStatus={parseStatus}
        parseStatusClass={parseStatusClass}
      />

      <CreateStep
        config={config}
        parsedScenarios={parsedScenarios}
        scenarioCount={parsedScenarios.length}
        chromeStatus={chromeStatus}
        setChromeStatus={setChromeStatus}
        isRunning={isRunning}
        setIsRunning={setIsRunning}
        setLogs={setLogs}
        setResultRows={setResultRows}
        setSummary={setSummary}
        setPipelineStage={setPipelineStage}
      />

      <LogResults
        logs={logs}
        setLogs={setLogs}
        summary={summary}
        resultRows={resultRows}
        parsedScenarios={parsedScenarios}
      />
    </>
  );
}
