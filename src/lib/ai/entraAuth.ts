import { PublicClientApplication } from '@azure/msal-browser';

import type { LlmConfig } from './config';

const FOUNDRY_SCOPE = 'https://ai.azure.com/.default';

type EntraConfig = Pick<LlmConfig, 'clientId' | 'tenantId'>;

type MsalState = {
  key: string;
  instance: PublicClientApplication;
  init: Promise<void>;
};

let msalState: MsalState | null = null;

function buildStateKey(config: EntraConfig): string {
  return `${config.tenantId.trim()}|${config.clientId.trim()}`;
}

function getMsalInstance(config: EntraConfig): MsalState {
  if (typeof window === 'undefined') {
    throw new Error('Microsoft Entra ID authentication is only available in the browser.');
  }

  if (!config.tenantId.trim() || !config.clientId.trim()) {
    throw new Error('Tenant ID and client ID are required for Microsoft Entra ID authentication.');
  }

  const key = buildStateKey(config);

  if (!msalState || msalState.key !== key) {
    // Normalize 127.0.0.1 → localhost: Entra ID rejects 127.0.0.1 as a redirect URI
    // but accepts localhost, and browsers treat them as the same origin.
    const redirectUri = window.location.origin.replace('127.0.0.1', 'localhost');

    const instance = new PublicClientApplication({
      auth: {
        clientId: config.clientId.trim(),
        authority: `https://login.microsoftonline.com/${config.tenantId.trim()}`,
        redirectUri,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    });

    msalState = {
      key,
      init: instance.initialize(),
      instance,
    };
  }

  return msalState;
}

export async function getFoundryAccessToken(config: EntraConfig): Promise<string> {
  const { instance, init } = getMsalInstance(config);
  await init;

  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;

  if (account) {
    try {
      const silent = await instance.acquireTokenSilent({ account, scopes: [FOUNDRY_SCOPE] });
      if (silent.account) {
        instance.setActiveAccount(silent.account);
      }
      return silent.accessToken;
    } catch {
      // Fall through to an interactive sign-in if the cached token is missing
      // or needs user interaction.
    }
  }

  const interactive = await instance.loginPopup({ scopes: [FOUNDRY_SCOPE] });

  if (interactive.account) {
    instance.setActiveAccount(interactive.account);
  }

  return interactive.accessToken;
}