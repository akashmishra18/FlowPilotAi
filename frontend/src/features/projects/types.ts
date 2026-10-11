export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ProjectManagerSummary {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface ProjectMemberSummary {
  _id: string;
  employeeId: string;
  department: string;
  designation: string;
  isActive: boolean;
}

/**
 * GET /api/projects and GET /api/projects/:id populate `managerId` and
 * `members`, so this is the shape used everywhere in the UI. Mutating
 * endpoints (create/update/status/manager/members/deactivate) return the
 * raw, unpopulated document instead — rather than modeling two shapes,
 * every mutation in this feature re-fetches via getProjectById afterward,
 * so the UI only ever renders this populated shape.
 */
export interface Project {
  _id: string;
  name: string;
  description: string;
  projectCode: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  clientName: string;
  startDate: string;
  deadline: string | null;
  managerId: ProjectManagerSummary;
  members: ProjectMemberSummary[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  managerId?: string;
  isActive?: boolean;
}

export interface ProjectPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProjectListResponse {
  projects: Project[];
  pagination: ProjectPagination;
}

export interface CreateProjectInput {
  name: string;
  projectCode: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  clientName?: string;
  startDate: string;
  deadline?: string;
  managerId: string;
  members?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  priority?: ProjectPriority;
  clientName?: string;
  startDate?: string;
  deadline?: string;
}
