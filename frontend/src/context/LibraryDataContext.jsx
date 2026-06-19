import { createContext, useContext } from 'react';
import { useLibraryData } from '../hooks/useLibraryData';

const LibraryDataContext = createContext(null);

export function LibraryDataProvider({ children, revision = 0, lang = 'en' }) {
  const value = useLibraryData(revision, lang);
  return (
    <LibraryDataContext.Provider value={value}>
      {children}
    </LibraryDataContext.Provider>
  );
}

export function useLibraryDataContext() {
  return useContext(LibraryDataContext);
}
