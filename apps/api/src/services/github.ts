import { spawnSync } from 'node:child_process';
import { prisma } from '@openlinear/db';

const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liv55o39UNsk7m1v';
const DEFAULT_GITHUB_DESKTOP_REDIRECT_URI = 'http://localhost:1455/callback';
const DEFAULT_GITHUB_SCOPES = 'read:user user:email repo';

// Read env vars lazily to avoid ESM import hoisting issues with dotenv
function getGitHubConfig() {
  return {
    clientId: process.env.OPENLINEAR_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID,
    clientSecret: process.env.OPENLINEAR_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/auth/github/callback',
    desktopRedirectUri: process.env.GITHUB_DESKTOP_REDIRECT_URI || DEFAULT_GITHUB_DESKTOP_REDIRECT_URI,
    scopes: process.env.OPENLINEAR_GITHUB_SCOPES || DEFAULT_GITHUB_SCOPES,
  };
}

export function getGitHubOAuthConfigError(requireSecret = true): string | null {
  const { clientId, clientSecret } = getGitHubConfig();

  if (!clientId) {
    return 'GitHub OAuth is not configured. Set OPENLINEAR_GITHUB_CLIENT_ID or GITHUB_CLIENT_ID.';
  }

  if (requireSecret && !clientSecret) {
    return 'GitHub OAuth is not configured. Set OPENLINEAR_GITHUB_CLIENT_SECRET or GITHUB_CLIENT_SECRET.';
  }

  return null;
}

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  description: string | null;
}

export interface DesktopGitHubAuthSource {
  accessToken: string;
  source: 'gh' | 'env';
}

export function tryGitHubCliToken(): string | null {
  const status = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (status.status !== 0) {
    return null;
  }

  const token = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (token.status !== 0) {
    return null;
  }

  const value = token.stdout.trim();
  return value || null;
}

export function getDesktopGitHubAuthSource(): DesktopGitHubAuthSource | null {
  const ghToken = tryGitHubCliToken();
  if (ghToken) {
    return {
      accessToken: ghToken,
      source: 'gh',
    };
  }

  const envToken = process.env.OPENLINEAR_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken?.trim()) {
    return {
      accessToken: envToken.trim(),
      source: 'env',
    };
  }

  return null;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/,
    /^git@github\.com:([^\/]+)\/([^\/]+?)(\.git)?$/,
    /^([^\/]+)\/([^\/]+)$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
  }
  return null;
}

