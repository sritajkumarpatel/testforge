"use strict";

const { z } = require("zod");
const config = require("./config");

const runPipelineSchema = z.object({
  input: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(config.maxInputLength)),
  provider: z.string().min(1).max(50).optional(),
  providerConfig: z.record(z.any()).optional(),
  mode: z.enum(["regular", "bdd"]).optional(),
  requirementId: z.string().max(100).optional(),
  ticketTitle: z.string().max(200).optional(),
  ticketNumber: z.string().max(50).optional(),
});

const llmGenerateSchema = z.object({
  provider: z.string().min(1).max(50),
  model: z.string().max(100).optional(),
  systemPrompt: z.string().max(config.maxSystemPromptLength).optional(),
  userMessage: z.string().min(1).max(config.maxInputLength),
  config: z.record(z.any()).optional(),
});

const adoRunSchema = z.object({
  scenarios: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        tags: z.array(z.string().max(100)).optional(),
        steps: z.array(
          z.object({
            action: z.string().min(1).max(5000),
            expected: z.string().max(5000).optional(),
          })
        ),
      })
    )
    .min(1)
    .max(config.maxAdoScenarios),
  config: z.object({
    org: z.string().min(1).max(100),
    project: z.string().min(1).max(100),
  }),
});

const adoWorkItemSchema = z.object({
  org: z.string().min(1).max(100),
  project: z.string().min(1).max(100),
  id: z.string().min(1).max(20),
});

const classifierOutputSchema = z.object({
  requirementTypes: z.array(z.enum(["ui", "api", "mock"])),
  reasoning: z.string().optional(),
  nextAgents: z.array(z.enum(["ui-agent", "api-agent", "mock-agent"])),
  executionMode: z.enum(["sequential", "parallel"]).optional(),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return { success: false, errors: issues };
  }
  return { success: true, data: result.data };
}

module.exports = {
  runPipelineSchema,
  llmGenerateSchema,
  adoRunSchema,
  adoWorkItemSchema,
  classifierOutputSchema,
  validate,
};
