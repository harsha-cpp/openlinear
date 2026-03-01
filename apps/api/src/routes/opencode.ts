import { Router, Response } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import {
  getOpenCodeStatus,
  getClientForUser,
} from '../services/opencode';

const router: Router = Router();

type ProviderAuthEntry = { type?: string };

function resolveOauthMethodIndex(
  methods: ProviderAuthEntry[] | undefined,
  requestedMethod: unknown
): number {
  if (!methods || methods.length === 0) {
    return typeof requestedMethod === 'number' ? requestedMethod : 0;
  }

  if (
    typeof requestedMethod === 'number' &&
    requestedMethod >= 0 &&
    requestedMethod < methods.length &&
    methods[requestedMethod]?.type === 'oauth'
  ) {
    return requestedMethod;
  }

  const oauthIndex = methods.findIndex((entry) => entry?.type === 'oauth');
  if (oauthIndex >= 0) return oauthIndex;

  return typeof requestedMethod === 'number' ? requestedMethod : 0;
}

router.get('/status', (_req, res: Response) => {
  res.json(getOpenCodeStatus());
});

router.get('/setup-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      container: null,
      providers: [],
      ready: false,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get setup status' });
  }
});

router.get('/container', requireAuth, (req: AuthRequest, res: Response) => {
  res.status(403).json({ 
    error: 'Server execution is disabled. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  });
});

router.post('/container', requireAuth, async (req: AuthRequest, res: Response) => {
  res.status(403).json({ 
    error: 'Server execution is disabled. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  });
});

router.delete('/container', requireAuth, async (req: AuthRequest, res: Response) => {
  res.status(403).json({ 
    error: 'Server execution is disabled. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  });
});

router.get('/providers', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = await getClientForUser(req.userId!);
    const providers = await client.provider.list();
    res.json(providers.data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list providers' });
  }
});

router.get('/providers/auth', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = await getClientForUser(req.userId!);
    const auth = await client.provider.auth();
    res.json(auth.data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get provider auth methods' });
  }
});

router.post('/auth', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { providerId, apiKey } = req.body;
    if (!providerId || !apiKey) {
      res.status(400).json({ error: 'providerId and apiKey are required' });
      return;
    }

    res.status(403).json({ error: 'Provider key ingestion via cloud is disabled. Keys must be stored locally.' });
    return;
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set auth' });
  }
});

router.post('/auth/oauth/authorize', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { providerId, method } = req.body;
    if (!providerId) {
      res.status(400).json({ error: 'providerId is required' });
      return;
    }

    const client = await getClientForUser(req.userId!);
    const auth = await client.provider.auth();
    const methods = auth.data?.[providerId] as ProviderAuthEntry[] | undefined;
    const resolvedMethod = resolveOauthMethodIndex(methods, method);

    const result = await client.provider.oauth.authorize({
      path: { id: providerId },
      body: { method: resolvedMethod },
    });

    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start OAuth' });
  }
});

router.post('/auth/oauth/callback', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { providerId, method, code } = req.body;
    if (!providerId || !code) {
      res.status(400).json({ error: 'providerId and code are required' });
      return;
    }

    const client = await getClientForUser(req.userId!);
    const auth = await client.provider.auth();
    const methods = auth.data?.[providerId] as ProviderAuthEntry[] | undefined;
    const resolvedMethod = resolveOauthMethodIndex(methods, method);

    const result = await client.provider.oauth.callback({
      path: { id: providerId },
      body: { method: resolvedMethod, code },
    });

    res.json(result.data);
  } catch (err: any) {
    const message = err.response?.data?.error || err.message || 'Failed to complete OAuth';
    res.status(500).json({ error: message });
  }
});

router.get('/models', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = await getClientForUser(req.userId!);
    const providerList = await client.provider.list();

    if (!providerList.data?.all) {
      res.json({ providers: [] });
      return;
    }

    const connectedSet = new Set(providerList.data.connected ?? []);
    connectedSet.add('opencode');

    let allProviders: any[] = providerList.data.all;
    if (!allProviders.some((p: any) => p.id === 'opencode')) {
      allProviders.push({
        id: 'opencode',
        name: 'OpenCode',
        models: {},
      } as any);
    }

    const providers = allProviders
      .filter((provider: any) => connectedSet.has(provider.id))
      .map((provider: any) => {
        let modelsList = Object.values(provider.models || {}).map((model: any) => ({
          id: model.id,
          provider: model.provider,
          name: model.name || model.id,
          status: model.status,
          reasoning: model.reasoning ?? false,
          toolCall: model.tool_call ?? false,
          limit: model.limit,
          cost: {
            input: model.cost?.input ?? 0,
            output: model.cost?.output ?? 0,
          },
        }));

        if (provider.id === 'opencode') {
          const freeModels = [
            { id: 'minimix', provider: 'opencode', name: 'Minimix (Free)', status: 'available', reasoning: false, toolCall: true, limit: { context: 128000, output: 4096 }, cost: { input: 0, output: 0 } },
            { id: 'glm5', provider: 'opencode', name: 'GLM5 (Free)', status: 'available', reasoning: false, toolCall: true, limit: { context: 128000, output: 4096 }, cost: { input: 0, output: 0 } },
            { id: 'kimik2.5', provider: 'opencode', name: 'KimiK2.5 (Free)', status: 'available', reasoning: true, toolCall: true, limit: { context: 128000, output: 4096 }, cost: { input: 0, output: 0 } }
          ];
          
          freeModels.forEach(fm => {
            if (!modelsList.some(m => m.id === fm.id)) {
              modelsList.push(fm);
            }
          });
        }

        return {
          id: provider.id,
          name: provider.name || provider.id,
          models: modelsList,
        };
      });

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list models' });
  }
});

router.get('/config', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = await getClientForUser(req.userId!);
    const config = await client.config.get();

    res.json({
      model: config.data?.model ?? null,
      small_model: config.data?.small_model ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get config' });
  }
});

router.post('/config/model', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'model is required (format: provider/model)' });
      return;
    }

    const client = await getClientForUser(req.userId!);
    await client.config.update({
      body: { model },
    });

    res.json({ success: true, model });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set model' });
  }
});

export default router;
