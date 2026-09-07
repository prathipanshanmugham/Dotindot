import axios from "axios";

const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dot_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      localStorage.removeItem("dot_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

export const formatINR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export const apiError = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && typeof x.msg === "string" ? x.msg : JSON.stringify(x))).join(" ");
  return e?.message || "Something went wrong";
};

export const daysUntil = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso + "T00:00:00") - new Date(new Date().toDateString());
  return Math.round(diff / 86400000);
};

export const openReceipt = async (path) => {
  const res = await api.get(`/finance/receipts/${path}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank");
};
