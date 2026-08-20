import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiUrl } from '../lib/config';

export interface AuthState {
  user: { id: string; email: string; name: string; role: string; orgId: string } | null;
  accessToken: string | null;
  refreshToken: string | null;
  mfaRequired: boolean;
  setUser: (user: AuthState['user']) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setMfaRequired: (required: boolean) => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      mfaRequired: false,
      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setMfaRequired: (mfaRequired) => set({ mfaRequired }),
      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) return null;
        try {
          const res = await fetch(apiUrl('/v1/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) {
            get().logout();
            return null;
          }
          const data = await res.json();
          if (data.access_token) {
            set({ accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken });
            return data.access_token;
          }
          get().logout();
          return null;
        } catch {
          get().logout();
          return null;
        }
      },
      logout: () => set({ user: null, accessToken: null, refreshToken: null, mfaRequired: false }),
    }),
    {
      name: 'qyx-auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken, refreshToken: state.refreshToken }),
    }
  )
);
