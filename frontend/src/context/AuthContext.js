import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dot_token");
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([api.get("/auth/me"), api.get("/me/permissions")])
      .then(([me, p]) => {
        setUser(me.data);
        setPerms(p.data.permissions || []);
      })
      .catch(() => localStorage.removeItem("dot_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("dot_token", data.access_token);
    setUser(data.user);
    try {
      const p = await api.get("/me/permissions");
      setPerms(p.data.permissions || []);
    } catch (e) {
      setPerms([]);
    }
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
    <AuthContext.Provider value={{ user, perms, hasPerm, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
