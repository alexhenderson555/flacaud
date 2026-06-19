import { getAccessToken } from './tokenStorage';

/** Whether the user appears logged in (access token or refresh cookie may exist). */
export function hasAuthSession() {
  return !!getAccessToken();
}
