'use client';

import { Provider } from 'react-redux';
import { store } from './store';

interface StoreProviderProps {
  children: React.ReactNode;
}

/**
 * Redux Store Provider for Next.js App Router
 */
export function StoreProvider({ children }: StoreProviderProps) {
  return <Provider store={store}>{children}</Provider>;
}
