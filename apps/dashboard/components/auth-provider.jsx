"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    account: null,
    memberships: [],
    activeTenantId: null,
  });
  const refresh = async () => {
    try {
      const me = await api("/v1/auth/me");
      if (me.activeTenantId) localStorage.setItem("unpirator_tenant_id", me.activeTenantId);
      setState({ loading: false, ...me });
      return me;
    } catch {
      localStorage.removeItem("unpirator_tenant_id");
      setState({ loading: false, account: null, memberships: [], activeTenantId: null });
      return null;
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const value = useMemo(() => ({ ...state, refresh }), [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
