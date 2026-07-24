import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAnyRole, canAccessBranch, canAccessDepartment } from '../middleware/role.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import * as recruitmentSchemas from '../validators/recruitment.validator';
import * as recruitmentController from '../controllers/recruitment.controller';
import { UserRole } from '../models/User';

const {
  candidateQuerySchema,
  candidateParamsSchema,
  createCandidateSchema,
  updateCandidateSchema,
  jobPostingQuerySchema,
  jobPostingParamsSchema,
  createJobPostingSchema,
  updateJobPostingSchema,
  applicationQuerySchema,
  applicationParamsSchema,
  createApplicationSchema,
  updateApplicationStatusSchema,
  scheduleInterviewSchema,
  submitInterviewFeedbackSchema,
  createOfferSchema,
  updateOfferSchema,
  recruitmentStatsQuerySchema,
  createNoteSchema,
  addTagsSchema,
  createCommunicationSchema,
  uploadDocumentSchema,
  moveStageSchema,
  declineOfferSchema,
  convertToEmployeeSchema,
  screenApplicationSchema,
  rejectApplicationSchema,
  interviewQuerySchema,
  interviewParamsSchema,
  updateInterviewSchema,
  rescheduleInterviewSchema,
  cancelInterviewSchema,
  offerQuerySchema,
  offerParamsSchema,
  withdrawOfferSchema,
  bulkImportCandidatesSchema,
  bulkUpdateStatusSchema,
  bulkImportApplicationsSchema,
  bulkScheduleInterviewsSchema,
} = recruitmentSchemas;

const router = Router();

router.use(authenticate);

router.get('/candidates',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(candidateQuerySchema),
  recruitmentController.getCandidates
);

router.post('/candidates',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createCandidateSchema),
  recruitmentController.createCandidate
);

router.get('/candidates/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(candidateParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getCandidateById
);

router.put('/candidates/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(updateCandidateSchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.updateCandidate
);

router.delete('/candidates/:id',
  authorize(UserRole.ADMIN),
  validateParams(candidateParamsSchema),
  recruitmentController.deleteCandidate
);

router.get('/candidates/:id/timeline',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(candidateParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getCandidateTimeline
);

router.post('/candidates/:id/notes',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(createNoteSchema),
  recruitmentController.addCandidateNote
);

router.post('/candidates/:id/tags',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(addTagsSchema),
  recruitmentController.addCandidateTags
);

router.delete('/candidates/:id/tags/:tag',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  recruitmentController.removeCandidateTag
);

router.post('/candidates/:id/communications',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(createCommunicationSchema),
  recruitmentController.addCommunication
);

router.get('/candidates/:id/communications',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(candidateParamsSchema),
  recruitmentController.getCommunications
);

router.post('/candidates/:id/documents',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(uploadDocumentSchema),
  recruitmentController.uploadDocument
);

router.get('/candidates/:id/documents',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(candidateParamsSchema),
  recruitmentController.getDocuments
);

router.delete('/candidates/:id/documents/:documentId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  recruitmentController.deleteDocument
);

router.post('/candidates/:id/move-stage',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(moveStageSchema),
  recruitmentController.moveCandidateStage
);

router.post('/candidates/:id/schedule-interview',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(scheduleInterviewSchema),
  recruitmentController.scheduleInterview
);

router.post('/candidates/:id/submit-feedback',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(candidateParamsSchema),
  validateBody(submitInterviewFeedbackSchema),
  recruitmentController.submitInterviewFeedback
);

router.get('/candidates/:id/interviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(candidateParamsSchema),
  recruitmentController.getInterviews
);

router.post('/candidates/:id/extend-offer',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(createOfferSchema),
  recruitmentController.extendOffer
);

router.put('/candidates/:id/offers/:offerId',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(updateOfferSchema),
  recruitmentController.updateOffer
);

router.post('/candidates/:id/offers/:offerId/accept',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.EMPLOYEE),
  validateParams(candidateParamsSchema),
  recruitmentController.acceptOffer
);

router.post('/candidates/:id/offers/:offerId/decline',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.EMPLOYEE),
  validateParams(candidateParamsSchema),
  validateBody(declineOfferSchema),
  recruitmentController.declineOffer
);

router.get('/candidates/:id/offers',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(candidateParamsSchema),
  recruitmentController.getOffers
);

router.post('/candidates/:id/convert-to-employee',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(candidateParamsSchema),
  validateBody(convertToEmployeeSchema),
  recruitmentController.convertToEmployee
);

router.get('/candidates/stats/pipeline',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getPipelineStats
);

router.get('/candidates/stats/source',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getSourceStats
);

router.get('/candidates/stats/time-to-hire',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getTimeToHireStats
);

router.get('/candidates/stats/conversion',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getConversionStats
);

router.get('/job-postings',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(jobPostingQuerySchema),
  recruitmentController.getJobPostings
);

router.post('/job-postings',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(createJobPostingSchema),
  recruitmentController.createJobPosting
);

router.get('/job-postings/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(jobPostingParamsSchema),
  recruitmentController.getJobPostingById
);

router.put('/job-postings/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(jobPostingParamsSchema),
  validateBody(updateJobPostingSchema),
  recruitmentController.updateJobPosting
);

