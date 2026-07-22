import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import * as performanceSchemas from '../validators/performance.validator';
import * as performanceController from '../controllers/performance.controller';
import { UserRole } from '../models/User';

const {
  reviewCycleQuerySchema,
  reviewCycleParamsSchema,
  createReviewCycleSchema,
  updateReviewCycleSchema,
  performanceReviewQuerySchema,
  performanceReviewParamsSchema,
  createPerformanceReviewSchema,
  updatePerformanceReviewSchema,
  submitSelfAssessmentSchema,
  submitManagerAssessmentSchema,
  finalizeReviewSchema,
  goalQuerySchema,
  goalParamsSchema,
  createGoalSchema,
  updateGoalSchema,
  goalProgressSchema,
  competencyQuerySchema,
  competencyParamsSchema,
  createCompetencySchema,
  updateCompetencySchema,
  competencyAssessmentSchema,
  developmentPlanQuerySchema,
  developmentPlanParamsSchema,
  createDevelopmentPlanSchema,
  updateDevelopmentPlanSchema,
  updateDevelopmentPlanProgressSchema,
  performanceReportQuerySchema,
  calibrationQuerySchema,
  calibrationParamsSchema,
  createCalibrationSessionSchema,
  updateCalibrationSessionSchema,
  submitCalibrationRatingSchema,
  okrQuerySchema,
  okrParamsSchema,
  createOKRSchema,
  updateOKRSchema,
  updateOKRProgressSchema,
  feedbackQuerySchema,
  feedbackParamsSchema,
  createFeedbackSchema,
  updateFeedbackSchema,
  acknowledgeFeedbackSchema,
  assignReviewersSchema,
  bulkCreateReviewsSchema,
  addReviewCommentSchema,
  alignGoalSchema,
  createCompetencyFrameworkSchema,
  addDevelopmentActivitySchema,
  completeDevelopmentActivitySchema,
  alignOKRSchema,
  createKeyResultSchema,
  keyResultParamsSchema,
  updateKeyResultSchema,
  requestFeedbackSchema,
  createFeedbackTemplateSchema,
  bulkCreateGoalsSchema,
  bulkSendFeedbackSchema,
} = performanceSchemas;

const router = Router();

router.use(authenticate);

router.get('/review-cycles',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(reviewCycleQuerySchema),
  performanceController.getReviewCycles
);

router.post('/review-cycles',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createReviewCycleSchema),
  performanceController.createReviewCycle
);

router.get('/review-cycles/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(reviewCycleParamsSchema),
  performanceController.getReviewCycleById
);

router.put('/review-cycles/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reviewCycleParamsSchema),
  validateBody(updateReviewCycleSchema),
  performanceController.updateReviewCycle
);

router.delete('/review-cycles/:id',
  authorize(UserRole.ADMIN),
  validateParams(reviewCycleParamsSchema),
  performanceController.deleteReviewCycle
);

router.post('/review-cycles/:id/launch',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reviewCycleParamsSchema),
  performanceController.launchReviewCycle
);

router.post('/review-cycles/:id/close',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reviewCycleParamsSchema),
  performanceController.closeReviewCycle
);

router.get('/review-cycles/:id/reviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(reviewCycleParamsSchema),
  validateQuery(performanceReviewQuerySchema),
  performanceController.getReviewCycleReviews
);

router.get('/review-cycles/:id/stats',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(reviewCycleParamsSchema),
  performanceController.getReviewCycleStats
);

router.post('/review-cycles/:id/assign-reviewers',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reviewCycleParamsSchema),
  validateBody(assignReviewersSchema),
  performanceController.assignReviewers
);

router.post('/review-cycles/:id/bulk-create-reviews',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(reviewCycleParamsSchema),
  validateBody(bulkCreateReviewsSchema),
  performanceController.bulkCreateReviews
);

router.get('/reviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(performanceReviewQuerySchema),
  performanceController.getPerformanceReviews
);

router.post('/reviews',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createPerformanceReviewSchema),
  performanceController.createPerformanceReview
);

router.get('/reviews/my-reviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(performanceReviewQuerySchema),
  performanceController.getMyReviews
);

router.get('/reviews/pending',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(performanceReviewQuerySchema),
  performanceController.getPendingReviews
);

router.get('/reviews/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(performanceReviewParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getPerformanceReviewById
);

