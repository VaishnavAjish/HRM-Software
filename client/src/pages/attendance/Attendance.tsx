import React, { useEffect, useState } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { attendanceApi } from '../../api/attendance.api';
import { Attendance as AttendanceModel } from '../../types/models';

export const Attendance: React.FC = () => {
  const [logs, setLogs] = useState<AttendanceModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<AttendanceModel | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [historyRes, todayRes] = await Promise.allSettled([
        attendanceApi.getAll(),
        attendanceApi.getTodayStatus(),
      ]);

      if (historyRes.status === 'fulfilled' && historyRes.value.data) {
        setLogs(historyRes.value.data);
      } else {
        setLogs(getMockAttendance());
      }

      if (todayRes.status === 'fulfilled' && todayRes.value.data) {
        setTodayRecord(todayRes.value.data);
      }
    } catch {
      setLogs(getMockAttendance());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockAttendance = (): AttendanceModel[] => [
    {
      id: 'att-1',
      employeeId: 'EMP-1001',
      date: '2026-07-22',
      checkIn: '09:02 AM',
      checkOut: '05:30 PM',
      status: 'present',
      workHours: 8.5,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'att-2',
      employeeId: 'EMP-1002',
      date: '2026-07-22',
      checkIn: '09:45 AM',
      status: 'late',
      workHours: 7.7,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'att-3',
      employeeId: 'EMP-1003',
      date: '2026-07-22',
      status: 'absent',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const handleCheckIn = async () => {
    try {
      const res = await attendanceApi.checkIn();
      if (res.data) setTodayRecord(res.data);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckOut = async () => {
    try {
      const res = await attendanceApi.checkOut();
      if (res.data) setTodayRecord(res.data);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const isCheckedIn = !!todayRecord?.checkIn && !todayRecord?.checkOut;

  const getStatusBadge = (status: AttendanceModel['status']) => {
    const map: Record<AttendanceModel['status'], { variant: BadgeVariant; label: string }> = {
      present: { variant: 'success', label: 'Present' },
      late: { variant: 'warning', label: 'Late Arrival' },
      absent: { variant: 'error', label: 'Absent' },
      'half-day': { variant: 'warning', label: 'Half Day' },
      'on-leave': { variant: 'info', label: 'On Leave' },
      holiday: { variant: 'neutral', label: 'Holiday' },
    };
    const item = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Attendance Tracking</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time daily punch logs, work hours calculation, and history logs.
          </p>
        </div>
      </div>

      {/* Clock Widget Card */}
      <Card className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-none shadow-lg">
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 py-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-indigo-300 text-sm font-semibold">
              <Clock className="h-4 w-4" /> Today's Punch Clock ({new Date().toLocaleDateString()})
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-slate-400">Check In Time</p>
                <p className="text-lg font-bold text-emerald-400">
                  {todayRecord?.checkIn || 'Not Checked In'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Check Out Time</p>
                <p className="text-lg font-bold text-rose-400">
                  {todayRecord?.checkOut || 'Pending'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleCheckIn}
              disabled={isCheckedIn}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-medium"
            >
              <LogIn className="h-4 w-4" /> Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={!isCheckedIn}
              className="bg-rose-600 hover:bg-rose-500 text-white gap-2 font-medium"
            >
              <LogOut className="h-4 w-4" /> Check Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Table
        isLoading={isLoading}
        data={logs}
        keyExtractor={(item) => item.id}
        columns={[
          {
            header: 'Date',
            accessorKey: 'date',
          },
          {
            header: 'Check In',
            cell: (row) => row.checkIn || '—',
          },
          {
            header: 'Check Out',
            cell: (row) => row.checkOut || '—',
          },
          {
            header: 'Work Hours',
            cell: (row) => (row.workHours ? `${row.workHours} hrs` : '—'),
          },
          {
            header: 'Status',
            cell: (row) => getStatusBadge(row.status),
          },
        ]}
      />
    </div>
  );
};
