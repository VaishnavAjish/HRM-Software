import { Router } from 'express';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import branchRoutes from './branch.routes';
import attendanceRoutes from './attendance.routes';
import leaveRoutes from './leave.routes';
import payrollRoutes from './payroll.routes';
import recruitmentRoutes from './recruitment.routes';
import performanceRoutes from './performance.routes';
import trainingRoutes from './training.routes';
import appointmentRoutes from './appointment.routes';
import reportRoutes from './report.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/branches', branchRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/payroll', payrollRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/performance', performanceRoutes);
router.use('/training', trainingRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/reports', reportRoutes);

export default router;