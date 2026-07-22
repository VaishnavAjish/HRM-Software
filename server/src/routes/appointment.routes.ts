import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment, canManageAppointments } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { 
  appointmentQuerySchema,
  appointmentParamsSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentTypeQuerySchema,
  appointmentTypeParamsSchema,
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  appointmentSlotQuerySchema,
  appointmentSlotParamsSchema,
  createAppointmentSlotSchema,
  updateAppointmentSlotSchema,
  appointmentBookingQuerySchema,
  appointmentBookingParamsSchema,
  createAppointmentBookingSchema,
  updateAppointmentBookingSchema,
  appointmentReminderSchema,
  appointmentFeedbackSchema,
  appointmentReportQuerySchema,
  shiftQuerySchema,
  shiftParamsSchema,
  createShiftSchema,
  updateShiftSchema,
  shiftAssignmentQuerySchema,
  shiftAssignmentParamsSchema,
  createShiftAssignmentSchema,
  updateShiftAssignmentSchema,
  rosterQuerySchema,
  rosterParamsSchema,
  createRosterSchema,
  updateRosterSchema,
} from '../validators/appointment.validator';
import * as appointmentController from '../controllers/appointment.controller';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

router.get('/types',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentTypeQuerySchema),
  appointmentController.getAppointmentTypes
);

router.post('/types',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createAppointmentTypeSchema),
  appointmentController.createAppointmentType
);

router.get('/types/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(appointmentTypeParamsSchema),
  appointmentController.getAppointmentTypeById
);

router.put('/types/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentTypeParamsSchema),
  validateBody(updateAppointmentTypeSchema),
  appointmentController.updateAppointmentType
);

router.delete('/types/:id',
  authorize(UserRole.ADMIN),
  validateParams(appointmentTypeParamsSchema),
  appointmentController.deleteAppointmentType
);

router.get('/slots',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentSlotQuerySchema),
  appointmentController.getAppointmentSlots
);

router.post('/slots',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createAppointmentSlotSchema),
  appointmentController.createAppointmentSlot
);

router.get('/slots/available',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentSlotQuerySchema),
  appointmentController.getAvailableSlots
);

router.get('/slots/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentSlotParamsSchema),
  appointmentController.getAppointmentSlotById
);

router.put('/slots/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentSlotParamsSchema),
  validateBody(updateAppointmentSlotSchema),
  appointmentController.updateAppointmentSlot
);

router.delete('/slots/:id',
  authorize(UserRole.ADMIN),
  validateParams(appointmentSlotParamsSchema),
  appointmentController.deleteAppointmentSlot
);

router.post('/slots/:id/block',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentSlotParamsSchema),
  appointmentController.blockAppointmentSlot
);

router.post('/slots/:id/unblock',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentSlotParamsSchema),
  appointmentController.unblockAppointmentSlot
);

router.get('/bookings',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentBookingQuerySchema),
  appointmentController.getAppointmentBookings
);

router.post('/bookings',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createAppointmentBookingSchema),
  appointmentController.createAppointmentBooking
);

router.get('/bookings/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getAppointmentBookingById
);

router.put('/bookings/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  validateBody(updateAppointmentBookingSchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.updateAppointmentBooking
);

router.delete('/bookings/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.deleteAppointmentBooking
);

router.post('/bookings/:id/confirm',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.confirmAppointment
);

router.post('/bookings/:id/cancel',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.cancelAppointment
);

router.post('/bookings/:id/reschedule',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.rescheduleAppointment
);

router.post('/bookings/:id/check-in',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.checkInAppointment
);

router.post('/bookings/:id/check-out',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.checkOutAppointment
);

router.post('/bookings/:id/complete',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.completeAppointment
);

router.post('/bookings/:id/no-show',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.markNoShow
);

router.post('/bookings/:id/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  validateBody(appointmentFeedbackSchema),
  appointmentController.submitFeedback
);

router.get('/bookings/:id/reminders',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.getAppointmentReminders
);

router.post('/bookings/:id/reminders',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentBookingParamsSchema),
  validateBody(appointmentReminderSchema),
  appointmentController.createReminder
);

