'use client';

import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useLoginMutation } from '../services';
import { baseApi } from '@/lib/api';
import { useAppDispatch } from '@/store';
import type { LoginDto } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * LoginModal - Business logic component for user authentication
 * Design elements have been stripped - implement your own styling
 */
export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useAppDispatch();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<LoginDto>({
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = useCallback(
    async (data: LoginDto) => {
      try {
        await login(data).unwrap();
        // Reset API cache to force refetch with new token
        dispatch(baseApi.util.resetApiState());
        reset();
        onClose();
      } catch {
        // Error handled by RTK Query
      }
    },
    [login, reset, onClose, dispatch]
  );

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const apiError = error as { data?: { error?: { message?: string } } } | undefined;
  const errorMessage = apiError?.data?.error?.message;

  if (!isOpen) return null;

  return (
    <div className="login-modal-overlay" onClick={handleClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal__header">
          <h2 className="login-modal__title">Anmelden</h2>
          <button
            type="button"
            className="login-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="login-modal__description">Melden Sie sich mit Ihren Zugangsdaten an</p>

        <form onSubmit={handleSubmit(onSubmit)}>
          {errorMessage && (
            <div role="alert">
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@beispiel.de"
              {...register('email', {
                required: 'E-Mail ist erforderlich',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Ungültige E-Mail-Adresse',
                },
              })}
            />
            {errors.email && <span role="alert">{errors.email.message}</span>}
          </div>

          <div>
            <label htmlFor="password">Passwort</label>
            <div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
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
              >
                {showPassword ? 'Verbergen' : 'Anzeigen'}
              </button>
            </div>
            {errors.password && <span role="alert">{errors.password.message}</span>}
          </div>

          <div>
            <label>
              <input type="checkbox" {...register('rememberMe')} />
              <span>Angemeldet bleiben</span>
            </label>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
};
