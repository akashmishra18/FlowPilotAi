import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true, // sends the httpOnly refresh-token cookie automatically
});

// Separate, interceptor-free instance for the refresh call itself, so a
// failed refresh can never trigger another refresh attempt (no infinite loop).
const refreshClient = axios.create({ baseURL, withCredentials: true });

// --- Attach the in-memory access token to every outgoing request ---
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- On a 401, try exactly one silent refresh, then retry the request ---
let refreshInFlight: Promise<string> | null = null;

async function requestNewAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshClient
      .post('/auth/refresh')
      .then((res) => {
        const { accessToken, user } = res.data.data;
        useAuthStore.getState().setSession(user, accessToken);
        return accessToken as string;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/register');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retried && !isAuthEndpoint) {
      originalRequest._retried = true;
      try {
        const newToken = await requestNewAccessToken();
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        useAuthStore.getState().clearSession();
      }
    }

    return Promise.reject(error);
  },
);
