import type { Metadata } from 'next';
import { StoreProvider } from '@/store/provider';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/app';
import '../styles/global.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION || undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