router.put('/bookings/reminders/:reminderId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentBookingParamsSchema),
  validateBody(appointmentReminderSchema),
  appointmentController.updateReminder
);

router.delete('/bookings/reminders/:reminderId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(appointmentBookingParamsSchema),
  appointmentController.deleteReminder
);

router.get('/shifts',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(shiftQuerySchema),
  appointmentController.getShifts
);

router.post('/shifts',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createShiftSchema),
  appointmentController.createShift
);

router.get('/shifts/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(shiftParamsSchema),
  appointmentController.getShiftById
);

router.put('/shifts/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(shiftParamsSchema),
  validateBody(updateShiftSchema),
  appointmentController.updateShift
);

router.delete('/shifts/:id',
  authorize(UserRole.ADMIN),
  validateParams(shiftParamsSchema),
  appointmentController.deleteShift
);

router.get('/shifts/:id/assignments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(shiftParamsSchema),
  validateQuery(shiftAssignmentQuerySchema),
  appointmentController.getShiftAssignments
);

router.post('/shifts/:id/assignments',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(shiftParamsSchema),
  validateBody(createShiftAssignmentSchema),
  appointmentController.createShiftAssignment
);

router.get('/shifts/assignments/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(shiftAssignmentParamsSchema),
  appointmentController.getShiftAssignmentById
);

router.put('/shifts/assignments/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(shiftAssignmentParamsSchema),
  validateBody(updateShiftAssignmentSchema),
  appointmentController.updateShiftAssignment
);

router.delete('/shifts/assignments/:id',
  authorize(UserRole.ADMIN),
  validateParams(shiftAssignmentParamsSchema),
  appointmentController.deleteShiftAssignment
);

router.post('/shifts/assignments/:id/swap',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(shiftAssignmentParamsSchema),
  appointmentController.requestShiftSwap
);

router.post('/shifts/swaps/:swapId/approve',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  appointmentController.approveShiftSwap
);

router.post('/shifts/swaps/:swapId/reject',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  appointmentController.rejectShiftSwap
);

router.get('/rosters',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(rosterQuerySchema),
  appointmentController.getRosters
);

router.post('/rosters',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createRosterSchema),
  appointmentController.createRoster
);

router.get('/rosters/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(rosterParamsSchema),
  appointmentController.getRosterById
);

router.put('/rosters/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(rosterParamsSchema),
  validateBody(updateRosterSchema),
  appointmentController.updateRoster
);

router.delete('/rosters/:id',
  authorize(UserRole.ADMIN),
  validateParams(rosterParamsSchema),
  appointmentController.deleteRoster
);

router.post('/rosters/:id/publish',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(rosterParamsSchema),
  appointmentController.publishRoster
);

router.post('/rosters/:id/assign',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(rosterParamsSchema),
  appointmentController.assignRoster
);

router.get('/rosters/:id/conflicts',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(rosterParamsSchema),
  appointmentController.getRosterConflicts
);

router.post('/rosters/:id/resolve-conflict',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(rosterParamsSchema),
  appointmentController.resolveRosterConflict
);

router.get('/calendar',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentQuerySchema),
  appointmentController.getAppointmentCalendar
);

router.get('/calendar/availability',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentSlotQuerySchema),
  appointmentController.getCalendarAvailability
);

router.get('/reports/summary',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getAppointmentSummaryReport
);

router.get('/reports/utilization',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getUtilizationReport
);

router.get('/reports/no-shows',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getNoShowReport
);

router.get('/reports/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getFeedbackReport
);

router.get('/reports/shift-coverage',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getShiftCoverageReport
);

router.get('/reports/employee-schedule',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getEmployeeScheduleReport
);

router.get('/reports/roster-compliance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(appointmentReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  appointmentController.getRosterComplianceReport
);

router.post('/bulk/book',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  appointmentController.bulkBookAppointments
);

router.post('/bulk/cancel',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  appointmentController.bulkCancelAppointments
);

router.post('/bulk/reschedule',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  appointmentController.bulkRescheduleAppointments
);

router.post('/bulk/create-slots',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  appointmentController.bulkCreateSlots
);

router.post('/bulk/create-roster',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  appointmentController.bulkCreateRoster
);

export default router;