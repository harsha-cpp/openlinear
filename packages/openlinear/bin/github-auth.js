const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const GITHUB_CLIENT_ID = process.env.OPENLINEAR_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || 'Ov23liv55o39UNsk7m1v';
const GITHUB_CLIENT_SECRET = process.env.OPENLINEAR_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_SCOPES = process.env.OPENLINEAR_GITHUB_SCOPES || 'read:user user:email repo';
const GITHUB_CALLBACK_HOST = process.env.OPENLINEAR_GITHUB_CALLBACK_HOST || 'localhost';
const GITHUB_CALLBACK_PORT = parseInteger(process.env.OPENLINEAR_GITHUB_CALLBACK_PORT, 0);
const GITHUB_CALLBACK_PATH = normalizePath(process.env.OPENLINEAR_GITHUB_CALLBACK_PATH || '/callback');
const GITHUB_BROWSER_TIMEOUT_MS = parseInteger(process.env.OPENLINEAR_GITHUB_BROWSER_TIMEOUT_MS, 180000);
const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'openlinear-cli',
};

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizePath(value) {
  if (!value) {
    return '/callback';
  }

  return value.startsWith('/') ? value : `/${value}`;
}

function getConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, 'openlinear') : path.join(os.homedir(), '.config', 'openlinear');
}

function getAuthFilePath() {
  return path.join(getConfigDir(), 'github-auth.json');
}

function requestJson(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || (body ? 'POST' : 'GET'),
      headers: {
        ...API_HEADERS,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch {
          reject(new Error(`Invalid JSON from ${url}`));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = parsed.error_description || parsed.error || parsed.message || `HTTP ${res.statusCode}`;
          reject(new Error(message));
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function readStoredAuth() {
  const authPath = getAuthFilePath();
  if (!fs.existsSync(authPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(authPath, 'utf8'));
}

function writeStoredAuth(payload) {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getAuthFilePath(), JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
}

function clearStoredAuth() {
  const authPath = getAuthFilePath();
  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createOAuthError(payload, fallbackMessage) {
  const error = new Error(payload.error_description || payload.error || payload.message || fallbackMessage);
  error.code = payload.error || 'oauth_error';
  return error;
}

async function requestAccessToken(body) {
  const response = await requestJson('https://github.com/login/oauth/access_token', {}, body);
  if (response.error) {
    throw createOAuthError(response, 'GitHub token exchange failed.');
  }

  return response;
}

function tryGitHubCliToken() {
  const status = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (status.status !== 0) {
    return null;
  }

  const token = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  if (token.status !== 0) {
    return null;
  }

  const value = token.stdout.trim();
  return value || null;
}

async function promptForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(message, () => resolve()));
  rl.close();
}

async function startDeviceFlow() {
  const body = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: GITHUB_SCOPES,
  }).toString();

  return requestJson('https://github.com/login/device/code', {}, body);
}

async function pollForAccessToken(deviceCode, intervalSeconds) {
  while (true) {
    await wait(intervalSeconds * 1000);

    try {
      const body = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString();

      return await requestAccessToken(body);
    } catch (error) {
      if (error.code === 'authorization_pending') {
        continue;
      }

      if (error.code === 'slow_down') {
        intervalSeconds += 5;
        continue;
      }

      throw error;
    }
  }
}

async function fetchViewer(accessToken) {
  return requestJson('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkceVerifier() {
  return toBase64Url(crypto.randomBytes(48));
}

function createPkceChallenge(verifier) {
  return toBase64Url(crypto.createHash('sha256').update(verifier).digest());
}

function openBrowser(url) {
  const commands = process.platform === 'darwin'
    ? [['open', [url]]]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : [['xdg-open', [url]], ['gio', ['open', url]], ['wslview', [url]]];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { stdio: 'ignore' });
    if (!result.error && result.status === 0) {
      return true;
    }
  }

  return false;
}

