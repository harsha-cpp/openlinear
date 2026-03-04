import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@openlinear/db';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getGitHubUser,
  createOrUpdateUser,
  connectGitHubToUser,
  getUserById,
} from '../services/github';
import { z } from 'zod';

const router: Router = Router();
const DESKTOP_CALLBACK_URL = 'openlinear://callback';
const WEB_CALLBACK_BRIDGE_URL = process.env.WEB_CALLBACK_BRIDGE_URL || 'http://localhost:3000/auth/callback';
const DESKTOP_STATE_PREFIX = 'desktop:';
const DESKTOP_CONNECT_STATE_PREFIX = 'desktop_connect:';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'openlinear-dev-secret-change-in-production';
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function generateInviteCode(key: string): string {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${key}-${random}`;
}

async function generateUniqueTeamKey(username: string): Promise<string> {
  const base = username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'USR';
  let key = base;
  let attempt = 0;
  while (await prisma.team.findUnique({ where: { key } })) {
    attempt++;
    key = `${base}${attempt}`;
  }
  return key;
}

function generateState(): string {
  return crypto.randomUUID();
}

function getDesktopCallbackUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${DESKTOP_CALLBACK_URL}?${searchParams.toString()}`;
}

function getWebCallbackBridgeUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${WEB_CALLBACK_BRIDGE_URL}?${searchParams.toString()}`;
}

function isDesktopOAuthRequest(req: Request): boolean {
  // Check query param (for initial auth URL)
  if (req.query.source === 'desktop') return true;
  // Check header (for API requests)
  if (req.headers['x-openlinear-client'] === 'desktop') return true;
  // Check state param (for OAuth callback - GitHub preserves state)
  const state = req.query.state;
  if (typeof state === 'string' && (
    state.startsWith(DESKTOP_STATE_PREFIX) ||
    state.startsWith(DESKTOP_CONNECT_STATE_PREFIX)
  )) {
    return true;
  }
  return false;
}

// --- Email/Password Auth ---

const registerSchema = z.object({
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string().min(3).max(100),
  email: z.string().email().optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { username, password, email } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const teamKey = await generateUniqueTeamKey(username);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: email || null,
        },
      });

      const team = await tx.team.create({
        data: {
          name: `${username}'s Team`,
          key: teamKey,
          inviteCode: generateInviteCode(teamKey),
        },
      });

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: newUser.id,
          role: 'owner',
        },
      });

      return newUser;
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- GitHub OAuth ---

router.get('/github', (req: Request, res: Response) => {
  const isDesktop = isDesktopOAuthRequest(req);
  const state = isDesktop
    ? `${DESKTOP_STATE_PREFIX}${generateState()}`
    : generateState();
  
  // Debug logging
  console.log('[Auth Debug] OAuth init:', {
    isDesktop,
    query: req.query,
    headers: req.headers['x-openlinear-client'],
    statePrefix: state.substring(0, 20),
    userAgent: req.headers['user-agent']?.slice(0, 50)
  });
  
  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
});

// GitHub connect — links GitHub to an existing email/password user
router.get('/github/connect', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as { userId: string };
    const state = req.headers['x-openlinear-client'] === 'desktop'
      ? `${DESKTOP_CONNECT_STATE_PREFIX}${decoded.userId}`
      : `connect:${decoded.userId}`;
    const authUrl = getAuthorizationUrl(state);
    res.json({ url: authUrl });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, error, error_description, state } = req.query;
  const stateStr = typeof state === 'string' ? state : '';
  const isDesktop = stateStr.startsWith(DESKTOP_STATE_PREFIX);
  const isDesktopConnect = stateStr.startsWith(DESKTOP_CONNECT_STATE_PREFIX);
  
  // Debug logging
  console.log('[Auth Debug] OAuth callback received:', {
    state: stateStr,
    isDesktop,
    isDesktopConnect,
    hasCode: !!code,
    hasError: !!error
  });

  if (error) {
    console.error('[Auth] GitHub OAuth error:', error, error_description);
    const errorMessage = String(error_description || error);
    if (isDesktop || isDesktopConnect) {
      res.redirect(getDesktopCallbackUrl({ error: errorMessage }));
      return;
    }
    res.redirect(`${getFrontendUrl()}?error=${encodeURIComponent(errorMessage)}`);
    return;
  }

  if (!code || typeof code !== 'string') {
    if (isDesktop || isDesktopConnect) {
      res.redirect(getDesktopCallbackUrl({ error: 'missing_code' }));
      return;
    }
    res.redirect(`${getFrontendUrl()}?error=missing_code`);
    return;
  }

  const isConnect = isDesktopConnect || stateStr.startsWith('connect:');

  try {
    const accessToken = await exchangeCodeForToken(code);
    const githubUser = await getGitHubUser(accessToken);

    if (isConnect) {
      // Connect flow — link GitHub to existing user
      const userId = isDesktopConnect
        ? stateStr.replace(DESKTOP_CONNECT_STATE_PREFIX, '')
        : stateStr.replace('connect:', '');
      await connectGitHubToUser(userId, githubUser);
      const user = await getUserById(userId);

      const token = jwt.sign(
        { userId: user!.id, username: user!.username },
        getJwtSecret(),
        { expiresIn: '7d' }
      );

      if (isDesktopConnect) {
        res.redirect(getDesktopCallbackUrl({ token, connected: 'true' }));
        return;
      }
      res.redirect(`${getFrontendUrl()}?token=${token}&connected=true`);
    } else {
      // Normal login/signup flow
      const user = await createOrUpdateUser(githubUser);

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        getJwtSecret(),
        { expiresIn: '7d' }
      );

      if (isDesktop) {
        res.redirect(getDesktopCallbackUrl({ token }));
        return;
      }
      res.redirect(`${getFrontendUrl()}?token=${token}`);
    }
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err);
    const errorMsg = err instanceof Error ? err.message : 'auth_failed';
    if (isDesktop || isDesktopConnect) {
      res.redirect(getDesktopCallbackUrl({ error: errorMsg }));
      return;
    }
    res.redirect(`${getFrontendUrl()}?error=${encodeURIComponent(errorMsg)}`);
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    const user = await getUserById(decoded.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const { accessToken: _, passwordHash: __, ...safeUser } = user;
    res.json(safeUser);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
