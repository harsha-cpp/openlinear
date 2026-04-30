import { Prisma, prisma } from '@openlinear/db';
import { logger } from '@openlinear/api/logger';

import type { ExecutionState } from './state';

export type AgentRunFinalStatus = 'succeeded' | 'failed' | 'cancelled';

export async function createAgentRun(params: {
  taskId: string;
  userId: string | null;
  agent: string;
  model: string;
}): Promise<string | null> {
  try {
    const row = await prisma.agentRun.create({
      data: {
        taskId: params.taskId,
        userId: params.userId,
        agent: params.agent,
        model: params.model,
        status: 'running',
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    logger.error(
      { err, taskId: params.taskId },
      '[AgentRun] failed to create row — execution will continue without capture',
    );
    return null;
  }
}

export function recordMessageUsage(
  state: ExecutionState,
  messageId: string,
  snapshot: { cost: number; inputTokens: number; outputTokens: number },
): void {
  state.messageUsage.set(messageId, snapshot);
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const v of state.messageUsage.values()) {
    totalCost += v.cost;
    inputTokens += v.inputTokens;
    outputTokens += v.outputTokens;
  }
  state.cost.total = totalCost;
  state.cost.input = 0;
  state.cost.output = 0;
  state.tokens.input = inputTokens;
  state.tokens.output = outputTokens;
}

export async function finalizeAgentRun(
  state: ExecutionState,
  status: AgentRunFinalStatus,
  extra: { prUrl?: string | null; errorMessage?: string | null } = {},
): Promise<void> {
  if (!state.agentRunId) return;
  try {
    const data: Prisma.AgentRunUpdateInput = {
      endedAt: new Date(),
      status,
    };
    if (state.cost.total > 0) {
      data.costUsd = new Prisma.Decimal(state.cost.total.toFixed(6));
    }
    if (state.tokens.input > 0) data.inputTokens = state.tokens.input;
    if (state.tokens.output > 0) data.outputTokens = state.tokens.output;
    if (extra.prUrl) data.prUrl = extra.prUrl;
    if (extra.errorMessage) data.errorMessage = extra.errorMessage.slice(0, 1000);

    await prisma.agentRun.update({
      where: { id: state.agentRunId },
      data,
    });
  } catch (err) {
    logger.error(
      { err, taskId: state.taskId, agentRunId: state.agentRunId, status },
      '[AgentRun] failed to finalize row',
    );
  }
}
