import { useState, useCallback } from 'react';

export default function usePipeline({
  provider,
  setParsedScenarios,
  setPipelineStage,
  setAgentsRunning,
  abortRef,
}) {
  const [jsonOutput, setJsonOutput] = useState('');
  const [agentLogs, setAgentLogs] = useState([]);
  const [parseStatus, setParseStatus] = useState('');
  const [parseStatusClass, setParseStatusClass] = useState('');
  const [runId, setRunId] = useState('');
  const [agentMode, setAgentMode] = useState('regular');

  const stripFences = (s) =>
    s
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

  const pushLog = useCallback((type, message, text, agentId) => {
    setAgentLogs((prev) => [...prev, { type, message, text, agentId }]);
  }, []);

  const handleParse = useCallback(
    (json) => {
      const raw = stripFences(json || jsonOutput);
      if (!raw) {
        setParsedScenarios([]);
        setParseStatus('Paste or generate JSON above, then click Parse & Validate.');
        setParseStatusClass('');
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        setParsedScenarios([]);
        setParseStatus(`✗ JSON parse error: ${e.message}`);
        setParseStatusClass('err');
        return;
      }
      if (!Array.isArray(parsed)) {
        setParsedScenarios([]);
        setParseStatus('✗ Expected a JSON array.');
        setParseStatusClass('err');
        return;
      }

      const valid = [];
      const invalid = [];
      for (let i = 0; i < parsed.length; i++) {
        const s = parsed[i];
        if (!s.title) invalid.push(`[${i}] missing "title"`);
        else if (!Array.isArray(s.steps) || s.steps.length === 0)
          invalid.push(`[${i}] "${(s.title || '').slice(0, 60)}…" — no steps`);
        else valid.push(s);
      }
      if (!valid.length) {
        setParsedScenarios([]);
        setParseStatus('✗ No valid scenarios found.');
        setParseStatusClass('err');
        return;
      }

      setParsedScenarios(valid);
      setPipelineStage('results');
      if (invalid.length) {
        setParseStatus(`⚠ ${valid.length} ready — ${invalid.length} skipped`);
        setParseStatusClass('');
      } else {
        setParseStatus(`✓ ${valid.length} scenario${valid.length !== 1 ? 's' : ''} ready`);
        setParseStatusClass('ok');
      }
    },
    [jsonOutput, setParsedScenarios, setPipelineStage]
  );

  const handleInputReady = useCallback(
    async (text, meta = {}) => {
      setAgentsRunning(true);
      setAgentLogs([]);
      setJsonOutput('');
      setParseStatus('');
      setParseStatusClass('');
      setParsedScenarios([]);
      setPipelineStage('generate');

      const controller = new AbortController();
      abortRef.current = controller;
      let hasError = false;

      pushLog('system', 'Starting orchestrated pipeline…');

      try {
        const res = await fetch('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: text,
            provider: provider.id,
            providerConfig: provider.config || {},
            mode: meta.mode || agentMode,
            requirementId: meta.requirementId || '',
            ticketTitle: meta.ticketTitle || '',
            ticketNumber: meta.ticketNumber || '',
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          pushLog('error', `✗ Server error: ${data.error || res.status}`);
          setAgentsRunning(false);
          abortRef.current = null;
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
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
                case 'pipeline-start':
                  setRunId(ev.runId || '');
                  pushLog('system', `Run ID: ${ev.runId || 'N/A'}`, '', 'system');
                  break;

                case 'classifier-decision':
                  pushLog(
                    'done',
                    `Classifier detected: ${(ev.decision || []).join(', ') || 'none'}`,
                    '',
                    'classifier'
                  );
                  if (ev.reasoning) {
                    pushLog('system', `Reasoning: ${ev.reasoning}`, '', 'classifier');
                  }
                  break;

                case 'agent-start':
                  agentStreamBuf = '';
                  pushLog('agent', `🧠 ${ev.agent} analyzing…`, '', ev.agentId);
                  break;

                case 'agent-chunk':
                  agentStreamBuf += ev.text;
                  {
                    const preview = agentStreamBuf.slice(-500);
                    setAgentLogs((prev) => {
                      const last = prev[prev.length - 1];
                      if (last && last.type === 'stream' && last.agentId === ev.agentId) {
                        return [...prev.slice(0, -1), { ...last, text: preview }];
                      }
                      return [
                        ...prev,
                        { type: 'stream', message: '', text: preview, agentId: ev.agentId },
                      ];
                    });
                  }
                  break;

                case 'agent-done':
                  pushLog('done', `✓ ${ev.agent} complete (${ev.status})`, '', ev.agentId);
                  break;

                case 'agent-error':
                  pushLog('error', `✗ ${ev.agent || 'Agent'} error: ${ev.message}`, '', ev.agentId);
                  break;

                case 'pipeline-error':
                  hasError = true;
                  pushLog('error', `✗ Pipeline error: ${ev.message}`, '', 'system');
                  setAgentsRunning(false);
                  abortRef.current = null;
                  break;

                case 'pipeline-done':
                  if (hasError) break;
                  pushLog('done', '✓ All agents finished. Parsing test cases…', '', 'system');
                  setJsonOutput(ev.output || '');
                  setAgentsRunning(false);
                  abortRef.current = null;
                  setTimeout(() => handleParse(ev.output), 200);
                  break;

                case 'error':
                  pushLog('error', `✗ ${ev.message}`, '', 'system');
                  setAgentsRunning(false);
                  abortRef.current = null;
                  break;
              }
            } catch {
              // ignore malformed stream events
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          pushLog('error', '⚠ Cancelled by user');
        } else {
          pushLog('error', `✗ Network error: ${err.message}`);
        }
        setAgentsRunning(false);
        abortRef.current = null;
      }
    },
    [
      provider,
      agentMode,
      pushLog,
      setParsedScenarios,
      setPipelineStage,
      setAgentsRunning,
      abortRef,
      handleParse,
    ]
  );

  const exportLog = useCallback(async () => {
    if (!runId) {
      pushLog('error', 'No run ID available to export.');
      return { ok: false, message: 'No run ID available to export.' };
    }
    try {
      const res = await fetch(`/api/agents/run/${encodeURIComponent(runId)}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = `✗ Export failed: ${data.error || res.status}`;
        pushLog('error', message);
        return { ok: false, message };
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${runId}-audit-log.txt`;
      a.click();
      URL.revokeObjectURL(url);
      pushLog('done', '✓ Audit log exported');
      return { ok: true, message: '✓ Audit log exported' };
    } catch (err) {
      const message = `✗ Export error: ${err.message}`;
      pushLog('error', message);
      return { ok: false, message };
    }
  }, [runId, pushLog]);

  return {
    jsonOutput,
    setJsonOutput,
    agentLogs,
    parseStatus,
    parseStatusClass,
    runId,
    agentMode,
    setAgentMode,
    handleInputReady,
    exportLog,
    handleParse,
  };
}
