import { ApiError, apiPatchJson } from './apiClient';
import { dispatchDjPrefsChanged } from './djPrefs';

/**
 * Turn on DJ BPM/key analysis in account preferences (Pro/Lifetime).
 * @returns {Promise<boolean>} true when enabled on server
 */
export async function enableDjAnalysisPreference(setDjAnalysisEnabled) {
  try {
    const data = await apiPatchJson(
      '/api/auth/me/preferences',
      { dj_enabled: true },
      { auth: true },
    );
    const enabled = !!data?.dj_enabled;
    setDjAnalysisEnabled?.(enabled);
    if (enabled) dispatchDjPrefsChanged();
    return enabled;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return false;
    }
    throw err;
  }
}
