import { UserSession, AppConfig } from 'blockstack';
import { popupCenter } from './popup';

const dataVaultHost = 'https://vault.hankstoever.com';

interface FinishedData {
  authResponse: string;
  userSession: UserSession;
}

export interface AuthOptions {
  // The URL you want the user to be redirected to after authentication.
  redirectTo: string;
  manifestPath: string;
  finished?: (data: FinishedData) => void;
  vaultUrl?: string;
  sendToSignIn?: boolean;
  userSession?: UserSession;
  appDetails: {
    name: string;
    icon: string;
  };
}

// To allow the ability to on-the-fly pass any of these keys to update the state
export interface OptionalAuthOptions {
  redirectTo?: string;
  manifestPath?: string;
  finished?: (data: FinishedData) => void;
  vaultUrl?: string;
  sendToSignIn?: boolean;
  userSession?: UserSession;
  appDetails?: {
    name?: string;
    icon?: string;
  };
}

export const authenticate = ({
  redirectTo,
  manifestPath,
  finished,
  vaultUrl,
  sendToSignIn = false,
  userSession,
  appDetails
}: AuthOptions) => {
  const dataVaultURL = new URL(vaultUrl || dataVaultHost);
  if (!userSession) {
    const appConfig = new AppConfig(
      ['store_write', 'publish_data'],
      document.location.href
    );
    // eslint-disable-next-line no-param-reassign
    userSession = new UserSession({ appConfig });
  }
  if (userSession.isUserSignedIn()) {
    userSession.signUserOut();
  }
  const transitKey = userSession.generateAndStoreTransitKey();
  const authRequest = userSession.makeAuthRequest(
    transitKey,
    `${document.location.origin}${redirectTo}`,
    `${document.location.origin}${manifestPath}`,
    undefined,
    undefined,
    undefined,
    {
      sendToSignIn,
      appDetails
    }
  );

  const popup = popupCenter({
    url: `${dataVaultURL.origin}/actions.html?authRequest=${authRequest}`
  });

  setupListener({ popup, authRequest, finished, dataVaultURL, userSession });
};

interface FinishedEventData {
  authResponse: string;
  authRequest: string;
  source: string;
}

interface ListenerParams {
  popup: Window | null;
  authRequest: string;
  finished?: (data: FinishedData) => void;
  dataVaultURL: URL;
  userSession: UserSession;
}

const setupListener = ({
  popup,
  authRequest,
  finished,
  dataVaultURL,
  userSession
}: ListenerParams) => {
  const interval = setInterval(() => {
    if (popup) {
      try {
        popup.postMessage(
          {
            authRequest
          },
          dataVaultURL.origin
        );
      } catch (error) {
        console.warn(
          '[Blockstack] Unable to send ping to authentication service'
        );
        clearInterval(interval);
      }
    }
  }, 100);

  const receiveMessage = async (event: MessageEvent) => {
    const data: FinishedEventData = event.data;
    if (data.authRequest === authRequest) {
      if (finished) {
        const { authResponse } = data;
        await userSession.handlePendingSignIn(authResponse);
        finished({
          authResponse,
          userSession
        });
      }
      window.removeEventListener('message', receiveMessageCallback);
      clearInterval(interval);
    }
  };

  const receiveMessageCallback = (event: MessageEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    receiveMessage(event);
  };

  window.addEventListener('message', receiveMessageCallback, false);
};
