/**
 * @typedef {Object} ProviderUsage
 * @property {number} [inputTokens]
 * @property {number} [outputTokens]
 * @property {boolean} [unsupported]
 * @property {string} [reason]
 */

/**
 * @typedef {Object} AgentRun
 * @property {string} agentId
 * @property {string} name
 * @property {"success"|"error"} status
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {string} output
 * @property {string|null} error
 * @property {number|null} inputTokens
 * @property {number|null} outputTokens
 * @property {string|null} tokenNote
 */

/**
 * @typedef {Object} ClassifierResult
 * @property {"success"|"error"} status
 * @property {string} output
 * @property {string} reasoning
 * @property {string[]} nextAgents
 * @property {string[]} requirementTypes
 * @property {number|null} inputTokens
 * @property {number|null} outputTokens
 * @property {string|null} tokenNote
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {string|null} error
 */

/**
 * @typedef {Object} AuditLog
 * @property {string} runId
 * @property {string} timestamp
 * @property {string} completedAt
 * @property {Object} metadata
 * @property {Object} input
 * @property {ClassifierResult} classifier
 * @property {AgentRun[]} agents
 * @property {string} finalOutput
 * @property {Object} totals
 */

module.exports = {};
