import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import * as trainingSchemas from '../validators/training.validator';
import * as trainingController from '../controllers/training.controller';
import { UserRole } from '../models/User';

const {
  trainingProgramQuerySchema,
  trainingProgramParamsSchema,
  createTrainingProgramSchema,
  updateTrainingProgramSchema,
  trainingCourseQuerySchema,
  trainingCourseParamsSchema,
  createTrainingCourseSchema,
  updateTrainingCourseSchema,
  trainingSessionQuerySchema,
  trainingSessionParamsSchema,
  createTrainingSessionSchema,
  updateTrainingSessionSchema,
  enrollmentQuerySchema,
  enrollmentParamsSchema,
  createEnrollmentSchema,
  updateEnrollmentSchema,
  attendanceQuerySchema,
  attendanceParamsSchema,
  markAttendanceSchema,
  assessmentQuerySchema,
  assessmentParamsSchema,
  createAssessmentSchema,
  updateAssessmentSchema,
  assessmentAttemptQuerySchema,
  assessmentAttemptParamsSchema,
  submitAssessmentSchema,
  gradeAssessmentSchema,
  feedbackQuerySchema,
  feedbackParamsSchema,
  submitFeedbackSchema,
  certificateQuerySchema,
  certificateParamsSchema,
  createCertificateSchema,
  trainingBudgetQuerySchema,
  trainingBudgetParamsSchema,
  createTrainingBudgetSchema,
  updateTrainingBudgetSchema,
  trainingReportQuerySchema,
  skillQuerySchema,
  skillParamsSchema,
  createSkillSchema,
  updateSkillSchema,
  learningPathQuerySchema,
  learningPathParamsSchema,
  createLearningPathSchema,
  updateLearningPathSchema,
  cancelSessionSchema,
  rejectEnrollmentSchema,
  withdrawEnrollmentSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
  addBudgetExpenseSchema,
  updateBudgetExpenseSchema,
  bulkEnrollSchema,
  bulkAttendanceSchema,
  bulkGradeSchema,
  bulkIssueCertificatesSchema,
  bulkCreateSessionsSchema,
} = trainingSchemas;

const router = Router();

router.use(authenticate);

router.get('/skills',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(skillQuerySchema),
  trainingController.getSkills
);

router.post('/skills',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createSkillSchema),
  trainingController.createSkill
);

router.get('/skills/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(skillParamsSchema),
  trainingController.getSkillById
);

router.put('/skills/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(skillParamsSchema),
  validateBody(updateSkillSchema),
  trainingController.updateSkill
);

router.delete('/skills/:id',
  authorize(UserRole.ADMIN),
  validateParams(skillParamsSchema),
  trainingController.deleteSkill
);

router.get('/skills/:id/employees',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(skillParamsSchema),
  trainingController.getEmployeesWithSkill
);

router.get('/learning-paths',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(learningPathQuerySchema),
  trainingController.getLearningPaths
);

router.post('/learning-paths',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createLearningPathSchema),
  trainingController.createLearningPath
);

router.get('/learning-paths/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(learningPathParamsSchema),
  trainingController.getLearningPathById
);

router.put('/learning-paths/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(learningPathParamsSchema),
  validateBody(updateLearningPathSchema),
  trainingController.updateLearningPath
);

router.delete('/learning-paths/:id',
  authorize(UserRole.ADMIN),
  validateParams(learningPathParamsSchema),
  trainingController.deleteLearningPath
);

router.post('/learning-paths/:id/enroll',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(learningPathParamsSchema),
  trainingController.enrollInLearningPath
);

router.get('/learning-paths/:id/progress',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(learningPathParamsSchema),
  trainingController.getLearningPathProgress
);

router.get('/programs',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingProgramQuerySchema),
  trainingController.getTrainingPrograms
);

router.post('/programs',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createTrainingProgramSchema),
  trainingController.createTrainingProgram
);

router.get('/programs/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingProgramParamsSchema),
  trainingController.getTrainingProgramById
);

router.put('/programs/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingProgramParamsSchema),
  validateBody(updateTrainingProgramSchema),
  trainingController.updateTrainingProgram
);

router.delete('/programs/:id',
  authorize(UserRole.ADMIN),
  validateParams(trainingProgramParamsSchema),
  trainingController.deleteTrainingProgram
);

router.post('/programs/:id/duplicate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingProgramParamsSchema),
  trainingController.duplicateTrainingProgram
);

router.get('/programs/:id/courses',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingProgramParamsSchema),
  trainingController.getProgramCourses
);

router.post('/programs/:id/courses',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingProgramParamsSchema),
  trainingController.addCourseToProgram
);

router.delete('/programs/:id/courses/:courseId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingProgramParamsSchema),
  trainingController.removeCourseFromProgram
);

router.get('/courses',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingCourseQuerySchema),
  trainingController.getTrainingCourses
);

router.post('/courses',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createTrainingCourseSchema),
  trainingController.createTrainingCourse
);