router.delete('/job-postings/:id',
  authorize(UserRole.ADMIN),
  validateParams(jobPostingParamsSchema),
  recruitmentController.deleteJobPosting
);

router.post('/job-postings/:id/publish',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(jobPostingParamsSchema),
  recruitmentController.publishJobPosting
);

router.post('/job-postings/:id/unpublish',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(jobPostingParamsSchema),
  recruitmentController.unpublishJobPosting
);

router.post('/job-postings/:id/close',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(jobPostingParamsSchema),
  recruitmentController.closeJobPosting
);

router.get('/job-postings/:id/applications',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(jobPostingParamsSchema),
  validateQuery(applicationQuerySchema),
  recruitmentController.getJobPostingApplications
);

router.get('/job-postings/:id/stats',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(jobPostingParamsSchema),
  recruitmentController.getJobPostingStats
);

router.post('/job-postings/:id/duplicate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(jobPostingParamsSchema),
  recruitmentController.duplicateJobPosting
);

router.get('/applications',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(applicationQuerySchema),
  recruitmentController.getApplications
);

router.post('/applications',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateBody(createApplicationSchema),
  recruitmentController.createApplication
);

router.get('/applications/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(applicationParamsSchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getApplicationById
);

router.put('/applications/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(applicationParamsSchema),
  validateBody(updateApplicationStatusSchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.updateApplication
);

router.delete('/applications/:id',
  authorize(UserRole.ADMIN),
  validateParams(applicationParamsSchema),
  recruitmentController.deleteApplication
);

router.post('/applications/:id/withdraw',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateParams(applicationParamsSchema),
  recruitmentController.withdrawApplication
);

router.post('/applications/:id/screen',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(applicationParamsSchema),
  validateBody(screenApplicationSchema),
  recruitmentController.screenApplication
);

router.post('/applications/:id/shortlist',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(applicationParamsSchema),
  recruitmentController.shortlistApplication
);

router.post('/applications/:id/reject',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(applicationParamsSchema),
  validateBody(rejectApplicationSchema),
  recruitmentController.rejectApplication
);

router.get('/interviews',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(interviewQuerySchema),
  recruitmentController.getInterviews
);

router.get('/interviews/upcoming',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD, UserRole.EMPLOYEE),
  validateQuery(interviewQuerySchema),
  recruitmentController.getUpcomingInterviews
);

router.get('/interviews/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(interviewParamsSchema),
  recruitmentController.getInterviewById
);

router.put('/interviews/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(interviewParamsSchema),
  validateBody(updateInterviewSchema),
  recruitmentController.updateInterview
);

router.post('/interviews/:id/reschedule',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(interviewParamsSchema),
  validateBody(rescheduleInterviewSchema),
  recruitmentController.rescheduleInterview
);

router.post('/interviews/:id/cancel',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(interviewParamsSchema),
  validateBody(cancelInterviewSchema),
  recruitmentController.cancelInterview
);

router.post('/interviews/:id/feedback',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(interviewParamsSchema),
  validateBody(submitInterviewFeedbackSchema),
  recruitmentController.submitInterviewFeedback
);

router.get('/interviews/:id/feedback',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(interviewParamsSchema),
  recruitmentController.getInterviewFeedback
);

router.post('/interviews/:id/feedback/consolidate',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(interviewParamsSchema),
  recruitmentController.consolidateFeedback
);

router.get('/offers',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(offerQuerySchema),
  recruitmentController.getOffers
);

router.get('/offers/:id',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateParams(offerParamsSchema),
  recruitmentController.getOfferById
);

router.put('/offers/:id',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(offerParamsSchema),
  validateBody(updateOfferSchema),
  recruitmentController.updateOffer
);

router.post('/offers/:id/send',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(offerParamsSchema),
  recruitmentController.sendOffer
);

router.post('/offers/:id/withdraw',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateParams(offerParamsSchema),
  validateBody(withdrawOfferSchema),
  recruitmentController.withdrawOffer
);

router.get('/reports/pipeline',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getPipelineReport
);

router.get('/reports/source-effectiveness',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getSourceEffectivenessReport
);

router.get('/reports/time-to-fill',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getTimeToFillReport
);

router.get('/reports/cost-per-hire',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getCostPerHireReport
);

router.get('/reports/offer-acceptance',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getOfferAcceptanceReport
);

router.get('/reports/interview-load',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPT_HEAD),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getInterviewLoadReport
);

router.get('/reports/diversity',
  requireAnyRole(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateQuery(recruitmentStatsQuerySchema),
  canAccessBranch,
  canAccessDepartment,
  recruitmentController.getDiversityReport
);

router.post('/bulk/candidates/import',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkImportCandidatesSchema),
  recruitmentController.bulkImportCandidates
);

router.post('/bulk/candidates/update-status',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkUpdateStatusSchema),
  recruitmentController.bulkUpdateCandidateStatus
);

router.post('/bulk/applications/import',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkImportApplicationsSchema),
  recruitmentController.bulkImportApplications
);

router.post('/bulk/interviews/schedule',
  authorize(UserRole.ADMIN, UserRole.HR_MANAGER),
  validateBody(bulkScheduleInterviewsSchema),
  recruitmentController.bulkScheduleInterviews
);

export default router;