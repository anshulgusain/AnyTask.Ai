import type OpenAI from 'openai';
import { z } from 'zod';
import { formatObservation, PageObservation } from './pageObserver.js';
import { temperatureFor, type TestGoal } from './agentLoop.js';

const GoalPlanSchema = z.object({
  appSummary: z.string(),
  goals: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).catch('MEDIUM'),
      })
    )
    .min(1),
});

export interface GoalPlan {
  appSummary: string;
  goals: TestGoal[];
}

/**
 * Decide WHAT to test from the real home page plus the developer's description.
 * HOW to do each goal is figured out live by the agent loop, so goals stay high level.
 */
export async function planGoals(
  client: OpenAI,
  model: string,
  home: PageObservation,
  instructions: string | undefined,
  maxGoals: number
): Promise<GoalPlan> {
  const prompt = `
You are planning an end-to-end QA session for a web application.

Developer's description / instructions:
${instructions?.trim() || '(none — infer the app\'s purpose from the page)'}

Home page as seen in the browser:
${formatObservation(home)}

Produce up to ${maxGoals} test goals, ordered so that each one can build on the previous
(e.g. "Sign up" → "Log out and log back in" → "Create a product" → "Edit it" → "Search for it").
Rules:
- Every task the developer explicitly asked for MUST be covered, first.
- Then add the most important user-facing features visible on the page (auth, core CRUD, search, cart/checkout, profile, navigation).
- Each goal is one user-level outcome with a clear success check, NOT click-by-click steps.
- Never include real payments or deleting the account unless the developer asked.
- Write descriptions that say what "success" looks like.

Return strict JSON: {"appSummary": "one sentence about what the app does", "goals": [{"title": "...", "description": "...", "priority": "HIGH|MEDIUM|LOW"}]}
`.trim();

  const response = await client.chat.completions.create({
    model,
    ...temperatureFor(model, 0.2),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a senior QA lead. Respond only with JSON.' },
      { role: 'user', content: prompt },
    ],
  });

  const parsed = GoalPlanSchema.parse(JSON.parse(response.choices[0]?.message?.content || '{}'));
  return {
    appSummary: parsed.appSummary,
    goals: parsed.goals.slice(0, maxGoals).map((g, i) => ({
      id: `goal_${i + 1}`,
      title: g.title,
      description: g.description,
      priority: g.priority,
    })),
  };
}
