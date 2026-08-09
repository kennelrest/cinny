import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  MatrixError,
  createClient,
  generateOidcAuthorizationUrl,
  registerOidcClient,
} from 'matrix-js-sdk';
import { secureRandomString } from 'matrix-js-sdk/lib/randomstring';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { useAutoDiscoveryInfo } from '../hooks/useAutoDiscoveryInfo';
import { promiseFulfilledResult, promiseRejectedResult } from '../utils/common';
import {
  AuthFlows,
  RegisterFlowStatus,
  RegisterFlowsResponse,
  parseRegisterErrResp,
} from '../hooks/useAuthFlows';

type AuthFlowsLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown) => ReactNode;
  children: (authFlows: AuthFlows) => ReactNode;
};
export function AuthFlowsLoader({ fallback, error, children }: AuthFlowsLoaderProps) {
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const baseUrl = autoDiscoveryInfo['m.homeserver'].base_url;

  const mx = useMemo(() => createClient({ baseUrl }), [baseUrl]);

  const [state, load] = useAsyncCallback(
    useCallback(async () => {
      const result = await Promise.allSettled([mx.loginFlows(), mx.registerRequest({})]);
      const loginFlows = promiseFulfilledResult(result[0]);
      const registerResp = promiseRejectedResult(result[1]) as MatrixError | undefined;
      let registerFlows: RegisterFlowsResponse = { status: RegisterFlowStatus.InvalidRequest };

      if (typeof registerResp === 'object' && registerResp.httpStatus) {
        registerFlows = parseRegisterErrResp(registerResp);
      }

      if (!loginFlows) {
        const oidcConfig = await mx.getAuthMetadata();

        const redirectUri = window.location.href;

        const clientId = await registerOidcClient(oidcConfig, {
          clientName: 'Cinny (kennel.rest)',
          clientUri: window.location.origin,
          logoUri: 'https://cinny.in/assets/cinny.svg',
          applicationType: 'web',
          redirectUris: [redirectUri],
          tosUri: 'https://kennel.rest',
          policyUri: 'https://kennel.rest',
          contacts: ['matrix@kennel.rest'],
        });

        const nonce = secureRandomString(8);

        const authFlows: AuthFlows = {
          loginFlows: {
            flows: [
              {
                type: 'm.login.sso',
                identity_providers: [
                  {
                    id:
                      'oidc-url:' +
                      (await generateOidcAuthorizationUrl({
                        clientId,
                        metadata: oidcConfig,
                        homeserverUrl: baseUrl,
                        redirectUri,
                        nonce,
                        prompt: 'login',
                      })),
                    name: 'OpenID Connect',
                  },
                ],
              },
            ],
          },
          registerFlows: { status: RegisterFlowStatus.RegistrationDisabled },
        };

        return authFlows;
      }
      if ('errcode' in loginFlows) {
        throw new Error('Failed to load auth flow!');
      }

      const authFlows: AuthFlows = {
        loginFlows,
        registerFlows,
      };

      return authFlows;
    }, [mx])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (state.status === AsyncStatus.Error) {
    return error?.(state.error);
  }

  return children(state.data);
}
