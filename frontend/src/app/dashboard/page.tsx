'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector, useAppDispatch } from '@/store';
import { clearCredentials } from '@/modules/auth/store';
import { APP_NAME } from '@/lib/app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    dispatch(clearCredentials());
    router.push('/login');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="dashboard-title">
            Hallo, {user?.firstName || 'User'}!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="dashboard-welcome">
            Willkommen bei {APP_NAME}
          </p>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full"
            data-testid="dashboard-logout"
          >
            Abmelden
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
