import { useCallback, useEffect, useState } from 'react';
import { showToast } from '../utils/toast';
import { messageForApiError } from '../utils/apiClient';
import {
  cacheServerSetsLocally,
  deleteSetOnServer,
  dispatchSetsChanged,
  fetchSavedSets,
  upsertSetOnServer,
} from '../utils/setLibraryApi';
import { hasAuthSession } from '../utils/hasAuthSession';
import {
  deriveSetTitle,
  normalizeSetUrl,
  readSetLibrary,
  removeSetFromLibrary,
  upsertSetLibraryEntry,
} from '../utils/setLibrary';
import { canPlaySetUrl } from '../components/LazySetPlayer';

function hasAuth() {
  return hasAuthSession();
}

export function useSetLibraryData(lang = 'en') {
  const [sets, setSets] = useState(() => readSetLibrary());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (hasAuth()) {
        const rows = await fetchSavedSets(lang);
        cacheServerSetsLocally(rows);
        setSets(rows);
      } else {
        setSets(readSetLibrary());
      }
    } catch (err) {
      showToast(messageForApiError(err, lang));
      setSets(readSetLibrary());
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    reload();
    const onChange = () => { reload(); };
    window.addEventListener('tidal-sets-changed', onChange);
    return () => window.removeEventListener('tidal-sets-changed', onChange);
  }, [reload]);

  const addByUrl = useCallback(async (url) => {
    const n = normalizeSetUrl(url);
    if (!n || !canPlaySetUrl(n)) return false;
    if (hasAuth()) {
      await upsertSetOnServer({ url: n, title: deriveSetTitle(n) }, lang);
      await reload();
      dispatchSetsChanged();
      return true;
    }
    upsertSetLibraryEntry({ url: n, title: deriveSetTitle(n) });
    setSets(readSetLibrary());
    dispatchSetsChanged();
    return true;
  }, [lang, reload]);

  const removeSet = useCallback(async (row) => {
    if (hasAuth() && row?.serverId) {
      await deleteSetOnServer(row.serverId, lang);
      await reload();
    } else {
      removeSetFromLibrary(row?.url || row?.id);
      setSets(readSetLibrary());
    }
    dispatchSetsChanged();
  }, [lang, reload]);

  return { sets, loading, reload, addByUrl, removeSet };
}
