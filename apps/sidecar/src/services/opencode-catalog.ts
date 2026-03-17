import type { OpencodeClient } from '@opencode-ai/sdk';
import { prisma } from '@openlinear/db';
import { getClientForUser } from './opencode';

type ProviderAuthMethod = {
  type?: 'oauth' | 'api';
  label?: string;
};

type RawModel = {
  id: string;
  provider?: string;
  name?: string;
  status?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
  };
};

type RawProvider = {
  id: string;
  name?: string;
  source?: 'env' | 'config' | 'custom' | 'api';
  models?: Record<string, RawModel>;
};

export type OpenCodeCatalogModel = {
  id: string;
  provider: string;
  name: string;
  status: string;
  reasoning: boolean;
  toolCall: boolean;
  limit?: {
    context: number;
    output: number;
  };
  cost: {
    input: number;
    output: number;
  };
  source: 'sdk' | 'fallback';
  isDefault: boolean;
};

export type OpenCodeCatalogProvider = {
  id: string;
  name: string;
  connected: boolean;
  authenticated: boolean;
  source: 'env' | 'config' | 'custom' | 'api' | 'fallback';
  authMethods: Array<{
    type: 'oauth' | 'api';
    label?: string;
  }>;
  defaultModel: string | null;
  models: OpenCodeCatalogModel[];
};

export type OpenCodeSelectionSource = 'opencode' | 'legacy-openlinear' | 'unset';

export type OpenCodeModelSelection = {
  model: string | null;
  configuredModel: string | null;
  legacyModel: string | null;
  small_model: string | null;
  source: OpenCodeSelectionSource;
};

export type OpenCodeCatalog = {
  providers: OpenCodeCatalogProvider[];
  selection: OpenCodeModelSelection;
};

const FALLBACK_OPENCODE_MODELS: OpenCodeCatalogModel[] = [
  {
    id: 'minimix',
    provider: 'opencode',
    name: 'Minimix (Free)',
    status: 'available',
    reasoning: false,
    toolCall: true,
    limit: { context: 128000, output: 4096 },
    cost: { input: 0, output: 0 },
    source: 'fallback',
    isDefault: false,
  },
  {
    id: 'glm5',
    provider: 'opencode',
    name: 'GLM5 (Free)',
    status: 'available',
    reasoning: false,
    toolCall: true,
    limit: { context: 128000, output: 4096 },
    cost: { input: 0, output: 0 },
    source: 'fallback',
    isDefault: false,
  },
  {
    id: 'kimik2.5',
    provider: 'opencode',
    name: 'KimiK2.5 (Free)',
    status: 'available',
    reasoning: true,
    toolCall: true,
    limit: { context: 128000, output: 4096 },
    cost: { input: 0, output: 0 },
    source: 'fallback',
    isDefault: false,
  },
];

function normalizeModel(
  providerId: string,
  model: RawModel,
  selection: OpenCodeModelSelection,
  source: 'sdk' | 'fallback',
): OpenCodeCatalogModel {
  const modelRef = `${providerId}/${model.id}`;

  return {
    id: model.id,
    provider: model.provider || providerId,
    name: model.name || model.id,
    status: model.status || 'unknown',
    reasoning: model.reasoning ?? false,
    toolCall: model.tool_call ?? false,
    ...(model.limit?.context || model.limit?.output
      ? {
          limit: {
            context: model.limit?.context ?? 0,
            output: model.limit?.output ?? 0,
          },
        }
      : {}),
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
    },
    source,
    isDefault: selection.model === modelRef,
  };
}

function getFallbackOpenCodeModels(selection: OpenCodeModelSelection): OpenCodeCatalogModel[] {
  return FALLBACK_OPENCODE_MODELS.map((model) => ({
    ...model,
    isDefault: selection.model === `${model.provider}/${model.id}`,
  }));
}

async function getLegacyExecutionModel(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
    select: { executionModel: true },
  });

  return settings?.executionModel ?? null;
}

export async function resolveOpenCodeModelSelection(
  userId: string,
  client?: OpencodeClient,
): Promise<OpenCodeModelSelection> {
  const activeClient = client ?? await getClientForUser(userId);
  const [configResult, legacyModel] = await Promise.all([
    activeClient.config.get().catch(() => null),
    getLegacyExecutionModel().catch(() => null),
  ]);

  const configuredModel = configResult?.data?.model ?? null;
  const smallModel = configResult?.data?.small_model ?? null;
  const model = configuredModel ?? legacyModel ?? null;
  const source: OpenCodeSelectionSource = configuredModel
    ? 'opencode'
    : legacyModel
      ? 'legacy-openlinear'
      : 'unset';

  return {
    model,
    configuredModel,
    legacyModel,
    small_model: smallModel,
    source,
  };
}

