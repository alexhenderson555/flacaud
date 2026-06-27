import { clearMediaToken } from './mediaToken';
import { apiFetch, parseJsonSafe, ApiError } from './apiClient';
import { logoutSession, tryRefreshAccessToken } from './apiFetchCore';
import { clearAccessToken, getAccessToken } from './tokenStorage';

export { tryRefreshAccessToken, getAccessToken };

export function clearSession() {
  clearAccessToken();
  try {
    localStorage.removeItem('tidal-user');
    localStorage.removeItem('tidal-effective-plan');
    localStorage.removeItem('tidal-user-profile');
  } catch { /* ignore */ }
  clearMediaToken();
}

let validateInFlight = null;
let loginInFlight = null;

export function persistEffectivePlan(planId) {
  const plan = (planId || 'free').toLowerCase();
  try {
    localStorage.setItem('tidal-effective-plan', plan);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('tidal-plan-update', { detail: { plan } }));
  return plan;
}

export function getStoredEffectivePlan() {
  try {
    return localStorage.getItem('tidal-effective-plan') || 'free';
  } catch {
    return 'free';
  }
}

/** Stale-while-revalidate cache of the /api/auth/me profile, so the Account page
 *  shows the real plan/limits instantly instead of a free-plan placeholder while
 *  the (network-bound) /me request is in flight. */
export function persistUserProfile(data) {
  try {
    if (data) localStorage.setItem('tidal-user-profile', JSON.stringify(data));
    else localStorage.removeItem('tidal-user-profile');
  } catch { /* ignore */ }
}

export function getStoredUserProfile() {
  try {
    const raw = localStorage.getItem('tidal-user-profile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Session check result for app boot and visibility recheck. */
export async function validateSession() {
  const token = getAccessToken();
  if (!token) return { ok: false };

  if (validateInFlight) return validateInFlight;

  validateInFlight = (async () => {
    try {
      const res = await apiFetch('/api/auth/me', {
        auth: true,
        timeoutMs: 8000,
        retries: 0,
      });
      if (res.ok) {
        const data = await parseJsonSafe(res);
        if (data?.effective_plan) persistEffectivePlan(data.effective_plan);
        persistUserProfile(data);
        return {
          ok: true,
          plan: data?.effective_plan || getStoredEffectivePlan(),
          dj_enabled: !!data?.dj_enabled,
        };
      }
      if (res.status === 401) {
        clearSession();
        return { ok: false };
      }
      return { ok: false };
    } finally {
      validateInFlight = null;
    }
  })();

  return validateInFlight;
}

export function handleAuthFailure(status, lang = 'en') {
  if (status !== 401) return false;
  clearSession();
  const msg = lang === 'ru'
    ? 'Сессия истекла — войдите снова'
    : 'Session expired — please log in again';
  window.dispatchEvent(new CustomEvent('tidal-auth-expired', { detail: { message: msg } }));
  return true;
}

export async function loginWithPassword(username, password) {
  if (loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
      timeoutMs: 60000,
      retries: 1,
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const detail = data.detail || 'Invalid credentials';
      throw new ApiError(typeof detail === 'string' ? detail : 'Login failed', { status: res.status, code: 'auth' });
    }
    if (data?.effective_plan) persistEffectivePlan(data.effective_plan);
    return data;
  })();

  try {
    return await loginInFlight;
  } finally {
    loginInFlight = null;
  }
}

export async function registerUser({ email, username, password, acceptTerms = false }) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password, accept_terms: !!acceptTerms }),
    timeoutMs: 45000,
    retries: 1,
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const detail = data.detail || 'Registration failed';
    throw new ApiError(typeof detail === 'string' ? detail : 'Registration failed', { status: res.status, code: 'auth' });
  }
  return data;
}

/** Build Account profile state from login JSON (avoids immediate second /me). */
export function userDataFromLogin(data, fallbackUsername) {
  if (!data?.access_token) return null;
  const plan = persistEffectivePlan(data.effective_plan || 'free');
  return {
    username: data.username || fallbackUsername,
    effective_plan: plan,
    daily_limit: data.daily_limit ?? 3,
    downloads_today: data.downloads_today ?? 0,
    subscription_expires_at: data.subscription_expires_at ?? null,
  };
}

export async function verifyEmailToken(token) {
  const res = await apiFetch(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    { method: 'POST', timeoutMs: 15000, retries: 0 },
  );
  return parseJsonSafe(res);
}

export async function signOut() {
  await logoutSession();
  clearSession();
}