router.get('/courses/catalog',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingCourseQuerySchema),
  trainingController.getCourseCatalog
);

router.get('/courses/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingCourseParamsSchema),
  trainingController.getTrainingCourseById
);

router.put('/courses/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingCourseParamsSchema),
  validateBody(updateTrainingCourseSchema),
  trainingController.updateTrainingCourse
);

router.delete('/courses/:id',
  authorize(UserRole.ADMIN),
  validateParams(trainingCourseParamsSchema),
  trainingController.deleteTrainingCourse
);

router.post('/courses/:id/duplicate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingCourseParamsSchema),
  trainingController.duplicateTrainingCourse
);

router.get('/courses/:id/sessions',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingCourseParamsSchema),
  validateQuery(trainingSessionQuerySchema),
  trainingController.getCourseSessions
);

router.post('/courses/:id/sessions',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingCourseParamsSchema),
  validateBody(createTrainingSessionSchema),
  trainingController.createTrainingSession
);

router.get('/sessions',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingSessionQuerySchema),
  trainingController.getTrainingSessions
);

router.get('/sessions/upcoming',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingSessionQuerySchema),
  trainingController.getUpcomingSessions
);

router.get('/sessions/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingSessionParamsSchema),
  trainingController.getTrainingSessionById
);

router.put('/sessions/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingSessionParamsSchema),
  validateBody(updateTrainingSessionSchema),
  trainingController.updateTrainingSession
);

router.delete('/sessions/:id',
  authorize(UserRole.ADMIN),
  validateParams(trainingSessionParamsSchema),
  trainingController.deleteTrainingSession
);

router.post('/sessions/:id/publish',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingSessionParamsSchema),
  trainingController.publishTrainingSession
);

router.post('/sessions/:id/cancel',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingSessionParamsSchema),
  validateBody(cancelSessionSchema),
  trainingController.cancelTrainingSession
);

router.post('/sessions/:id/complete',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingSessionParamsSchema),
  trainingController.completeTrainingSession
);

router.get('/sessions/:id/attendance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(trainingSessionParamsSchema),
  validateQuery(attendanceQuerySchema),
  trainingController.getSessionAttendance
);

router.post('/sessions/:id/attendance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingSessionParamsSchema),
  validateBody(markAttendanceSchema),
  trainingController.markAttendance
);

router.put('/sessions/attendance/:attendanceId',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(attendanceParamsSchema),
  validateBody(markAttendanceSchema),
  trainingController.updateAttendance
);

router.get('/sessions/:id/assessments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(trainingSessionParamsSchema),
  validateQuery(assessmentQuerySchema),
  trainingController.getSessionAssessments
);

router.post('/sessions/:id/assessments',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingSessionParamsSchema),
  validateBody(createAssessmentSchema),
  trainingController.createAssessment
);

router.get('/assessments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(assessmentQuerySchema),
  trainingController.getAssessments
);

router.get('/assessments/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(assessmentParamsSchema),
  trainingController.getAssessmentById
);

router.put('/assessments/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(assessmentParamsSchema),
  validateBody(updateAssessmentSchema),
  trainingController.updateAssessment
);

router.delete('/assessments/:id',
  authorize(UserRole.ADMIN),
  validateParams(assessmentParamsSchema),
  trainingController.deleteAssessment
);

router.get('/assessments/:id/attempts',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(assessmentParamsSchema),
  validateQuery(assessmentAttemptQuerySchema),
  trainingController.getAssessmentAttempts
);

router.post('/assessments/:id/attempt',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(assessmentParamsSchema),
  validateBody(submitAssessmentSchema),
  trainingController.startAssessmentAttempt
);

router.post('/assessments/attempts/:attemptId/submit',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(assessmentAttemptParamsSchema),
  validateBody(submitAssessmentSchema),
  trainingController.submitAssessmentAttempt
);

router.post('/assessments/attempts/:attemptId/grade',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(assessmentAttemptParamsSchema),
  validateBody(gradeAssessmentSchema),
  trainingController.gradeAssessmentAttempt
);

router.get('/enrollments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(enrollmentQuerySchema),
  trainingController.getEnrollments
);

router.post('/enrollments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createEnrollmentSchema),
  trainingController.createEnrollment
);

router.get('/enrollments/my-enrollments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(enrollmentQuerySchema),
  trainingController.getMyEnrollments
);

router.get('/enrollments/pending-approval',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(enrollmentQuerySchema),
  trainingController.getPendingApprovals
);

router.get('/enrollments/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(enrollmentParamsSchema),
  trainingController.getEnrollmentById
);

router.put('/enrollments/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(enrollmentParamsSchema),
  validateBody(updateEnrollmentSchema),
  trainingController.updateEnrollment
);

router.delete('/enrollments/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(enrollmentParamsSchema),
  trainingController.deleteEnrollment
);

router.post('/enrollments/:id/approve',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(enrollmentParamsSchema),
  trainingController.approveEnrollment
);