export async function fetchPublicRepo(owner: string, repo: string): Promise<GitHubRepo> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'OpenLinear',
  };

  // Use GitHub token if available for higher rate limits (5000/hr vs 60/hr)
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository ${owner}/${repo} not found or is private`);
    }
    if (response.status === 403) {
      const resetHeader = response.headers.get('x-ratelimit-reset');
      const resetTime = resetHeader ? new Date(parseInt(resetHeader) * 1000).toLocaleTimeString() : 'soon';
      throw new Error(`GitHub rate limit exceeded. Resets at ${resetTime}. Add GITHUB_TOKEN to .env for higher limits.`);
    }
    throw new Error(`Failed to fetch repository: ${response.statusText}`);
  }

  return (await response.json()) as GitHubRepo;
}

export async function addRepositoryByUrl(url: string): Promise<{
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isActive: boolean;
}> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error('Invalid GitHub URL format');
  }

  const repo = await fetchPublicRepo(parsed.owner, parsed.repo);
  
  if (repo.private) {
    throw new Error('Private repositories require authentication');
  }

  const existing = await prisma.repository.findFirst({
    where: { githubRepoId: repo.id, userId: null },
  });

  if (existing) {
    return prisma.repository.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
  }

  await prisma.repository.updateMany({
    where: { userId: null },
    data: { isActive: false },
  });

  return prisma.repository.create({
    data: {
      githubRepoId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      isActive: true,
    },
  });
}

export function getAuthorizationUrl(state: string, useDesktopRedirect = false): string {
  const { clientId, redirectUri, desktopRedirectUri } = getGitHubConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: useDesktopRedirect ? desktopRedirectUri : redirectUri,
    scope: 'read:user user:email repo',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
  token_type?: string;
}

export interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface GitHubDevicePollPendingResponse {
  status: 'pending';
  retryAfterSeconds?: number;
}

export interface GitHubDevicePollSuccessResponse {
  status: 'complete';
  accessToken: string;
  scope?: string;
  tokenType?: string;
}

export async function startGitHubDeviceFlow(): Promise<GitHubDeviceCodeResponse> {
  const { clientId, scopes } = getGitHubConfig();

  if (!clientId) {
    throw new Error('GitHub OAuth is not configured. Set OPENLINEAR_GITHUB_CLIENT_ID or GITHUB_CLIENT_ID.');
  }

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: scopes,
    }),
  });

  const data = (await response.json()) as TokenResponse & GitHubDeviceCodeResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to start GitHub device flow.');
  }

  return data;
}

export async function pollGitHubDeviceFlow(deviceCode: string): Promise<GitHubDevicePollPendingResponse | GitHubDevicePollSuccessResponse> {
  const { clientId } = getGitHubConfig();

  if (!clientId) {
    throw new Error('GitHub OAuth is not configured. Set OPENLINEAR_GITHUB_CLIENT_ID or GITHUB_CLIENT_ID.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = (await response.json()) as TokenResponse;

  if (data.error === 'authorization_pending') {
    return { status: 'pending' };
  }

  if (data.error === 'slow_down') {
    return { status: 'pending', retryAfterSeconds: 10 };
  }

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'GitHub device flow failed.');
  }

  if (!data.access_token) {
    throw new Error('GitHub device flow did not return an access token.');
  }

  return {
    status: 'complete',
    accessToken: data.access_token,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

export async function exchangeCodeForToken(code: string, useDesktopRedirect = false): Promise<string> {
  const { clientId, clientSecret, redirectUri, desktopRedirectUri } = getGitHubConfig();
  if (!clientSecret) {
    throw new Error('GitHub OAuth is not configured. Set OPENLINEAR_GITHUB_CLIENT_SECRET or GITHUB_CLIENT_SECRET.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: useDesktopRedirect ? desktopRedirectUri : redirectUri,
    }),
  });

  const data = (await response.json()) as TokenResponse;
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data.access_token!;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user');
  }

  return (await response.json()) as GitHubUser;
}

export async function getGitHubRepos(accessToken: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?page=${page}&per_page=${perPage}&sort=updated&affiliation=owner,collaborator`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch repositories');
    }

    const data = (await response.json()) as GitHubRepo[];
    repos.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  return repos;
}

export async function createOrUpdateUser(
  githubUser: GitHubUser
) {
  return prisma.user.upsert({
    where: { githubId: githubUser.id },
    update: {
      username: githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
    },
    create: {
      githubId: githubUser.id,
      username: githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
    },
  });
}

export async function connectGitHubToUser(
  userId: string,
  githubUser: GitHubUser
) {
  const existingGitHubUser = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  if (existingGitHubUser && existingGitHubUser.id !== userId) {
    throw new Error('This GitHub account is already linked to another user');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      githubId: githubUser.id,
      avatarUrl: githubUser.avatar_url,
    },
  });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { repositories: true },
  });
}

export async function getUserRepositories(userId: string) {
  return prisma.repository.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function addRepository(
  userId: string,
  repo: GitHubRepo,
  isActive = false
) {
  return prisma.repository.upsert({
    where: {
      userId_githubRepoId: { userId, githubRepoId: repo.id },
    },
    update: {
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      isActive,
    },
    create: {
      githubRepoId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      userId,
      isActive,
    },
  });
}

export async function setActiveRepository(userId: string, projectId: string) {
  await prisma.repository.updateMany({
    where: { userId },
    data: { isActive: false },
  });

  return prisma.repository.update({
    where: { id: projectId },
    data: { isActive: true },
  });
}

export async function getActiveRepository(userId: string) {
  return prisma.repository.findFirst({
    where: { userId, isActive: true },
  });
}
