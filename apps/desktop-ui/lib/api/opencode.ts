import { API_URL, getAuthHeader } from './client';

export interface ProviderInfo {
  id: string;
  name: string;
  authenticated: boolean;
}

export interface SetupStatus {
  providers: ProviderInfo[];
  ready: boolean;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${API_URL}/api/opencode/setup-status`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to get setup status');
  return res.json();
}

export async function setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  
  let key = 'custom_api_key';
  if (providerId === 'openai') key = 'openai_api_key';
  else if (providerId === 'anthropic') key = 'anthropic_api_key';
  
  const res = await invoke<{success: boolean, error?: string}>('store_secret', { key, value: apiKey });
  if (!res.success) {
    throw new Error(res.error || 'Failed to save API key locally');
  }
}

// --- Configured providers localStorage cache ---
// The container's provider.list().data.connected is slow to update after auth.set().
// We persist confirmed saves here so the execute flow doesn't show a false "not configured" state.
const CONFIGURED_PROVIDERS_KEY = 'openlinear-configured-providers';

export function addConfiguredProvider(providerId: string): void {
  try {
    const existing = JSON.parse(localStorage.getItem(CONFIGURED_PROVIDERS_KEY) || '[]') as string[];
    if (!existing.includes(providerId)) {
      existing.push(providerId);
      localStorage.setItem(CONFIGURED_PROVIDERS_KEY, JSON.stringify(existing));
    }
  } catch {
    localStorage.setItem(CONFIGURED_PROVIDERS_KEY, JSON.stringify([providerId]));
  }
}

export function getConfiguredProviderIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CONFIGURED_PROVIDERS_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

export function hasConfiguredProviders(): boolean {
  return getConfiguredProviderIds().length > 0;
}

