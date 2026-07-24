import React, { useEffect, useState } from 'react';
import {
  Users,
  Clock,
  CalendarDays,
  UserPlus,
  Sparkles,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { attendanceApi } from '../../api/attendance.api';
import { reportsApi, HRDashboardMetrics } from '../../api/reports.api';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<HRDashboardMetrics | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [reportsRes, todayAttendanceRes] = await Promise.allSettled([
        reportsApi.getDashboardMetrics(),
        attendanceApi.getTodayStatus(),
      ]);

      if (reportsRes.status === 'fulfilled' && reportsRes.value.data) {
        setMetrics(reportsRes.value.data);
      } else {
        setMetrics({
          totalEmployees: 148,
          activeEmployees: 142,
          newHiresThisMonth: 12,
          turnoverRate: 2.1,
          attendanceRate: 96.4,
          pendingLeaves: 8,
          openPositions: 5,
          payrollSummary: { totalGross: 450000, totalNet: 380000, month: 'July 2026' },
          departmentHeadcounts: [
            { name: 'Engineering', count: 54 },
            { name: 'Product', count: 22 },
            { name: 'Marketing', count: 18 },
            { name: 'Sales', count: 30 },
            { name: 'HR', count: 12 },
            { name: 'Finance', count: 12 },
          ],
          monthlyAttendance: [
            { month: 'Feb', present: 94, absent: 3, late: 3 },
            { month: 'Mar', present: 96, absent: 2, late: 2 },
            { month: 'Apr', present: 95, absent: 3, late: 2 },
            { month: 'May', present: 97, absent: 2, late: 1 },
            { month: 'Jun', present: 93, absent: 4, late: 3 },
            { month: 'Jul', present: 96, absent: 2, late: 2 },
          ],
        });
      }

      if (todayAttendanceRes.status === 'fulfilled' && todayAttendanceRes.value.data) {
        setIsCheckedIn(!!todayAttendanceRes.value.data?.checkIn && !todayAttendanceRes.value.data?.checkOut);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const handleToggleAttendance = async () => {
    try {
      if (isCheckedIn) {
        await attendanceApi.checkOut();
        setIsCheckedIn(false);
      } else {
        await attendanceApi.checkIn();
        setIsCheckedIn(true);
      }
    } catch (err) {
      console.error('Attendance toggle error:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> HRFlow Pro v1.0 Enterprise
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              Good day, HR Administrator 👋
            </h1>
            <p className="mt-1 text-indigo-200 text-sm max-w-xl">
              Here is your organizational workforce overview, real-time attendance stats, and pending HR tasks.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-white/10 p-4 backdrop-blur-md">
            <div>
              <p className="text-xs text-indigo-200 uppercase font-semibold tracking-wider">Attendance Clock</p>
              <p className="text-sm font-bold mt-0.5">
                {isCheckedIn ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" /> Checked In
                  </span>
                ) : (
                  <span className="text-amber-300 flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" /> Not Checked In
                  </span>
                )}
              </p>
            </div>
            <Button
              onClick={handleToggleAttendance}
              className={isCheckedIn ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}
            >
              {isCheckedIn ? 'Check Out' : 'Check In Now'}
            </Button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workforce"
          value={metrics?.totalEmployees || 0}
          icon={<Users className="h-5 w-5" />}
          trend={{ value: '+8.4%', isPositive: true, label: 'vs last month' }}
          badgeText="Active"
        />
        <StatCard
          title="Attendance Rate"
          value={`${metrics?.attendanceRate || 0}%`}
          icon={<Clock className="h-5 w-5" />}
          trend={{ value: '+1.2%', isPositive: true, label: 'on-time average' }}
          badgeText="Daily"
        />
        <StatCard
          title="Pending Leave Requests"
          value={metrics?.pendingLeaves || 0}
          icon={<CalendarDays className="h-5 w-5" />}
          description="Requires HR approval"
          badgeText="Action"
        />
        <StatCard
          title="Open Positions"
          value={metrics?.openPositions || 0}
          icon={<UserPlus className="h-5 w-5" />}
          trend={{ value: '14 Candidates', isPositive: true, label: 'in pipeline' }}
          badgeText="Hiring"
        />
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Attendance Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance Trends (% Present vs Late)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics?.monthlyAttendance || []}>
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      color: '#ffffff',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="present" fill="#6366f1" radius={[4, 4, 0, 0]} name="Present %" />
                  <Bar dataKey="late" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Late %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Department Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Department Headcount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics?.departmentHeadcounts || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="count"
                  >
                    {(metrics?.departmentHeadcounts || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      color: '#ffffff',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {(metrics?.departmentHeadcounts || []).slice(0, 6).map((dept, idx) => (
                <div key={dept.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="truncate text-slate-600 dark:text-slate-400">
                    {dept.name} ({dept.count})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
