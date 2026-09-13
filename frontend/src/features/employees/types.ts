import { CurrentUser } from '@/store/authStore';

export interface EmployeeUserSummary {
  _id: string;
  name: string;
  email: string;
  role: CurrentUser['role'];
  isActive: boolean;
}

export interface Employee {
  _id: string;
  userId: string;
  employeeId: string;
  department: string;
  designation: string;
  phone: string | null;
  skills: string[];
  joinedAt: string;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on list rows and single-record fetches (joined server-side). */
  user?: EmployeeUserSummary;
}

export interface EmployeeListFilters {
  page?: number;
  limit?: number;
  department?: string;
  designation?: string;
  isActive?: boolean;
  search?: string;
}

export interface EmployeePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EmployeeListResponse {
  employees: Employee[];
  pagination: EmployeePagination;
}

export interface CreateEmployeeInput {
  userId: string;
  employeeId: string;
  department: string;
  designation: string;
  phone?: string;
  joinedAt: string;
  managerId?: string;
}

export interface UpdateEmployeeInput {
  department?: string;
  designation?: string;
  phone?: string;
  joinedAt?: string;
  managerId?: string;
  skills?: string[];
}
