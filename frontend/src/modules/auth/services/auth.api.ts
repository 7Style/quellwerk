import { baseApi } from '@/lib/api';
import type { LoginDto, AuthResponse, RefreshTokenDto, AuthUser } from '../types';

/**
 * Auth API - RTK Query endpoints
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Login with email and password
     */
    login: builder.mutation<AuthResponse, LoginDto>({
      query: (credentials) => ({
        url: '/api/auth/login',
        method: 'POST',
        body: credentials,
      }),
      // Invalidate all user data after login to trigger refetch with new token
      invalidatesTags: ['User', 'Role', 'Metadata'],
    }),

    /**
     * Logout current session
     */
    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: '/api/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User', 'Role', 'Metadata'],
    }),

    /**
     * Refresh access token
     */
    refreshToken: builder.mutation<AuthResponse, RefreshTokenDto>({
      query: (body) => ({
        url: '/api/auth/refresh',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Get current authenticated user
     */
    getMe: builder.query<{ success: boolean; data: AuthUser }, void>({
      query: () => '/api/auth/me',
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useRefreshTokenMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = authApi;
