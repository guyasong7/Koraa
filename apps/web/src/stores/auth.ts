import { create } from "zustand";
import { authApi, UserProfile, RegisterData } from "@/lib/api";
import { firebaseSignOut } from "@/lib/firebase";

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  socialLogin: (provider: string, id_token: string, full_name?: string, referral_code?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated:
    typeof window !== "undefined" && !!localStorage.getItem("koraa_access"),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.login({ email, password });
      localStorage.setItem("koraa_access", data.access);
      localStorage.setItem("koraa_refresh", data.refresh);
      const meRes = await authApi.me();
      set({ user: meRes.data, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },

  socialLogin: async (provider: string, id_token: string, full_name?: string, referral_code?: string) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.socialLogin({ provider, id_token, full_name, referral_code });
      localStorage.setItem("koraa_access", data.access);
      localStorage.setItem("koraa_refresh", data.refresh);
      const meRes = await authApi.me();
      set({ user: meRes.data, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },


  register: async (formData) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.register(formData);
      localStorage.setItem("koraa_access", data.access);
      localStorage.setItem("koraa_refresh", data.refresh);
      const meRes = await authApi.me();
      set({ user: meRes.data, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      const refresh = localStorage.getItem("koraa_refresh");
      if (refresh) await authApi.logout(refresh);
    } catch {}
    // Firebase holds its own session in this browser's IndexedDB, and it is the
    // one that can mint an ID token to trade back for a Koraa session. Dropping
    // only the tokens below would leave the next visitor to this browser one
    // click from being signed in as whoever just logged out.
    //
    // Safe to import here even though this store is in every page's graph:
    // lib/firebase loads the SDK dynamically, so the static cost is the small
    // wrapper module, not the auth bundle.
    try {
      await firebaseSignOut();
    } catch {
      // A network failure here must not stop the local session being cleared —
      // half a logout that keeps the user signed in is the worse outcome.
    }
    localStorage.removeItem("koraa_access");
    localStorage.removeItem("koraa_refresh");
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    try {
      const { data } = await authApi.me();
      set({ user: data, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
