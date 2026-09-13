import { apiClient } from '@/services/apiClient';
import {
  Employee,
  EmployeeListFilters,
  EmployeeListResponse,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './types';

export async function listEmployees(filters: EmployeeListFilters): Promise<EmployeeListResponse> {
  const params: Record<string, string> = {};
  if (filters.page) params.page = String(filters.page);
  if (filters.limit) params.limit = String(filters.limit);
  if (filters.department) params.department = filters.department;
  if (filters.designation) params.designation = filters.designation;
  if (typeof filters.isActive === 'boolean') params.isActive = String(filters.isActive);
  if (filters.search) params.search = filters.search;

  const res = await apiClient.get('/employees', { params });
  return res.data.data as EmployeeListResponse;
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const res = await apiClient.get(`/employees/${id}`);
  return res.data.data.employee as Employee;
}

export async function getMyEmployeeProfile(): Promise<Employee> {
  const res = await apiClient.get('/employees/me');
  return res.data.data.employee as Employee;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const res = await apiClient.post('/employees', input);
  return res.data.data.employee as Employee;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const res = await apiClient.patch(`/employees/${id}`, input);
  return res.data.data.employee as Employee;
}

export async function updateEmployeeStatus(id: string, isActive: boolean): Promise<Employee> {
  const res = await apiClient.patch(`/employees/${id}/status`, { isActive });
  return res.data.data.employee as Employee;
}
