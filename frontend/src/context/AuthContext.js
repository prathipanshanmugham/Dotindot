import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [landing, setLanding] = useState("staff");

  const loadPerms = async () => {
    const [p, w] = await Promise.all([api.get("/me/permissions"), api.get("/dashboard/which")]);
    setPerms(p.data.permissions || []);
    setLanding(w.data.dashboard || "staff");
  };

  useEffect(() => {
    const token = localStorage.getItem("dot_token");
    if (!token) {
      setLoading(false);
      setReady(true);
      return;
    }
    Promise.all([api.get("/auth/me"), loadPerms()])
      .then(([me]) => setUser(me.data))
      .catch(() => localStorage.removeItem("dot_token"))
      .finally(() => { setLoading(false); setReady(true); });
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("dot_token", data.access_token);
    try {
      await loadPerms();
    } catch (e) {
      setPerms([]);
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }
    localStorage.removeItem("dot_token");
    setUser(null);
    setPerms([]);
  };

  const hasPerm = (...keys) => {
    if (user?.role === "super_admin") return true;
    return keys.some((k) => perms.includes(k));
  };

  return (
    <AuthContext.Provider value={{ user, perms, hasPerm, loading, ready, landing, refreshPerms: loadPerms, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