function renderCallbackPage(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      section {
        max-width: 560px;
        padding: 24px;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${title}</h1>
        <p>${message}</p>
      </section>
    </main>
  </body>
</html>`;
}

function startLoopbackServer({ hostname, port, callbackPath, expectedState, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let settled = false;
    let timeoutId;
    let resolveResult;
    let rejectResult;

    const resultPromise = new Promise((innerResolve, innerReject) => {
      resolveResult = innerResolve;
      rejectResult = innerReject;
    });

    function closeServer() {
      clearTimeout(timeoutId);
      server.close(() => {});
    }

    function finishWithError(error) {
      if (settled) {
        return;
      }

      settled = true;
      closeServer();
      rejectResult(error);
    }

    function finishWithSuccess(payload) {
      if (settled) {
        return;
      }

      settled = true;
      closeServer();
      resolveResult(payload);
    }

    server.on('request', (req, res) => {
      const fallbackHost = port ? `${hostname}:${port}` : hostname;
      const origin = `http://${req.headers.host || fallbackHost}`;
      const requestUrl = new URL(req.url || '/', origin);

      if (requestUrl.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const error = requestUrl.searchParams.get('error');
      const errorDescription = requestUrl.searchParams.get('error_description');
      const state = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderCallbackPage('GitHub Sign-In Failed', errorDescription || error));
        finishWithError(new Error(errorDescription || error));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderCallbackPage('Invalid Callback State', 'The returned GitHub state did not match this login request.'));
        finishWithError(new Error('GitHub callback state did not match the original login request.'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderCallbackPage('Missing Authorization Code', 'GitHub redirected back without an authorization code.'));
        finishWithError(new Error('GitHub callback was missing the authorization code.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderCallbackPage('GitHub Sign-In Complete', 'You can close this tab and return to the terminal.'));
      finishWithSuccess({ code });
    });

    server.once('error', reject);

    server.listen(port, hostname, () => {
      server.off('error', reject);
      server.on('error', finishWithError);

      const address = server.address();
      if (!address || typeof address === 'string') {
        finishWithError(new Error('Failed to bind the local GitHub callback server.'));
        return;
      }

      timeoutId = setTimeout(() => {
        finishWithError(new Error(`Timed out waiting for the GitHub callback at http://${hostname}:${address.port}${callbackPath}.`));
      }, timeoutMs);

      resolve({
        redirectUri: `http://${hostname}:${address.port}${callbackPath}`,
        waitForCallback: () => resultPromise,
      });
    });
  });
}

