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
  GitHubUser,
} from '../services/github';
import { z } from 'zod';

const router: Router = Router();
const DESKTOP_CALLBACK_URL = 'openlinear://callback';
const WEB_CALLBACK_BRIDGE_URL = process.env.WEB_CALLBACK_BRIDGE_URL || 'http://localhost:3000/auth/callback';
const DESKTOP_STATE_PREFIX = 'desktop:';
const DESKTOP_CONNECT_STATE_PREFIX = 'desktop_connect:';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set in production');
  }
  return secret || 'openlinear-dev-secret-change-in-production';
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

function isDesktopOAuthRequest(req: Request): boolean {
  if (req.query.source === 'desktop') return true;
  if (req.headers['x-openlinear-client'] === 'desktop') return true;
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
      { expiresIn: '7d', algorithm: 'HS256' }
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
      { expiresIn: '7d', algorithm: 'HS256' }
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
  
  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
});

router.get('/github/connect', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    jwt.verify(authHeader.substring(7), getJwtSecret(), { algorithms: ['HS256'] });
    const isDesktop = req.headers['x-openlinear-client'] === 'desktop';
    const state = isDesktop
      ? `${DESKTOP_CONNECT_STATE_PREFIX}${generateState()}`
      : `connect:${generateState()}`;
    const authUrl = getAuthorizationUrl(state);
    res.json({ url: authUrl });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, error, error_description, state } = req.query;
  const stateStr = typeof state === 'string' ? decodeURIComponent(state) : '';
  const isDesktop = stateStr.startsWith(DESKTOP_STATE_PREFIX);
  const isDesktopConnect = stateStr.startsWith(DESKTOP_CONNECT_STATE_PREFIX);

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
      const tempToken = jwt.sign(
        { 
          githubId: githubUser.id, 
          githubLogin: githubUser.login, 
          githubEmail: githubUser.email, 
          githubAvatarUrl: githubUser.avatar_url 
        },
        getJwtSecret(),
        { expiresIn: '15m', algorithm: 'HS256' }
      );

      if (isDesktopConnect) {
        res.redirect(getDesktopCallbackUrl({ github_connect_token: tempToken }));
        return;
      }
      res.redirect(`${getFrontendUrl()}?github_connect_token=${tempToken}`);
    } else {
      const user = await createOrUpdateUser(githubUser);

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        getJwtSecret(),
        { expiresIn: '7d', algorithm: 'HS256' }
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

router.post('/github/connect/confirm', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { github_connect_token } = req.body;
  if (!github_connect_token) {
    res.status(400).json({ error: 'Missing github_connect_token' });
    return;
  }

  try {
    const decodedAuth = jwt.verify(authHeader.substring(7), getJwtSecret(), { algorithms: ['HS256'] }) as { userId: string };
    const decodedGithub = jwt.verify(github_connect_token, getJwtSecret(), { algorithms: ['HS256'] }) as { githubId: number, githubLogin: string, githubEmail: string, githubAvatarUrl: string };

    const githubUser: GitHubUser = {
      id: decodedGithub.githubId,
      login: decodedGithub.githubLogin,
      email: decodedGithub.githubEmail,
      avatar_url: decodedGithub.githubAvatarUrl,
    };

    await connectGitHubToUser(decodedAuth.userId, githubUser);
    const user = await getUserById(decodedAuth.userId);

    const token = jwt.sign(
      { userId: user!.id, username: user!.username },
      getJwtSecret(),
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    res.json({ success: true, token });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
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
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as { userId: string };
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
