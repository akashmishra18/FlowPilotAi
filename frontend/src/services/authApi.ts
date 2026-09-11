import { apiClient } from './apiClient';
import { CurrentUser } from '@/store/authStore';

interface AuthResponse {
  user: CurrentUser;
  accessToken: string;
}

export async function registerRequest(input: { name: string; email: string; password: string }) {
  const res = await apiClient.post('/auth/register', input);
  return res.data.data as { user: CurrentUser };
}

export async function loginRequest(input: { email: string; password: string }) {
  const res = await apiClient.post<{ data: AuthResponse }>('/auth/login', input);
  return res.data.data as unknown as AuthResponse;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await apiClient.get('/auth/me');
  return res.data.data.user as CurrentUser;
}

export async function refreshSessionRequest(): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/refresh');
  return res.data.data as AuthResponse;
}