router.put('/reviews/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(performanceReviewParamsSchema),
  validateBody(updatePerformanceReviewSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.updatePerformanceReview
);

router.delete('/reviews/:id',
  authorize(UserRole.ADMIN),
  validateParams(performanceReviewParamsSchema),
  performanceController.deletePerformanceReview
);

router.post('/reviews/:id/submit-self-assessment',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(performanceReviewParamsSchema),
  validateBody(submitSelfAssessmentSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.submitSelfAssessment
);

router.post('/reviews/:id/submit-manager-assessment',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(performanceReviewParamsSchema),
  validateBody(submitManagerAssessmentSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.submitManagerAssessment
);

router.post('/reviews/:id/finalize',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(performanceReviewParamsSchema),
  validateBody(finalizeReviewSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.finalizeReview
);

router.post('/reviews/:id/reopen',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(performanceReviewParamsSchema),
  performanceController.reopenReview
);

router.post('/reviews/:id/acknowledge',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(performanceReviewParamsSchema),
  performanceController.acknowledgeReview
);

router.get('/reviews/:id/history',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(performanceReviewParamsSchema),
  performanceController.getReviewHistory
);

router.post('/reviews/:id/comments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(performanceReviewParamsSchema),
  validateBody(addReviewCommentSchema),
  performanceController.addReviewComment
);

router.get('/goals',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(goalQuerySchema),
  performanceController.getGoals
);

router.post('/goals',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createGoalSchema),
  performanceController.createGoal
);

router.get('/goals/my-goals',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(goalQuerySchema),
  performanceController.getMyGoals
);

router.get('/goals/team-goals',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(goalQuerySchema),
  performanceController.getTeamGoals
);

router.get('/goals/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(goalParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getGoalById
);

router.put('/goals/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(goalParamsSchema),
  validateBody(updateGoalSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.updateGoal
);

router.delete('/goals/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(goalParamsSchema),
  performanceController.deleteGoal
);

router.post('/goals/:id/update-progress',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(goalParamsSchema),
  validateBody(goalProgressSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.updateGoalProgress
);

router.post('/goals/:id/align',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(goalParamsSchema),
  validateBody(alignGoalSchema),
  performanceController.alignGoal
);

router.get('/goals/:id/history',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(goalParamsSchema),
  performanceController.getGoalHistory
);

router.get('/competencies',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(competencyQuerySchema),
  performanceController.getCompetencies
);

router.post('/competencies',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCompetencySchema),
  performanceController.createCompetency
);

router.get('/competencies/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(competencyParamsSchema),
  performanceController.getCompetencyById
);

router.put('/competencies/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(competencyParamsSchema),
  validateBody(updateCompetencySchema),
  performanceController.updateCompetency
);

router.delete('/competencies/:id',
  authorize(UserRole.ADMIN),
  validateParams(competencyParamsSchema),
  performanceController.deleteCompetency
);

router.get('/competencies/frameworks',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  performanceController.getCompetencyFrameworks
);

router.post('/competencies/frameworks',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCompetencyFrameworkSchema),
  performanceController.createCompetencyFramework
);

router.post('/competencies/:id/assess',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(competencyParamsSchema),
  validateBody(competencyAssessmentSchema),
  performanceController.assessCompetency
);

router.get('/competencies/:id/assessments',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(competencyParamsSchema),
  performanceController.getCompetencyAssessments
);

router.get('/development-plans',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(developmentPlanQuerySchema),
  performanceController.getDevelopmentPlans
);

router.post('/development-plans',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createDevelopmentPlanSchema),
  performanceController.createDevelopmentPlan
);

router.get('/development-plans/my-plans',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(developmentPlanQuerySchema),
  performanceController.getMyDevelopmentPlans
);

router.get('/development-plans/team-plans',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(developmentPlanQuerySchema),
  performanceController.getTeamDevelopmentPlans
);

router.get('/development-plans/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(developmentPlanParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getDevelopmentPlanById
);

router.put('/development-plans/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(developmentPlanParamsSchema),
  validateBody(updateDevelopmentPlanSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.updateDevelopmentPlan
);

router.delete('/development-plans/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(developmentPlanParamsSchema),
  performanceController.deleteDevelopmentPlan
);

router.post('/development-plans/:id/update-progress',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(developmentPlanParamsSchema),
  validateBody(updateDevelopmentPlanProgressSchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.updateDevelopmentPlanProgress
);

router.post('/development-plans/:id/add-activity',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(developmentPlanParamsSchema),
  validateBody(addDevelopmentActivitySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.addDevelopmentActivity
);

router.post('/development-plans/:id/complete-activity',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(developmentPlanParamsSchema),
  validateBody(completeDevelopmentActivitySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.completeDevelopmentActivity
);

router.get('/reports/summary',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getPerformanceSummaryReport
);

router.get('/reports/ratings-distribution',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getRatingsDistributionReport
);

router.get('/reports/completion-status',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getCompletionStatusReport
);

router.get('/reports/goal-achievement',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getGoalAchievementReport
);

router.get('/reports/competency-gaps',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getCompetencyGapsReport
);

router.get('/reports/individual',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getIndividualPerformanceReport
);

router.get('/reports/team-comparison',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getTeamComparisonReport
);

router.get('/reports/high-performers',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getHighPerformersReport
);

router.get('/reports/improvement-needed',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(performanceReportQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  performanceController.getImprovementNeededReport
);

router.get('/calibration/sessions',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(calibrationQuerySchema),
  performanceController.getCalibrationSessions
);

router.post('/calibration/sessions',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCalibrationSessionSchema),
  performanceController.createCalibrationSession
);

router.get('/calibration/sessions/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  performanceController.getCalibrationSessionById
);

router.put('/calibration/sessions/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  validateBody(updateCalibrationSessionSchema),
  performanceController.updateCalibrationSession
);

router.delete('/calibration/sessions/:id',
  authorize(UserRole.ADMIN),
  validateParams(calibrationParamsSchema),
  performanceController.deleteCalibrationSession
);

router.post('/calibration/sessions/:id/start',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  performanceController.startCalibrationSession
);

router.post('/calibration/sessions/:id/complete',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  performanceController.completeCalibrationSession
);

router.get('/calibration/sessions/:id/reviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  performanceController.getCalibrationReviews
);

router.post('/calibration/sessions/:id/rate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  validateBody(submitCalibrationRatingSchema),
  performanceController.submitCalibrationRating
);

router.get('/calibration/sessions/:id/stats',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(calibrationParamsSchema),
  performanceController.getCalibrationStats
);

router.get('/okrs',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(okrQuerySchema),
  performanceController.getOKRs
);

router.post('/okrs',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateBody(createOKRSchema),
  performanceController.createOKR
);

router.get('/okrs/my-okrs',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(okrQuerySchema),
  performanceController.getMyOKRs
);

router.get('/okrs/team-okrs',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(okrQuerySchema),
  performanceController.getTeamOKRs
);

router.get('/okrs/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(okrParamsSchema),
  performanceController.getOKRById
);

router.put('/okrs/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(okrParamsSchema),
  validateBody(updateOKRSchema),
  performanceController.updateOKR
);

router.delete('/okrs/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(okrParamsSchema),
  performanceController.deleteOKR
);

router.post('/okrs/:id/update-progress',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(okrParamsSchema),
  validateBody(updateOKRProgressSchema),
  performanceController.updateOKRProgress
);

router.post('/okrs/:id/align',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(okrParamsSchema),
  validateBody(alignOKRSchema),
  performanceController.alignOKR
);

router.get('/okrs/:id/key-results',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(okrParamsSchema),
  performanceController.getKeyResults
);

router.post('/okrs/:id/key-results',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(okrParamsSchema),
  validateBody(createKeyResultSchema),
  performanceController.createKeyResult
);

router.put('/okrs/key-results/:keyResultId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(keyResultParamsSchema),
  validateBody(updateKeyResultSchema),
  performanceController.updateKeyResult
);

router.delete('/okrs/key-results/:keyResultId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(keyResultParamsSchema),
  performanceController.deleteKeyResult
);

router.get('/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(feedbackQuerySchema),
  performanceController.getFeedback
);

router.post('/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createFeedbackSchema),
  performanceController.createFeedback
);

router.get('/feedback/received',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(feedbackQuerySchema),
  performanceController.getReceivedFeedback
);

router.get('/feedback/given',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(feedbackQuerySchema),
  performanceController.getGivenFeedback
);

router.get('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  performanceController.getFeedbackById
);

router.put('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  validateBody(updateFeedbackSchema),
  performanceController.updateFeedback
);

router.delete('/feedback/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  performanceController.deleteFeedback
);

router.post('/feedback/:id/acknowledge',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  validateBody(acknowledgeFeedbackSchema),
  performanceController.acknowledgeFeedback
);

router.post('/feedback/:id/request-feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(feedbackParamsSchema),
  validateBody(requestFeedbackSchema),
  performanceController.requestFeedback
);

router.get('/feedback/templates',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  performanceController.getFeedbackTemplates
);

router.post('/feedback/templates',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createFeedbackTemplateSchema),
  performanceController.createFeedbackTemplate
);

router.post('/bulk/goals/create',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkCreateGoalsSchema),
  performanceController.bulkCreateGoals
);

router.post('/bulk/reviews/create',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkCreateReviewsSchema),
  performanceController.bulkCreateReviews
);

router.post('/bulk/feedback/send',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateBody(bulkSendFeedbackSchema),
  performanceController.bulkSendFeedback
);

export default router;