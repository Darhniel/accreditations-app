// Simple event system for auth-related events
type AuthEventCallback = () => void;
let forceLogoutCallback: AuthEventCallback | null = null;

export const setForceLogoutCallback = (callback: AuthEventCallback | null) => {
  forceLogoutCallback = callback;
};

export const triggerForceLogout = () => {
  if (forceLogoutCallback) {
    forceLogoutCallback();
  }
};