function getAuthorizationUrl({ redirectUri, state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeBrowserCodeForToken({ code, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  return requestAccessToken(body);
}

async function completeLogin(tokenResponse, source) {
  const viewer = await fetchViewer(tokenResponse.access_token);

  writeStoredAuth({
    accessToken: tokenResponse.access_token,
    scope: tokenResponse.scope || GITHUB_SCOPES,
    tokenType: tokenResponse.token_type || 'bearer',
    username: viewer.login,
    userId: viewer.id,
    source,
    updatedAt: new Date().toISOString(),
  });

  console.log('');
  console.log(`Authenticated locally as ${viewer.login}.`);
  console.log(`Stored token at ${getAuthFilePath()}`);
}

async function loginWithGitHubCliToken(ghToken) {
  const viewer = await fetchViewer(ghToken);

  writeStoredAuth({
    accessToken: ghToken,
    scope: 'gh-auth-token',
    tokenType: 'bearer',
    username: viewer.login,
    userId: viewer.id,
    source: 'gh',
    updatedAt: new Date().toISOString(),
  });

  console.log(`Imported local GitHub CLI auth for ${viewer.login}.`);
  console.log(`Stored token at ${getAuthFilePath()}`);
}

async function loginWithBrowserFlow() {
  if (!GITHUB_CLIENT_SECRET) {
    throw new Error('Browser login requires OPENLINEAR_GITHUB_CLIENT_SECRET or GITHUB_CLIENT_SECRET.');
  }

  const state = crypto.randomUUID();
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);
  const loopback = await startLoopbackServer({
    hostname: GITHUB_CALLBACK_HOST,
    port: GITHUB_CALLBACK_PORT,
    callbackPath: GITHUB_CALLBACK_PATH,
    expectedState: state,
    timeoutMs: GITHUB_BROWSER_TIMEOUT_MS,
  });
  const authUrl = getAuthorizationUrl({
    redirectUri: loopback.redirectUri,
    state,
    codeChallenge,
  });

  console.log('GitHub local auth');
  console.log('');
  console.log(`Callback: ${loopback.redirectUri}`);
  console.log('GitHub will redirect back to this machine after approval.');
  console.log('');

  if (openBrowser(authUrl)) {
    console.log('Opened GitHub sign-in in your browser.');
  } else {
    console.log('Open this URL in your browser to continue:');
    console.log(authUrl);
  }

  console.log('');
  console.log('Waiting for the GitHub callback...');

  const { code } = await loopback.waitForCallback();
  const tokenResponse = await exchangeBrowserCodeForToken({
    code,
    redirectUri: loopback.redirectUri,
    codeVerifier,
  });

  await completeLogin(tokenResponse, 'browser-flow');
}

async function loginWithDeviceFlow() {
  const device = await startDeviceFlow();

  console.log('GitHub local auth');
  console.log('');
  console.log(`1. Open ${device.verification_uri}`);
  console.log(`2. Enter code: ${device.user_code}`);
  console.log('3. Finish the GitHub approval in your browser');
  console.log('');

  if (device.verification_uri_complete) {
    console.log(`Direct link: ${device.verification_uri_complete}`);
    console.log('');
  }

  await promptForEnter('Press Enter after you approve the device in GitHub... ');

  const tokenResponse = await pollForAccessToken(device.device_code, device.interval || 5);
  await completeLogin(tokenResponse, 'device-flow');
}

function resolveLoginMode(args) {
  const options = new Set(args || []);

  if (options.has('--browser') && options.has('--device')) {
    throw new Error('Choose either --browser or --device.');
  }

  if (options.has('--browser') || options.has('--web')) {
    return 'browser';
  }

  if (options.has('--device')) {
    return 'device';
  }

  return GITHUB_CLIENT_SECRET ? 'browser' : 'device';
}

function hasExplicitLoginMode(args) {
  const options = new Set(args || []);
  return options.has('--browser') || options.has('--web') || options.has('--device');
}

async function login(args = []) {
  if (!hasExplicitLoginMode(args)) {
    const ghToken = tryGitHubCliToken();
    if (ghToken) {
      await loginWithGitHubCliToken(ghToken);
      return;
    }
  }

  const mode = resolveLoginMode(args);
  if (mode === 'browser') {
    await loginWithBrowserFlow();
    return;
  }

  await loginWithDeviceFlow();
}

async function whoami() {
  const stored = readStoredAuth();
  if (!stored?.accessToken) {
    console.log('Not authenticated. Run `openlinear github login`.');
    return;
  }

  const viewer = await fetchViewer(stored.accessToken);
  console.log(`GitHub user: ${viewer.login}`);
  console.log(`Profile: ${viewer.html_url}`);
}

function logout() {
  clearStoredAuth();
  console.log('Removed local GitHub auth token.');
}

function status() {
  const stored = readStoredAuth();
  if (!stored?.accessToken) {
    console.log('GitHub auth: signed out');
    return;
  }

  console.log(`GitHub auth: signed in as ${stored.username}`);
  console.log(`Scopes: ${stored.scope}`);
  if (stored.source) {
    console.log(`Source: ${stored.source}`);
  }
  console.log(`Stored at: ${getAuthFilePath()}`);
}

async function runGitHubAuthCommand(command, args = []) {
  if (command === 'login') {
    await login(args);
    return;
  }

  if (command === 'logout') {
    logout();
    return;
  }

  if (command === 'whoami') {
    await whoami();
    return;
  }

  if (command === 'status' || !command) {
    status();
    return;
  }

  console.log('Usage: openlinear github <login|logout|whoami|status> [--browser|--device]');
  process.exitCode = 1;
}

module.exports = {
  runGitHubAuthCommand,
};
