import axios from "axios";
import { API_ROOT } from "@/lib/base";

// Client-portal API: separate token, separate login. Portal tokens only work on /api/portal/*.
export const PORTAL_TOKEN = "dot_portal_token";

const portalApi = axios.create({ baseURL: API_ROOT });

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PORTAL_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !String(err.config?.url || "").includes("/portal/login")) {
      localStorage.removeItem(PORTAL_TOKEN);
      window.dispatchEvent(new CustomEvent("portal-signed-out"));
    }
    return Promise.reject(err);
  }
);

export default portalApi;
