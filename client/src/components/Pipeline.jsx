import { Fragment } from 'react';

const STAGES = ['signin', 'load', 'generate', 'results'];

export default function Pipeline({ stage, onScrollTo }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="pipeline">
      {STAGES.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <div className={`pipeline-connector${i <= idx ? ' done' : ''}${i === idx ? ' active' : ''}`} />}
          <div className={`pipeline-step${i < idx ? ' done' : i === idx ? ' active' : ' pending'}`} onClick={() => onScrollTo(s)}>
            <div className="pipeline-circle">
              {i < idx ? <span className="material-icons" style={{ fontSize: 16 }}>check</span> : <span>{i + 1}</span>}
            </div>
            <div className="pipeline-label">{s === 'signin' ? 'Sign In' : s.charAt(0).toUpperCase() + s.slice(1)}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
