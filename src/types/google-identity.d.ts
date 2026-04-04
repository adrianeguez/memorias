declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (_config: {
            client_id: string;
            scope: string;
            callback: (_response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: (_options: { prompt: string }) => void;
          };
        };
      };
    };
  }
}

export {};
