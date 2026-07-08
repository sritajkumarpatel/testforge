export default function TabNav({ activeTab, onSwitch }) {
  return (
    <div className="app-tabs">
      <button
        className={`app-tab${activeTab === 'generator' ? ' active' : ''}`}
        onClick={() => onSwitch('generator')}
      >
        <span className="material-icons">auto_awesome</span>
        Pipeline
      </button>
      <button
        className={`app-tab${activeTab === 'settings' ? ' active' : ''}`}
        onClick={() => onSwitch('settings')}
      >
        <span className="material-icons">settings</span>
        Settings
      </button>
    </div>
  );
}
