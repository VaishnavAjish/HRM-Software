import { prisma } from '../config/db';
import { createCrudService } from './crudFactory';

export const companyService = createCrudService({
  delegate: prisma.company,
  entityName: 'Company',
  searchFields: ['name', 'code'],
  include: { branches: true },
});

export const branchService = createCrudService({
  delegate: prisma.branch,
  entityName: 'Branch',
  searchFields: ['name', 'code'],
  include: { company: true, locations: true },
});

export const locationService = createCrudService({
  delegate: prisma.location,
  entityName: 'Location',
  searchFields: ['name', 'city', 'country'],
  include: { branch: { include: { company: true } } },
});

export const departmentService = createCrudService({
  delegate: prisma.department,
  entityName: 'Department',
  searchFields: ['name', 'code'],
  include: { teams: true },
});

export const teamService = createCrudService({
  delegate: prisma.team,
  entityName: 'Team',
  searchFields: ['name'],
  include: { department: true },
});

export const designationService = createCrudService({
  delegate: prisma.designation,
  entityName: 'Designation',
  searchFields: ['title'],
  orderBy: { level: 'desc' },
});
