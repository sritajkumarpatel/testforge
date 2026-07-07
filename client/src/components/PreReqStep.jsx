export default function PreReqStep({ config, chromeStatus, setChromeStatus }) {
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
        setChromeStatus({ text: `✓ Chrome launched — sign into ADO in the opened window.`, cls: 'ok', url: data.url });
      } else {
        setChromeStatus({ text: `✗ ${data.error || 'Unknown error'}`, cls: 'err' });
      }
    } catch (err) {
      setChromeStatus({ text: `✗ ${err.message}`, cls: 'err' });
    }
  };

  return (
    <div className="card card-emphasis" id="adoPrereqCard">
      <div className="ado-card-header">
        <span className="ado-card-title">
          <span className="material-icons">verified_user</span>
          Prerequisite: Chrome Sign-in
        </span>
        <span className={`section-badge ${chromeStatus.cls === 'ok' ? 'done' : 'active'}`}>
          {chromeStatus.cls === 'ok' ? '✓ Signed In' : '● Required'}
        </span>
      </div>
      <div className="ado-card-body">
        <p className="ado-hint">
          TestForge uses your browser session to create work items in Azure DevOps. Launch Chrome and sign into ADO before generating test cases.
        </p>
        <div className="ado-step-row">
          <button className="btn btn-primary btn-lg" onClick={launchChrome}>
            <span className="material-icons">open_in_new</span> Launch Chrome &amp; Sign In
          </button>
          <span className={'ado-step-status' + (chromeStatus.cls ? ' ' + chromeStatus.cls : '')}>
            {chromeStatus.url
              ? <span dangerouslySetInnerHTML={{ __html: '✓ Chrome launched — <a href="' + chromeStatus.url + '" target="_blank" style="color:#818cf8">open ADO</a> &nbsp;·&nbsp; Sign in with your account' }} />
              : chromeStatus.text}
          </span>
        </div>
      </div>
    </div>
  );
}
