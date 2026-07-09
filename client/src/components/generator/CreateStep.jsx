export default function CreateStep({
  config,
  parsedScenarios,
  scenarioCount,
  chromeStatus,
  setChromeStatus,
  isRunning,
  setIsRunning,
  setLogs,
  setResultRows,
  setSummary,
  setPipelineStage,
}) {
  const launchChrome = async () => {
    setChromeStatus({ text: 'Launching Chrome…', cls: '' });
    try {
      const res = await fetch('/api/ado/launch-chrome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: config.org, project: config.project }),
      });
      const data = await res.json();
      if (data.ok) {
        setChromeStatus({
          text: `✓ Chrome launched — open ADO. Sign in, then continue below.`,
          cls: 'ok',
          url: data.url,
        });
      } else {
        setChromeStatus({ text: `✗ ${data.error || 'Unknown error'}`, cls: 'err' });
      }
    } catch (err) {
      setChromeStatus({ text: `✗ ${err.message}`, cls: 'err' });
    }
  };

  const startRun = async () => {
    if (isRunning) return;
    if (!config.org || !config.project) {
      alert('Please fill in ADO Organisation and ADO Project in Settings.');
      return;
    }
    if (!parsedScenarios.length) {
      alert('Parse your scenarios first.');
      return;
    }

    const count = parsedScenarios.length;
    const modeDesc = config.adoPatAvailable
      ? 'via Personal Access Token'
      : 'via Browser CDP Session';
    if (
      !confirm(
        `Create ${count} test case${count !== 1 ? 's' : ''} in ${config.org}/${config.project} ${modeDesc}?`
      )
    )
      return;

    setIsRunning(true);
    setResultRows([]);
    setLogs([]);
    setPipelineStage('create');
    appendLog(`Starting — ${count} scenario${count !== 1 ? 's' : ''} ${modeDesc}`, 'info');

    const endpoint = config.adoPatAvailable ? '/api/ado/run-pat' : '/api/ado/run';

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarios: parsedScenarios, config }),
      });
    } catch (err) {
      appendLog(`Network error: ${err.message}`, 'error');
      setIsRunning(false);
      return;
    }
    if (!response.ok && !response.body) {
      appendLog(`Server error ${response.status}`, 'error');
      setIsRunning(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
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
            handleEvent(JSON.parse(line));
          } catch {}
        }
      }
    } catch (err) {
      appendLog(`Stream error: ${err.message}`, 'error');
    }
    setIsRunning(false);
  };

  const appendLog = (msg, cls) => {
    setLogs((prev) => [...prev, { msg, cls: cls || '' }]);
  };

  const handleEvent = (ev) => {
    switch (ev.type) {
      case 'log':
        appendLog(ev.message);
        break;
      case 'error':
        appendLog(`✗ ${ev.message}`, 'error');
        break;
      case 'status':
        appendLog(`${ev.total} queued`, 'info');
        break;
      case 'case-done': {
        setResultRows((prev) => {
          const r = [...prev];
          r[ev.index] = ev;
          return r;
        });
        const label = (ev.tags || []).join(' · ') || ev.title;
        if (ev.status === 'created') appendLog(`  ✓ ${label} — ID: ${ev.id}`, 'success');
        else if (ev.status === 'failed') appendLog(`  ✗ ${label} — HTTP ${ev.httpStatus}`, 'error');
        else appendLog(`  ✗ ${label} — ${ev.error}`, 'error');
        break;
      }
      case 'done': {
        appendLog(
          `Done — Created: ${ev.totalCreated} Failed: ${ev.totalFailed}`,
          ev.totalFailed > 0 ? 'error' : 'success'
        );
        setSummary({
          created: ev.totalCreated,
          failed: ev.totalFailed,
          total: ev.totalCreated + ev.totalFailed,
        });
        setPipelineStage('results');
        break;
      }
      default:
        console.warn('unknown event', ev.type, ev);
    }
  };

  return (
    <div className="card card-emphasis" id="adoCreateCard">
      <div className="ado-card-header" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="ado-card-title">
          <span className="material-icons">cloud_upload</span>
          Step 3: Create in Azure DevOps
        </span>
        <span className="section-badge pending">Pending</span>
        <span
          className="section-badge"
          style={{
            backgroundColor: chromeStatus.cls === 'ok' ? '#d1fae5' : '#fef3c7',
            color: chromeStatus.cls === 'ok' ? '#065f46' : '#92400e',
            fontWeight: 600,
          }}
        >
          <span
            className="material-icons"
            style={{ fontSize: 14, marginRight: 4, verticalAlign: 'middle' }}
          >
            {chromeStatus.cls === 'ok' ? 'check_circle' : 'warning'}
          </span>
          Prerequisite: Chrome Sign-in
        </span>
      </div>
      <div className="ado-card-body">
        <p className="ado-hint">
          After signing into Azure DevOps via the Prerequisite step, create your test cases here.
          The tool uses your browser session — no PAT needed.
        </p>
        <div className="ado-step-row">
          <button
            className="btn btn-primary btn-lg"
            onClick={startRun}
            disabled={isRunning || !scenarioCount}
          >
            <span className="material-icons">publish</span> Create in Azure DevOps
          </button>
          <span className="ado-step-desc">
            Creates all parsed test cases as ADO work items using your browser session.
          </span>
        </div>
      </div>
    </div>
  );
}
