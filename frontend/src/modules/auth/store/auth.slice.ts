import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, AuthUser } from '../types';
import { authApi } from '../services/auth.api';

const TOKEN_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

/**
 * Get initial state from localStorage
 */
function getInitialState(): AuthState {
  if (typeof window === 'undefined') {
    return {
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    };
  }

  const accessToken = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);

  return {
    user: null,
    accessToken,
    refreshToken,
    isAuthenticated: !!accessToken,
    isLoading: false,
  };
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: getInitialState(),
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: AuthUser; accessToken: string; refreshToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;

      // Persist tokens
      localStorage.setItem(TOKEN_KEY, action.payload.accessToken);
      localStorage.setItem(REFRESH_KEY, action.payload.refreshToken);
    },

    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;

      // Clear tokens
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    },

    setUser: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload;
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },

  extraReducers: (builder) => {
    // Handle login success
    builder.addMatcher(authApi.endpoints.login.matchFulfilled, (state, { payload }) => {
      if (payload.success && payload.data) {
        state.user = payload.data.user;
        state.accessToken = payload.data.tokens.accessToken;
        state.refreshToken = payload.data.tokens.refreshToken;
        state.isAuthenticated = true;

        localStorage.setItem(TOKEN_KEY, payload.data.tokens.accessToken);
        localStorage.setItem(REFRESH_KEY, payload.data.tokens.refreshToken);
      }
    });

    // Handle logout
    builder.addMatcher(authApi.endpoints.logout.matchFulfilled, (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    });

    // Handle getMe success
    builder.addMatcher(authApi.endpoints.getMe.matchFulfilled, (state, { payload }) => {
      if (payload.success && payload.data) {
        state.user = payload.data;
      }
    });

    // Handle refresh token success
    builder.addMatcher(authApi.endpoints.refreshToken.matchFulfilled, (state, { payload }) => {
      if (payload.success && payload.data) {
        state.accessToken = payload.data.tokens.accessToken;
        state.refreshToken = payload.data.tokens.refreshToken;

        localStorage.setItem(TOKEN_KEY, payload.data.tokens.accessToken);
        localStorage.setItem(REFRESH_KEY, payload.data.tokens.refreshToken);
      }
    });
  },
});

export const { setCredentials, clearCredentials, setUser, setLoading } = authSlice.actions;
export const authReducer = authSlice.reducer;