router.post('/enrollments/:id/reject',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(enrollmentParamsSchema),
  validateBody(rejectEnrollmentSchema),
  trainingController.rejectEnrollment
);

router.post('/enrollments/:id/withdraw',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(enrollmentParamsSchema),
  validateBody(withdrawEnrollmentSchema),
  trainingController.withdrawEnrollment
);

router.post('/enrollments/:id/complete',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(enrollmentParamsSchema),
  trainingController.completeEnrollment
);

router.get('/enrollments/:id/progress',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(enrollmentParamsSchema),
  trainingController.getEnrollmentProgress
);

router.get('/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(feedbackQuerySchema),
  trainingController.getFeedback
);

router.post('/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(submitFeedbackSchema),
  trainingController.submitFeedback
);

router.get('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  trainingController.getFeedbackById
);

router.put('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  validateBody(submitFeedbackSchema),
  trainingController.updateFeedback
);

router.delete('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  trainingController.deleteFeedback
);

router.get('/sessions/:id/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(trainingSessionParamsSchema),
  validateQuery(feedbackQuerySchema),
  trainingController.getSessionFeedback
);

router.get('/courses/:id/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(trainingCourseParamsSchema),
  validateQuery(feedbackQuerySchema),
  trainingController.getCourseFeedback
);

router.get('/certificates',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(certificateQuerySchema),
  trainingController.getCertificates
);

router.post('/certificates',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCertificateSchema),
  trainingController.createCertificate
);

router.get('/certificates/my-certificates',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(certificateQuerySchema),
  trainingController.getMyCertificates
);

router.get('/certificates/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(certificateParamsSchema),
  trainingController.getCertificateById
);

router.put('/certificates/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(certificateParamsSchema),
  validateBody(createCertificateSchema),
  trainingController.updateCertificate
);

router.delete('/certificates/:id',
  authorize(UserRole.ADMIN),
  validateParams(certificateParamsSchema),
  trainingController.deleteCertificate
);

router.post('/certificates/:id/issue',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(certificateParamsSchema),
  validateBody(issueCertificateSchema),
  trainingController.issueCertificate
);

router.post('/certificates/:id/revoke',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(certificateParamsSchema),
  validateBody(revokeCertificateSchema),
  trainingController.revokeCertificate
);

router.get('/certificates/:id/verify/:code',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(certificateParamsSchema),
  trainingController.verifyCertificate
);

router.get('/budgets',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(trainingBudgetQuerySchema),
  trainingController.getTrainingBudgets
);

router.post('/budgets',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createTrainingBudgetSchema),
  trainingController.createTrainingBudget
);

router.get('/budgets/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  trainingController.getTrainingBudgetById
);

router.put('/budgets/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  validateBody(updateTrainingBudgetSchema),
  trainingController.updateTrainingBudget
);

router.delete('/budgets/:id',
  authorize(UserRole.ADMIN),
  validateParams(trainingBudgetParamsSchema),
  trainingController.deleteTrainingBudget
);

router.get('/budgets/:id/expenses',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  trainingController.getBudgetExpenses
);

router.post('/budgets/:id/expenses',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  validateBody(addBudgetExpenseSchema),
  trainingController.addBudgetExpense
);

router.put('/budgets/expenses/:expenseId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  validateBody(updateBudgetExpenseSchema),
  trainingController.updateBudgetExpense
);

router.delete('/budgets/expenses/:expenseId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  trainingController.deleteBudgetExpense
);

router.get('/budgets/:id/utilization',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(trainingBudgetParamsSchema),
  trainingController.getBudgetUtilization
);

router.get('/reports/summary',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getTrainingSummaryReport
);

router.get('/reports/completion',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getCompletionReport
);

router.get('/reports/attendance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getAttendanceReport
);

router.get('/reports/assessment-results',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getAssessmentResultsReport
);

router.get('/reports/feedback-analysis',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getFeedbackAnalysisReport
);

router.get('/reports/skills-gap',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getSkillsGapReport
);

router.get('/reports/training-roi',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getTrainingROIReport
);

router.get('/reports/budget-utilization',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getBudgetUtilizationReport
);

router.get('/reports/employee-training-history',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getEmployeeTrainingHistory
);

router.get('/reports/compliance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getComplianceReport
);

router.get('/reports/certification-status',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(trainingReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  trainingController.getCertificationStatusReport
);

router.post('/bulk/enroll',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkEnrollSchema),
  trainingController.bulkEnroll
);

router.post('/bulk/attendance',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkAttendanceSchema),
  trainingController.bulkMarkAttendance
);

router.post('/bulk/assessment-grade',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkGradeSchema),
  trainingController.bulkGradeAssessments
);

router.post('/bulk/certificates/issue',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkIssueCertificatesSchema),
  trainingController.bulkIssueCertificates
);

router.post('/bulk/sessions/create',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkCreateSessionsSchema),
  trainingController.bulkCreateSessions
);

export default router;