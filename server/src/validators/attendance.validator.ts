import { z } from 'zod';
import { AttendanceStatus, PunchType, AttendanceSource } from '../models/Attendance';

export const createAttendanceSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    date: z.string().datetime(),
    shiftId: z.string().optional(),
    status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.ABSENT),
    scheduledInTime: z.string().datetime().optional(),
    scheduledOutTime: z.string().datetime().optional(),
    punches: z.array(z.object({
      punchType: z.nativeEnum(PunchType),
      timestamp: z.string().datetime(),
      source: z.nativeEnum(AttendanceSource),
      deviceId: z.string().optional(),
      location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string().optional(),
        accuracy: z.number().optional(),
      }).optional(),
      ipAddress: z.string().optional(),
      deviceInfo: z.string().optional(),
      isManualEntry: z.boolean().default(false),
      approvedBy: z.string().optional(),
      approvedAt: z.string().datetime().optional(),
      note: z.string().max(500).optional(),
    })).optional(),
    breaks: z.array(z.object({
      breakType: z.enum(['LUNCH', 'SHORT', 'CUSTOM']),
      startTime: z.string().datetime(),
      endTime: z.string().datetime().optional(),
      durationMinutes: z.number().min(0).optional(),
      isPaid: z.boolean().default(true),
      approvedBy: z.string().optional(),
    })).optional(),
    overtime: z.array(z.object({
      date: z.string().datetime(),
      hours: z.number().min(0),
      rate: z.number().min(0),
      amount: z.number().min(0),
      reason: z.string().min(1).max(500),
      approvedBy: z.string().optional(),
      approvedAt: z.string().datetime().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
    })).optional(),
    workLocation: z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD']).default('OFFICE'),
    ipAddress: z.string().optional(),
    deviceId: z.string().optional(),
    geoLocation: z.object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
    }).optional(),
    isManualEntry: z.boolean().default(false),
    manualEntryBy: z.string().optional(),
    manualEntryReason: z.string().max(500).optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.string().datetime().optional(),
    rejectionReason: z.string().max(500).optional(),
    leaveRequestId: z.string().optional(),
    compensatoryOffId: z.string().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    shiftId: z.string().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    scheduledInTime: z.string().datetime().optional(),
    scheduledOutTime: z.string().datetime().optional(),
    punches: z.array(z.object({
      punchType: z.nativeEnum(PunchType),
      timestamp: z.string().datetime(),
      source: z.nativeEnum(AttendanceSource),
      deviceId: z.string().optional(),
      location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string().optional(),
        accuracy: z.number().optional(),
      }).optional(),
      ipAddress: z.string().optional(),
      deviceInfo: z.string().optional(),
      isManualEntry: z.boolean().optional(),
      approvedBy: z.string().optional(),
      approvedAt: z.string().datetime().optional(),
      note: z.string().max(500).optional(),
    })).optional(),
    breaks: z.array(z.object({
      breakType: z.enum(['LUNCH', 'SHORT', 'CUSTOM']),
      startTime: z.string().datetime(),
      endTime: z.string().datetime().optional(),
      durationMinutes: z.number().min(0).optional(),
      isPaid: z.boolean().optional(),
      approvedBy: z.string().optional(),
    })).optional(),
    overtime: z.array(z.object({
      date: z.string().datetime(),
      hours: z.number().min(0),
      rate: z.number().min(0),
      amount: z.number().min(0),
      reason: z.string().min(1).max(500),
      approvedBy: z.string().optional(),
      approvedAt: z.string().datetime().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    })).optional(),
    totalWorkMinutes: z.number().min(0).optional(),
    totalBreakMinutes: z.number().min(0).optional(),
    overtimeMinutes: z.number().min(0).optional(),
    lateMinutes: z.number().min(0).optional(),
    earlyDepartureMinutes: z.number().min(0).optional(),
    workLocation: z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD']).optional(),
    ipAddress: z.string().optional(),
    deviceId: z.string().optional(),
    geoLocation: z.object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
    }).optional(),
    isManualEntry: z.boolean().optional(),
    manualEntryBy: z.string().optional(),
    manualEntryReason: z.string().max(500).optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.string().datetime().optional(),
    rejectionReason: z.string().max(500).optional(),
    leaveRequestId: z.string().optional(),
    compensatoryOffId: z.string().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const attendanceQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    employeeId: z.string().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    shiftId: z.string().optional(),
    workLocation: z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD']).optional(),
    isManualEntry: z.coerce.boolean().optional(),
    hasOvertime: z.coerce.boolean().optional(),
    isLate: z.coerce.boolean().optional(),
  }),
});

export const attendanceParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Attendance ID is required'),
  }),
});

export const attendanceIdSchema = z.object({
  params: z.object({
    attendanceId: z.string().min(1, 'Attendance ID is required'),
  }),
});

export const bulkAttendanceSchema = z.object({
  body: z.object({
    attendances: z.array(z.object({
      employeeId: z.string().min(1, 'Employee ID is required'),
      date: z.string().datetime(),
      shiftId: z.string().optional(),
      status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.ABSENT),
      scheduledInTime: z.string().datetime().optional(),
      scheduledOutTime: z.string().datetime().optional(),
      punches: z.array(z.object({
        punchType: z.nativeEnum(PunchType),
        timestamp: z.string().datetime(),
        source: z.nativeEnum(AttendanceSource),
        deviceId: z.string().optional(),
        location: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          address: z.string().optional(),
          accuracy: z.number().optional(),
        }).optional(),
        ipAddress: z.string().optional(),
        deviceInfo: z.string().optional(),
        isManualEntry: z.boolean().default(false),
        approvedBy: z.string().optional(),
        approvedAt: z.string().datetime().optional(),
        note: z.string().max(500).optional(),
      })).optional(),
      breaks: z.array(z.object({
        breakType: z.enum(['LUNCH', 'SHORT', 'CUSTOM']),
        startTime: z.string().datetime(),
        endTime: z.string().datetime().optional(),
        durationMinutes: z.number().min(0).optional(),
        isPaid: z.boolean().default(true),
        approvedBy: z.string().optional(),
      })).optional(),
      workLocation: z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD']).default('OFFICE'),
      ipAddress: z.string().optional(),
      deviceId: z.string().optional(),
      geoLocation: z.object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string().optional(),
      }).optional(),
      isManualEntry: z.boolean().default(false),
      manualEntryBy: z.string().optional(),
      manualEntryReason: z.string().max(500).optional(),
      notes: z.string().max(1000).optional(),
    })).min(1, 'At least one attendance record is required'),
    markAsApproved: z.boolean().default(false),
    approvedBy: z.string().optional(),
  }),
});

export const punchInSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    punchType: z.nativeEnum(PunchType).default(PunchType.CHECK_IN),
    source: z.nativeEnum(AttendanceSource),
    deviceId: z.string().optional(),
    location: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      address: z.string().optional(),
      accuracy: z.number().optional(),
    }).optional(),
    ipAddress: z.string().optional(),
    deviceInfo: z.string().optional(),
    note: z.string().max(500).optional(),
  }),
});

export const attendanceStatsSchema = z.object({
  query: z.object({
    employeeId: z.string().optional(),
    branchId: z.string().optional(),
    departmentId: z.string().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    groupBy: z.enum(['employee', 'branch', 'department', 'date', 'status']).optional(),
  }),
});