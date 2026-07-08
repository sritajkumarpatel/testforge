import { useState } from 'react';
import Pipeline from './Pipeline';
import PreReqStep from './PreReqStep';
import InputSource from './InputSource';
import AgentResults from './AgentResults';
import CreateStep from './CreateStep';
import LogResults from './LogResults';
import usePipeline from '../hooks/usePipeline';

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
    config,
    provider,
    providerName,
    pipelineStage,
    setPipelineStage,
    parsedScenarios,
    setParsedScenarios,
    resultRows,
    setResultRows,
    isRunning,
    setIsRunning,
    agentsRunning,
    setAgentsRunning,
    abortRef,
  } = props;

  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [chromeStatus, setChromeStatus] = useState({
    text: 'Launch Chrome and sign into Azure DevOps.',
    cls: '',
  });

  const {
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
  } = usePipeline({
    provider,
    setParsedScenarios,
    setPipelineStage,
    setAgentsRunning,
    abortRef,
  });

  const handleExportLog = async () => {
    const result = await exportLog();
    // Export result is surfaced via AgentResults; logs stay in hook state.
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn(result.message);
    }
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
        runId={runId}
        onExportLog={handleExportLog}
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
