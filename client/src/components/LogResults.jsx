import { useEffect, useRef } from 'react';

export default function LogResults({ logs, summary, resultRows, parsedScenarios }) {
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <>
      <div className="card" id="adoLogResultsCard">
        <div className="ado-card-header">
          <span className="ado-card-title">
            <span className="material-icons">terminal</span>
            Log &amp; Results
          </span>
          <span className="section-badge pending">Pending</span>
        </div>

        {summary && (
          <div className="ado-summary-bar visible">
            <div className="ado-stat ado-stat--created">
              <span className="ado-stat-label">Created</span>
              <span className="ado-stat-value">{summary.created}</span>
            </div>
            <div className="ado-stat ado-stat--failed">
              <span className="ado-stat-label">Failed</span>
              <span className="ado-stat-value">{summary.failed}</span>
            </div>
            <div className="ado-stat ado-stat--total">
              <span className="ado-stat-label">Total</span>
              <span className="ado-stat-value">{summary.total}</span>
            </div>
          </div>
        )}

        <div className="ado-log-wrap" ref={logRef}>
          {logs.map((l, i) => (
            <span key={i} className={l.cls ? `log-${l.cls}` : ''}>
              {l.msg}
              {'\n'}
            </span>
          ))}
        </div>
      </div>

      {parsedScenarios.length > 0 && (
        <div className="card ado-results-wrap visible" id="adoResultsWrap">
          <div className="ado-card-header">
            <span className="ado-card-title">
              <span className="material-icons">table_chart</span>
              Results
            </span>
          </div>
          <table className="ado-results-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>Title</th>
                <th className="col-tags">Tags</th>
                <th className="col-status">Status</th>
                <th className="col-wi">Work Item</th>
              </tr>
            </thead>
            <tbody>
              {parsedScenarios.map((s, i) => {
                const r = resultRows[i];
                const tagPills = (s.tags || [])
                  .map((t) => `<span class="ado-tag">${escHtml(t)}</span>`)
                  .join('');
                return (
                  <tr key={i} id={`ado-row-${i}`}>
                    <td>{i + 1}</td>
                    <td className="ado-title-cell" title={s.title}>
                      {escHtml(s.title)}
                    </td>
                    <td className="ado-tags-cell" dangerouslySetInnerHTML={{ __html: tagPills }} />
                    <td className="ado-status-cell">
                      {!r ? (
                        <span className="ado-badge-pending">—</span>
                      ) : r.status === 'created' ? (
                        <span className="ado-badge-created">✓ Created</span>
                      ) : (
                        <span className="ado-badge-failed">
                          ✗ {r.status === 'failed' ? `HTTP ${r.httpStatus}` : 'Error'}
                        </span>
                      )}
                    </td>
                    <td>
                      {r?.status === 'created' ? (
                        r.adoUrl ? (
                          <a
                            className="ado-id-link"
                            href={r.adoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            #{r.id}
                          </a>
                        ) : (
                          `#${r.id}`
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
