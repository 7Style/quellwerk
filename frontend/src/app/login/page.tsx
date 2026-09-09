'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useLoginMutation } from '@/modules/auth/services';
import { useAppSelector, useAppDispatch } from '@/store';
import { baseApi } from '@/lib/api';
import { APP_NAME } from '@/lib/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LoginDto } from '@/modules/auth/types';

/**
 * Login page. The data-testid attributes are the contract for the e2e tests
 * (e2e/pages/login.page.ts); rename them there when they change here.
 */
export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [login, { isLoading, error }] = useLoginMutation();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const onSubmit = useCallback(
    async (data: LoginDto) => {
      try {
        await login(data).unwrap();
        dispatch(baseApi.util.resetApiState());
        router.push('/dashboard');
      } catch {
        // Error handled by RTK Query
      }
    },
    [login, dispatch, router]
  );

  const apiError = error as { data?: { error?: { message?: string } } } | undefined;
  const errorMessage = apiError?.data?.error?.message;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="login-title">
            {APP_NAME}
          </CardTitle>
          <CardDescription>Melden Sie sich mit Ihren Zugangsdaten an</CardDescription>
        </CardHeader>
        <CardContent>
          {/* noValidate: react-hook-form shows the field errors below instead of the browser bubble */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
            data-testid="login-form"
          >
            {errorMessage && (
              <div
                role="alert"
                data-testid="login-error"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-500"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                data-testid="login-email"
                {...register('email', {
                  required: 'E-Mail ist erforderlich',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Ungültige E-Mail-Adresse',
                  },
                })}
              />
              {errors.email && (
                <p role="alert" data-testid="login-field-error" className="text-sm text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  data-testid="login-password"
                  {...register('password', {
                    required: 'Passwort ist erforderlich',
                    minLength: {
                      value: 6,
                      message: 'Mindestens 6 Zeichen',
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  aria-pressed={showPassword}
                  data-testid="password-toggle"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? 'Verbergen' : 'Anzeigen'}
                </button>
              </div>
              {errors.password && (
                <p role="alert" data-testid="login-field-error" className="text-sm text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="rememberMe"
                className="h-4 w-4 rounded border-gray-300"
                data-testid="login-remember-me"
                {...register('rememberMe')}
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal">
                Angemeldet bleiben
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              aria-busy={isLoading}
              data-testid="login-submit"
            >
              {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
