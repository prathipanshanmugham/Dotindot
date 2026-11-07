import axios from "axios";
import { API_ROOT } from "@/lib/base";

// Investor-portal API: its own token and login. Investor tokens only work on /api/investor-portal/*.
export const INVESTOR_TOKEN = "dot_investor_token";

const investorApi = axios.create({ baseURL: API_ROOT });

investorApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(INVESTOR_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

investorApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !String(err.config?.url || "").includes("/investor-portal/login")) {
      localStorage.removeItem(INVESTOR_TOKEN);
      window.dispatchEvent(new CustomEvent("investor-signed-out"));
    }
    return Promise.reject(err);
  }
);

export default investorApi;
