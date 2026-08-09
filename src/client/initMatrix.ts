import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  OidcTokenRefresher,
  TokenRefreshFunction,
} from 'matrix-js-sdk';
import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';
import { getFallbackSession, type OidcInfo } from '../app/state/sessions';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;

  oidcInfo?: OidcInfo;
};

class CinnyOidcTokenRefresher extends OidcTokenRefresher {
  protected async persistTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<void> {
    localStorage.setItem('cinny_access_token', tokens.accessToken);
    if (tokens.refreshToken) {
      const session = getFallbackSession();
      if (!session?.oidcInfo) return;

      session.oidcInfo.refreshToken = tokens.refreshToken;
      localStorage.setItem('cinny_oidc', JSON.stringify(session.oidcInfo));
    }
  }
}

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  let tokenRefreshFunction: TokenRefreshFunction | undefined = undefined;
  if (session.oidcInfo) {
    const tokenRefresher = new CinnyOidcTokenRefresher(
      session.oidcInfo.issuer,
      session.oidcInfo.clientId,
      session.oidcInfo.redirectUri,
      session.deviceId,
      session.oidcInfo.idTokenClaims
    );

    tokenRefreshFunction = tokenRefresher.doRefreshAccessToken.bind(tokenRefresher);
  }

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    refreshToken: session.oidcInfo?.refreshToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
    tokenRefreshFunction,
  });

  await indexedDBStore.startup();
  await mx.initRustCrypto();

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
