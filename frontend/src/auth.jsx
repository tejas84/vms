import { createContext, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken } from "./api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const { data } = await api.get("/api/v1/auth/me");
      setUser(data.user);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <AuthContext.Provider value={{ user, setUser, ready, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function can(user, permission) {
  if (!user?.permissions) return false;
  return user.permissions.includes("*") || user.permissions.includes(permission);
}
