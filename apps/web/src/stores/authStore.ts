import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiUrl } from '../lib/config';
import { bucketOf, type RoleBucket } from '../lib/roles';

export interface AuthState {
  user: { id: string; email: string; name: string; role: string; orgId: string } | null;
  accessToken: string | null;
  mfaRequired: boolean;
  roleBucket: RoleBucket | null;
  meVerifiedAt: number | null;
  setUser: (user: AuthState['user']) => void;
  setAccessToken: (accessToken: string) => void;
  setMfaRequired: (required: boolean) => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      mfaRequired: false,
      roleBucket: null,
      meVerifiedAt: null,
      setUser: (user) => set({ user, roleBucket: user ? bucketOf(user.role) : null }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setMfaRequired: (mfaRequired) => set({ mfaRequired }),
      refreshAccessToken: async () => {
        try {
          const res = await fetch(apiUrl('/v1/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          if (!res.ok) {
            get().logout();
            return null;
          }
          const data = await res.json();
          if (data.access_token) {
            set({ accessToken: data.access_token });
            return data.access_token;
          }
          get().logout();
          return null;
        } catch {
          get().logout();
          return null;
        }
      },
      logout: () => set({ user: null, accessToken: null, mfaRequired: false, roleBucket: null, meVerifiedAt: null }),
    }),
    {
      name: 'qyx-auth',
      partialize: (state) => ({ user: state.user, roleBucket: state.roleBucket }),
    }
  )
);
