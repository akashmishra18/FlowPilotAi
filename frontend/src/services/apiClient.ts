import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api',
  withCredentials: true,
});

// Phase 2: attach JWT access token to requests via an interceptor here,
// and handle 401 -> refresh-token flow.