export function parseModelReference(
  model: string | null | undefined,
): { providerID: string; modelID: string } | null {
  if (!model || !model.includes('/')) {
    return null;
  }

  const slashIndex = model.indexOf('/');
  const providerID = model.slice(0, slashIndex);
  const modelID = model.slice(slashIndex + 1);

  if (!providerID || !modelID) {
    return null;
  }

  return { providerID, modelID };
}

export async function buildOpenCodeCatalog(
  userId: string,
  client?: OpencodeClient,
): Promise<OpenCodeCatalog> {
  const activeClient = client ?? await getClientForUser(userId);
  const [selection, providerListResult, providerAuthResult, configProvidersResult] =
    await Promise.all([
      resolveOpenCodeModelSelection(userId, activeClient),
      activeClient.provider.list(),
      activeClient.provider.auth().catch(() => null),
      activeClient.config.providers().catch(() => null),
    ]);

  const providersById = new Map<string, RawProvider>();

  for (const provider of (providerListResult.data?.all ?? []) as RawProvider[]) {
    providersById.set(provider.id, provider);
  }

  for (const provider of (configProvidersResult?.data?.providers ?? []) as RawProvider[]) {
    if (!providersById.has(provider.id)) {
      providersById.set(provider.id, provider);
    }
  }

  const hasOpenCodeProvider = providersById.has('opencode');
  if (!hasOpenCodeProvider) {
    providersById.set('opencode', {
      id: 'opencode',
      name: 'OpenCode',
      models: {},
    });
  }

  const connectedSet = new Set<string>(providerListResult.data?.connected ?? []);
  const authMethodsByProvider = (providerAuthResult?.data ?? {}) as Record<string, ProviderAuthMethod[]>;
  const defaultModelsByProvider = (configProvidersResult?.data?.default ?? {}) as Record<string, string>;

  const providers = Array.from(providersById.values())
    .map((provider) => {
      const rawModels = Object.values(provider.models ?? {}).map((model) =>
        normalizeModel(provider.id, model, selection, 'sdk'),
      );

      const modelsById = new Map<string, OpenCodeCatalogModel>(
        rawModels.map((model) => [model.id, model]),
      );

      if (provider.id === 'opencode') {
        for (const model of getFallbackOpenCodeModels(selection)) {
          if (!modelsById.has(model.id)) {
            modelsById.set(model.id, model);
          }
        }
      }

      const defaultModelId = defaultModelsByProvider[provider.id] ?? null;
      const configuredModelForProvider = selection.configuredModel?.startsWith(`${provider.id}/`)
        ? selection.configuredModel
        : null;

      return {
        id: provider.id,
        name: provider.name || provider.id,
        connected: connectedSet.has(provider.id) || provider.id === 'opencode',
        authenticated: connectedSet.has(provider.id) || provider.id === 'opencode',
        source: hasOpenCodeProvider || provider.id !== 'opencode'
          ? (provider.source ?? 'config')
          : 'fallback',
        authMethods: (authMethodsByProvider[provider.id] ?? [])
          .filter((method): method is ProviderAuthMethod & { type: 'oauth' | 'api' } =>
            method.type === 'oauth' || method.type === 'api',
          )
          .map((method) => ({
            type: method.type,
            ...(method.label ? { label: method.label } : {}),
          })),
        defaultModel: defaultModelId
          ? `${provider.id}/${defaultModelId}`
          : configuredModelForProvider,
        models: Array.from(modelsById.values()).sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      } satisfies OpenCodeCatalogProvider;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    providers,
    selection,
  };
}

export async function setOpenCodeModelSelection(
  userId: string,
  model: string,
): Promise<OpenCodeModelSelection> {
  const client = await getClientForUser(userId);
  await client.config.update({
    body: { model },
  });

  await prisma.settings.upsert({
    where: { id: 'default' },
    update: { executionModel: null },
    create: { id: 'default', executionModel: null },
  });

  return resolveOpenCodeModelSelection(userId, client);
}
