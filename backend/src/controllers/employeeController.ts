import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as employeeService from '../services/employeeService';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.createEmployee(req.body);
  sendSuccess(res, { employee }, 201, 'Employee created successfully');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, department, designation, isActive, search } = req.query;

  const result = await employeeService.getEmployees({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    department: department as string | undefined,
    designation: designation as string | undefined,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    search: search as string | undefined,
  });

  sendSuccess(res, result);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // req.user is guaranteed by the `authenticate` middleware.
  const employee = await employeeService.getCurrentEmployeeProfile(req.user!.id);
  sendSuccess(res, { employee });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.getEmployeeById(req.user!, req.params.id);
  sendSuccess(res, { employee });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.updateEmployee(req.params.id, req.body);
  sendSuccess(res, { employee }, 200, 'Employee updated successfully');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeeService.updateEmployeeStatus(req.user!, req.params.id, req.body.isActive);
  sendSuccess(res, { employee }, 200, 'Employee status updated successfully');
});
