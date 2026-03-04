# CI/CD Deployment Setup

This document describes the automated deployment setup for OpenLinear.

## Overview

The CI/CD pipeline automatically deploys the application to the DigitalOcean droplet whenever changes are pushed to the `main` or `dev` branches.

## Architecture

```
GitHub Push → GitHub Actions Workflow → SSH to Droplet → Deploy Script
```

## GitHub Secrets

The following secrets must be configured in the GitHub repository:

| Secret | Value | Description |
|--------|-------|-------------|
| `DEPLOY_HOST` | `206.189.139.212` | IP address of the DigitalOcean droplet |
| `DEPLOY_USER` | `root` | SSH username for the droplet |
| `DEPLOY_SSH_KEY` | Private key content | SSH private key for authentication |

### SSH Key Setup

The SSH key used for deployment is located at `~/.ssh/droplet_key` on the local machine and has been added to the droplet's `~/.ssh/authorized_keys`.

**Public key fingerprint:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAzxe83rbgC3EG2VEIPvep7yc+9YdQcpw9+3UhLGcTxN opencode-agent
```

## Workflow

The deployment workflow (`.github/workflows/deploy.yml`) consists of three jobs:

### 1. Checks
- Runs tests and type checking
- Builds the API
- Ensures code quality before deployment

### 2. Deploy
- SSHs into the droplet
- Runs the deploy script at `/opt/openlinear/scripts/deploy.sh`
- Performs diagnostics after deployment
- Verifies health endpoint

### 3. Publish NPM Package
- Builds and publishes the `openlinear` npm package
- Uses trusted publishing with provenance

## Deploy Script Optimizations

The deploy script (`scripts/deploy.sh`) includes several optimizations:

1. **Incremental builds**: Only rebuilds changed components (API, FE, DB)
2. **PNPM cache**: Uses persistent store for faster installs
3. **Zero-downtime reload**: Uses PM2 reload instead of restart
4. **Removed Docker worker build**: Not needed in local-only mode
5. **Timing**: Shows total deploy duration

## Manual Deployment

If needed, manual deployment can be done via SSH:

```bash
ssh -i ~/.ssh/droplet_key root@206.189.139.212
cd /opt/openlinear
./scripts/deploy.sh
```

## Troubleshooting

### Deploy Job Fails
1. Check GitHub secrets are correctly set
2. Verify SSH key is in droplet's `authorized_keys`
3. Check droplet is running: `curl https://rixie.in/health`

### CORS Issues
If desktop app can't connect to API, ensure `tauri://localhost` is in CORS allowed origins:
```typescript
// apps/api/src/app.ts
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
];
```

### OAuth Redirect Issues
Ensure the API has the desktop OAuth logic:
- Detects `?source=desktop` parameter
- Uses `desktop:` state prefix
- Redirects to `openlinear://callback` for desktop apps

## Verification

After deployment, verify:
- API health: `curl https://rixie.in/health`
- GitHub Actions: Check workflow run status
- PM2 status: `ssh root@206.189.139.212 "pm2 status"`

## Recent Changes

- Fixed CORS to allow `tauri://localhost` for desktop app
- Optimized deploy script for faster deployments (~54s)
- Fixed GitHub Actions secrets for automatic deployment
- Added desktop OAuth flow with deep-link callback
