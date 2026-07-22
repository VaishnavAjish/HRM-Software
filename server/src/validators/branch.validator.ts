import { z } from 'zod';
import { BranchStatus, BranchType } from '../models/Branch';

export const createBranchSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(20).toUpperCase(),
    name: z.string().min(1).max(100),
    displayName: z.string().max(150).optional(),
    type: z.nativeEnum(BranchType).default(BranchType.BRANCH_OFFICE),
    status: z.nativeEnum(BranchStatus).default(BranchStatus.ACTIVE),
    address: z.object({
      line1: z.string().min(1).max(200),
      line2: z.string().max(200).optional(),
      city: z.string().min(1).max(100),
      state: z.string().min(1).max(100),
      country: z.string().max(100).default('India'),
      postalCode: z.string().min(1).max(20),
      landmark: z.string().max(200).optional(),
      coordinates: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }).optional(),
    }),
    contact: z.object({
      phone: z.string().min(1).max(20),
      alternatePhone: z.string().max(20).optional(),
      email: z.string().email().max(100),
      alternateEmail: z.string().email().max(100).optional(),
      fax: z.string().max(20).optional(),
      website: z.string().url().max(200).optional(),
    }),
    operatingHours: z.array(z.object({
      day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
      isOpen: z.boolean().default(true),
      openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      breakStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      breakEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      timezone: z.string().default('Asia/Kolkata'),
    })).optional(),
    managerId: z.string().optional(),
    parentBranchId: z.string().optional(),
    timezone: z.string().default('Asia/Kolkata'),
    currency: z.string().max(3).default('INR'),
    language: z.string().max(10).default('en'),
    isHeadOffice: z.boolean().default(false),
    gstNumber: z.string().max(15).toUpperCase().optional(),
    panNumber: z.string().max(10).toUpperCase().optional(),
    tanNumber: z.string().max(10).toUpperCase().optional(),
    registrationNumber: z.string().max(50).optional(),
    establishedDate: z.string().datetime().optional(),
    capacity: z.number().int().positive().optional(),
    facilities: z.array(z.string()).optional(),
    customFields: z.record(z.any()).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

export const updateBranchSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    displayName: z.string().max(150).optional(),
    type: z.nativeEnum(BranchType).optional(),
    status: z.nativeEnum(BranchStatus).optional(),
    address: z.object({
      line1: z.string().max(200).optional(),
      line2: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      landmark: z.string().max(200).optional(),
      coordinates: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }).optional(),
    }).optional(),
    contact: z.object({
      phone: z.string().max(20).optional(),
      alternatePhone: z.string().max(20).optional(),
      email: z.string().email().max(100).optional(),
      alternateEmail: z.string().email().max(100).optional(),
      fax: z.string().max(20).optional(),
      website: z.string().url().max(200).optional(),
    }).optional(),
    operatingHours: z.array(z.object({
      day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
      isOpen: z.boolean().optional(),
      openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      breakStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      breakEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
      timezone: z.string().optional(),
    })).optional(),
    managerId: z.string().optional(),
    parentBranchId: z.string().optional(),
    timezone: z.string().optional(),
    currency: z.string().max(3).optional(),
    language: z.string().max(10).optional(),
    isHeadOffice: z.boolean().optional(),
    gstNumber: z.string().max(15).toUpperCase().optional(),
    panNumber: z.string().max(10).toUpperCase().optional(),
    tanNumber: z.string().max(10).toUpperCase().optional(),
    registrationNumber: z.string().max(50).optional(),
    establishedDate: z.string().datetime().optional(),
    capacity: z.number().int().positive().optional(),
    facilities: z.array(z.string()).optional(),
    customFields: z.record(z.any()).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

export const branchQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    type: z.nativeEnum(BranchType).optional(),
    status: z.nativeEnum(BranchStatus).optional(),
    isHeadOffice: z.coerce.boolean().optional(),
    parentBranchId: z.string().optional(),
    managerId: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const branchParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Branch ID is required'),
  }),
});

export const branchIdSchema = z.object({
  params: z.object({
    branchId: z.string().min(1, 'Branch ID is required'),
  }),
});

export const branchCodeSchema = z.object({
  params: z.object({
    code: z.string().min(1).max(20).toUpperCase(),
  }),
});