---
name: generate-ado-test-cases
description: "Generate ADO test case JSON for the ADO Test Case Helper. Accepts either a free-form request or a title list from /plan-test-scenarios. Produces a JSON array ready to paste into the Scenarios textarea."
---

# ADO Test Case Generator

You are generating **Azure DevOps test case objects** for the ADO Test Case Helper tool.

The output must be a **single valid JSON array** — nothing else. No markdown fences, no prose, just the array.

---

## Two input modes

### Mode A — Title list (from `/plan-test-scenarios`)

The user pastes a list of titles like:

```
Convert these titles to ADO JSON:

- Login — Valid credentials | Admin role
- Login — Invalid password | Standard user
- Login — Account locked after 5 failed attempts
```

For each title, generate a complete test case object with a `title`, `tags`, and `steps` array.

### Mode B — Free-form request

The user describes what they want in natural language, e.g.:

> "Generate test cases for the checkout flow covering guest and logged-in users."

Infer sensible titles, steps, and tags from the description.

---

## Output format

Each element in the array:

```jsonc
{
  "title": "...", // required — use the title exactly as given in Mode A
  "tags": ["..."], // optional — derived from the title or request (feature area, category, variant, etc.)
  "steps": [
    {
      "action": "...", // required — what the tester does
      "expected": "...", // required — what should happen
    },
  ],
}
```

`\n` inside `action` / `expected` renders as a line break in ADO.
`\n\n` renders as a paragraph break.

---

## Step writing guidelines

- **Action**: write in imperative form — what the tester physically does or sets up.
  - Include preconditions as the first line when relevant (e.g. `Pre-requisite: user must be logged in.`).
  - Be specific enough that a tester with no prior context can follow the step.
- **Expected**: describe the observable outcome — UI state, API response, data change, error message, etc.
  - One outcome per expected field. Use `\n\n` to separate multiple observable effects.
- Keep steps focused: one action → one expected result per step.
- Avoid coupling steps unnecessarily — each step should make sense in sequence.

---

## Tag guidelines

Derive tags from the title and context. Typical tag dimensions:

- Feature area or module (e.g. `Login`, `Checkout`, `UserAPI`)
- Test category (e.g. `HappyPath`, `NegativeCase`, `Permissions`, `StateTransition`)
- Variant or condition being tested (e.g. `Admin`, `GuestUser`, `EmptyCart`)

---

## Instructions

### When given a title list (Mode A)

For each title in the list:

1. Use the title exactly as provided — do not paraphrase or reformat it.
2. Infer the action type and scenario context from the title text.
3. Write clear, concrete steps appropriate to the scenario.
4. Derive `tags` from the title segments (feature area, category, variant).
5. Output **only** the JSON array — no prose, no code fences.

### When given a free-form request (Mode B)

1. Determine the feature area, action types, and variants from the description.
2. Generate a sensible title for each scenario using the convention from `/plan-test-scenarios`.
3. Write steps and derive tags as above.
4. Output **only** the JSON array — no prose, no code fences.
