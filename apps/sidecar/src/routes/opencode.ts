import { Router, Response } from 'express';
import { AuthRequest, requireAuth } from '@openlinear/api/middleware';
import {
  getOpenCodeStatus,
  getClientForUser,
} from '../services/opencode';
import {
  buildOpenCodeCatalog,
  resolveOpenCodeModelSelection,
  setOpenCodeModelSelection,
} from '../services/opencode-catalog';

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
    try {
      const catalog = await buildOpenCodeCatalog(req.userId!);
      const providers = catalog.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        authenticated: provider.authenticated,
      }));

      res.json({
        providers,
        ready: providers.some((provider) => provider.authenticated),
      });
      return;
    } catch (catalogError) {
      const message =
        catalogError instanceof Error ? catalogError.message : 'OpenCode is unavailable';

      res.json({
        providers: [],
        ready: false,
        error: message,
      });
      return;
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get setup status' });
  }
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

    const client = await getClientForUser(req.userId!);
    const auth = await client.provider.auth().catch(() => null);
    const methods = auth?.data?.[providerId] as ProviderAuthEntry[] | undefined;

    if (methods && methods.length > 0 && !methods.some((method) => method?.type === 'api')) {
      res.status(400).json({ error: `${providerId} does not support API key authentication` });
      return;
    }

    await client.auth.set({
      path: { id: providerId },
      body: { type: 'api', key: apiKey },
    });

    res.json({ success: true, providerId });
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
    const catalog = await buildOpenCodeCatalog(req.userId!);
    res.json({
      providers: catalog.providers,
      selection: catalog.selection,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list models' });
  }
});

router.get('/catalog', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const catalog = await buildOpenCodeCatalog(req.userId!);
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load OpenCode catalog' });
  }
});

router.get('/config', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const selection = await resolveOpenCodeModelSelection(req.userId!);
    res.json(selection);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get config' });
  }
});

router.post('/config/model', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string' || !model.includes('/')) {
      res.status(400).json({ error: 'model is required (format: provider/model)' });
      return;
    }

    const selection = await setOpenCodeModelSelection(req.userId!, model);
    res.json({ success: true, ...selection });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to set model' });
  }
});

export default router;
