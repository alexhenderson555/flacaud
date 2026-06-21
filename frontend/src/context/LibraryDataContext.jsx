import { createContext, useContext } from 'react';
import { useLibraryData } from '../hooks/useLibraryData';

const LibraryDataContext = createContext(null);

export function LibraryDataProvider({ children, lang = 'en' }) {
  const value = useLibraryData(lang);
  return (
    <LibraryDataContext.Provider value={value}>
      {children}
    </LibraryDataContext.Provider>
  );
}

export function useLibraryDataContext() {
  return useContext(LibraryDataContext);
}
