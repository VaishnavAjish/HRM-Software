import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment, canViewReports } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import * as reportSchemas from '../validators/report.validator';
import * as reportController from '../controllers/report.controller';
import { UserRole } from '../models/User';

const {
  reportQuerySchema,
  reportParamsSchema,
  reportTemplateQuerySchema,
  reportTemplateParamsSchema,
  createReportTemplateSchema,
  updateReportTemplateSchema,
  scheduledReportQuerySchema,
  scheduledReportParamsSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  dashboardQuerySchema,
  dashboardParamsSchema,
  createDashboardSchema,
  updateDashboardSchema,
  widgetQuerySchema,
  widgetParamsSchema,
  createWidgetSchema,
  updateWidgetSchema,
  exportQuerySchema,
  analyticsQuerySchema,
  workforceQuerySchema,
  headcountQuerySchema,
  turnoverQuerySchema,
  attendanceReportQuerySchema,
  leaveReportQuerySchema,
  payrollReportQuerySchema,
  recruitmentReportQuerySchema,
  performanceReportQuerySchema,
  trainingReportQuerySchema,
  complianceReportQuerySchema,
  shareDashboardSchema,
  reorderWidgetsSchema,
  generateAdhocReportSchema,
  createCustomReportSchema,
  updateCustomReportSchema,
  kpiQuerySchema,
  kpiParamsSchema,
  kpiTrendQuerySchema,
  createKPISchema,
  updateKPISchema,
  scheduleExportSchema,
  exportHistoryQuerySchema,
  exportParamsSchema,
} = reportSchemas;

const router = Router();

router.use(authenticate);

router.get('/templates',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportTemplateQuerySchema),
  reportController.getReportTemplates
);

router.post('/templates',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createReportTemplateSchema),
  reportController.createReportTemplate
);

router.get('/templates/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(reportTemplateParamsSchema),
  reportController.getReportTemplateById
);

router.put('/templates/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportTemplateParamsSchema),
  validateBody(updateReportTemplateSchema),
  reportController.updateReportTemplate
);

router.delete('/templates/:id',
  authorize(UserRole.ADMIN),
  validateParams(reportTemplateParamsSchema),
  reportController.deleteReportTemplate
);

router.post('/templates/:id/duplicate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportTemplateParamsSchema),
  reportController.duplicateReportTemplate
);

router.get('/scheduled',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(scheduledReportQuerySchema),
  reportController.getScheduledReports
);

router.post('/scheduled',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createScheduledReportSchema),
  reportController.createScheduledReport
);

router.get('/scheduled/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(scheduledReportParamsSchema),
  reportController.getScheduledReportById
);

router.put('/scheduled/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(scheduledReportParamsSchema),
  validateBody(updateScheduledReportSchema),
  reportController.updateScheduledReport
);

router.delete('/scheduled/:id',
  authorize(UserRole.ADMIN),
  validateParams(scheduledReportParamsSchema),
  reportController.deleteScheduledReport
);

router.post('/scheduled/:id/pause',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(scheduledReportParamsSchema),
  reportController.pauseScheduledReport
);

router.post('/scheduled/:id/resume',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(scheduledReportParamsSchema),
  reportController.resumeScheduledReport
);

router.post('/scheduled/:id/run-now',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(scheduledReportParamsSchema),
  reportController.runScheduledReportNow
);

router.get('/scheduled/:id/history',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(scheduledReportParamsSchema),
  reportController.getScheduledReportHistory
);

router.get('/dashboards',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(dashboardQuerySchema),
  reportController.getDashboards
);

router.post('/dashboards',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateBody(createDashboardSchema),
  reportController.createDashboard
);

router.get('/dashboards/default',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  reportController.getDefaultDashboard
);

router.post('/dashboards/:id/set-default',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  reportController.setDefaultDashboard
);

router.get('/dashboards/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(dashboardParamsSchema),
  reportController.getDashboardById
);

router.put('/dashboards/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  validateBody(updateDashboardSchema),
  reportController.updateDashboard
);

router.delete('/dashboards/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(dashboardParamsSchema),
  reportController.deleteDashboard
);

router.post('/dashboards/:id/share',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  validateBody(shareDashboardSchema),
  reportController.shareDashboard
);

router.delete('/dashboards/:id/share/:userId',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  reportController.unshareDashboard
);

router.get('/dashboards/:id/widgets',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(dashboardParamsSchema),
  validateQuery(widgetQuerySchema),
  reportController.getDashboardWidgets
);

router.post('/dashboards/:id/widgets',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  validateBody(createWidgetSchema),
  reportController.createWidget
);

router.get('/dashboards/widgets/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(widgetParamsSchema),
  reportController.getWidgetById
);

router.put('/dashboards/widgets/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(widgetParamsSchema),
  validateBody(updateWidgetSchema),
  reportController.updateWidget
);

router.delete('/dashboards/widgets/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(widgetParamsSchema),
  reportController.deleteWidget
);

