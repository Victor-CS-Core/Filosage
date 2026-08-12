"use client";

import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";

export interface FilosageUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reauthenticationToken?: string;
}

const authority = process.env.NEXT_PUBLIC_ENTRA_AUTHORITY?.trim();
const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID?.trim();
const apiScope = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE?.trim();
const configuredRedirectUri = process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI?.trim();
const googleIssuerHint = { domain_hint: "google" };

export const isEntraConfigured = Boolean(authority && clientId && apiScope);

let application: PublicClientApplication | null = null;
let initialization: Promise<PublicClientApplication> | null = null;

function redirectUri() {
  return configuredRedirectUri || (typeof window === "undefined" ? undefined : window.location.origin);
}

export async function entraApplication() {
  if (!isEntraConfigured || !authority || !clientId) return null;
  if (application) return application;
  initialization ??= (async () => {
    const instance = new PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri: redirectUri(),
        postLogoutRedirectUri: redirectUri(),
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await instance.initialize();
    const redirectResult = await instance.handleRedirectPromise();
    const account = redirectResult?.account ?? instance.getAllAccounts()[0] ?? null;
    if (account) instance.setActiveAccount(account);
    application = instance;
    return instance;
  })();
  return initialization;
}

async function accessToken(account: AccountInfo, forceRefresh = false) {
  const instance = await entraApplication();
  if (!instance || !apiScope) throw new Error("Microsoft Entra authentication is not configured.");
  const result = await instance.acquireTokenSilent({
    account,
    scopes: [apiScope],
    forceRefresh,
  });
  return result.accessToken;
}

export function filosageUser(account: AccountInfo, reauthenticationToken?: string): FilosageUser {
  return {
    uid: account.localAccountId || account.homeAccountId,
    displayName: account.name ?? null,
    email: account.username || null,
    photoURL: null,
    getIdToken: (forceRefresh = false) => accessToken(account, forceRefresh),
    ...(reauthenticationToken ? { reauthenticationToken } : {}),
  };
}

export async function currentEntraUser() {
  const instance = await entraApplication();
  const account = instance?.getActiveAccount() ?? instance?.getAllAccounts()[0] ?? null;
  if (account) instance?.setActiveAccount(account);
  return account ? filosageUser(account) : null;
}

export async function currentEntraAccessToken() {
  const instance = await entraApplication();
  const account = instance?.getActiveAccount() ?? instance?.getAllAccounts()[0] ?? null;
  if (!account) return null;
  return accessToken(account).catch(() => null);
}

export async function signInWithEntraPopup() {
  const instance = await entraApplication();
  if (!instance || !apiScope) throw new Error("Microsoft Entra authentication is not configured.");
  const result = await instance.loginPopup({
    scopes: [apiScope],
    prompt: "select_account",
    extraQueryParameters: googleIssuerHint,
  });
  if (!result.account) throw new Error("Microsoft Entra did not return an account.");
  instance.setActiveAccount(result.account);
  return filosageUser(result.account);
}

export async function signInWithEntraRedirect() {
  const instance = await entraApplication();
  if (!instance || !apiScope) throw new Error("Microsoft Entra authentication is not configured.");
  await instance.loginRedirect({
    scopes: [apiScope],
    prompt: "select_account",
    extraQueryParameters: googleIssuerHint,
  });
}

export async function reauthenticateWithEntra() {
  const instance = await entraApplication();
  if (!instance || !apiScope) throw new Error("Microsoft Entra authentication is not configured.");
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  if (!account) throw new Error("Sign in before confirming this action.");
  const result: AuthenticationResult = await instance.acquireTokenPopup({
    account,
    scopes: [apiScope],
    prompt: "login",
    maxAge: 0,
    extraQueryParameters: googleIssuerHint,
  });
  if (result.account) instance.setActiveAccount(result.account);
  if (!result.idToken) throw new Error("Microsoft Entra did not return a reauthentication proof.");
  return result.account
    ? filosageUser(result.account, result.idToken)
    : filosageUser(account, result.idToken);
}

export async function signOutFromEntra() {
  const instance = await entraApplication();
  if (!instance) return;
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  if (account) await instance.logoutPopup({ account, mainWindowRedirectUri: redirectUri() });
}