router.put('/dashboards/:id/widgets/reorder',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(dashboardParamsSchema),
  validateBody(reorderWidgetsSchema),
  reportController.reorderWidgets
);

router.get('/generate/:templateId',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(reportParamsSchema),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.generateReport
);

router.post('/generate',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateBody(generateAdhocReportSchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.generateAdhocReport
);

router.get('/export/:reportId',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(reportParamsSchema),
  validateQuery(exportQuerySchema),
  reportController.exportReport
);

router.get('/analytics/overview',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(analyticsQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getAnalyticsOverview
);

router.get('/analytics/workforce',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(workforceQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getWorkforceAnalytics
);

router.get('/analytics/headcount',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(headcountQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getHeadcountAnalytics
);

router.get('/analytics/turnover',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(turnoverQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getTurnoverAnalytics
);

router.get('/analytics/attendance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(attendanceReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getAttendanceAnalytics
);

router.get('/analytics/leave',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(leaveReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getLeaveAnalytics
);

router.get('/analytics/payroll',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(payrollReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getPayrollAnalytics
);

router.get('/analytics/recruitment',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(recruitmentReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getRecruitmentAnalytics
);

router.get('/analytics/performance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getPerformanceAnalytics
);

router.get('/analytics/training',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getTrainingAnalytics
);

router.get('/analytics/compliance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(complianceReportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getComplianceAnalytics
);

router.get('/reports/employee-directory',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getEmployeeDirectoryReport
);

router.get('/reports/organization-chart',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getOrganizationChartReport
);

router.get('/reports/employee-profile',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getEmployeeProfileReport
);

router.get('/reports/new-hires',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getNewHiresReport
);

router.get('/reports/terminations',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getTerminationsReport
);

router.get('/reports/anniversaries',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getAnniversariesReport
);

router.get('/reports/birthdays',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getBirthdaysReport
);

router.get('/reports/probation',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getProbationReport
);

router.get('/reports/contract-expiry',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getContractExpiryReport
);

router.get('/reports/documents-expiry',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getDocumentsExpiryReport
);

router.get('/reports/salary-review',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getSalaryReviewReport
);

router.get('/reports/benefits-enrollment',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getBenefitsEnrollmentReport
);

router.get('/reports/grievances',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getGrievancesReport
);

router.get('/reports/disciplinary',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getDisciplinaryReport
);

router.get('/reports/overtime',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getOvertimeReport
);

router.get('/reports/leave-liability',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getLeaveLiabilityReport
);

router.get('/reports/payroll-summary',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getPayrollSummaryReport
);

router.get('/reports/tax-deduction',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getTaxDeductionReport
);

router.get('/reports/pf-esi',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getPFESIReport
);

router.get('/reports/form16',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getForm16Report
);

router.get('/reports/bank-advice',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getBankAdviceReport
);

router.get('/reports/ar IRAS',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getARIASReport
);

router.get('/reports/eeo',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getEEOReport
);

router.get('/reports/osha',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.getOSHAReport
);

router.get('/reports/audit-trail',
  authorize(UserRole.ADMIN),
  validateQuery(reportQuerySchema),
  canViewReports,
  reportController.getAuditTrailReport
);

router.get('/reports/data-quality',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getDataQualityReport
);

router.post('/reports/custom',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCustomReportSchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.createCustomReport
);

router.get('/reports/custom',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(reportQuerySchema),
  reportController.getCustomReports
);

router.get('/reports/custom/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportParamsSchema),
  reportController.getCustomReportById
);

router.put('/reports/custom/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportParamsSchema),
  validateBody(updateCustomReportSchema),
  reportController.updateCustomReport
);

router.delete('/reports/custom/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportParamsSchema),
  reportController.deleteCustomReport
);

router.post('/reports/custom/:id/execute',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reportParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  reportController.executeCustomReport
);

router.get('/kpis',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(kpiQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getKPIs
);

router.get('/kpis/:id/trend',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(kpiParamsSchema),
  validateQuery(kpiTrendQuerySchema),
  canViewReports,
  canAccessBranch,
  canAccessDepartment,
  reportController.getKPITrend
);

router.post('/kpis',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createKPISchema),
  reportController.createKPI
);

router.put('/kpis/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(kpiParamsSchema),
  validateBody(updateKPISchema),
  reportController.updateKPI
);

router.delete('/kpis/:id',
  authorize(UserRole.ADMIN),
  validateParams(kpiParamsSchema),
  reportController.deleteKPI
);

router.post('/export/schedule',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(scheduleExportSchema),
  reportController.scheduleExport
);

router.get('/export/history',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(exportHistoryQuerySchema),
  reportController.getExportHistory
);

router.get('/export/:id/download',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(exportParamsSchema),
  reportController.downloadExport
);

router.get('/export/formats',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  reportController.getExportFormats
);

export default router;