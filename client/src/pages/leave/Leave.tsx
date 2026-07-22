import React, { useEffect, useState } from 'react';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { leaveApi } from '../../api/leave.api';
import { Leave as LeaveModel } from '../../types/models';

export const Leave: React.FC = () => {
  const [leaves, setLeaves] = useState<LeaveModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);

  // Form
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const leavesRes = await leaveApi.getAll();
      if (leavesRes.data) {
        setLeaves(leavesRes.data);
      } else {
        setLeaves(getMockLeaves());
      }
    } catch {
      setLeaves(getMockLeaves());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockLeaves = (): LeaveModel[] => [
    {
      id: 'l-1',
      employeeId: 'EMP-1001',
      leaveTypeId: 'lt-1',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      totalDays: 5,
      reason: 'Annual family vacation',
      status: 'pending',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'l-2',
      employeeId: 'EMP-1002',
      leaveTypeId: 'lt-2',
      startDate: '2026-07-10',
      endDate: '2026-07-11',
      totalDays: 2,
      reason: 'Medical checkup',
      status: 'approved',
      approvedAt: '2026-07-09',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await leaveApi.applyLeave({
        startDate,
        endDate,
        reason,
        totalDays: 2,
      });
      setIsApplyModalOpen(false);
      fetchData();
    } catch {
      setIsApplyModalOpen(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await leaveApi.approveLeave(id);
      fetchData();
    } catch {
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'approved' } : l))
      );
    }
  };

  const handleReject = async (id: string) => {
    try {
      await leaveApi.rejectLeave(id, 'Not approved');
      fetchData();
    } catch {
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'rejected' } : l))
      );
    }
  };

  const getStatusBadge = (status: LeaveModel['status']) => {
    const map: Record<LeaveModel['status'], { variant: BadgeVariant; label: string }> = {
      pending: { variant: 'warning', label: 'Pending Approval' },
      approved: { variant: 'success', label: 'Approved' },
      rejected: { variant: 'error', label: 'Rejected' },
      cancelled: { variant: 'neutral', label: 'Cancelled' },
    };
    const item = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leave Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Submit leave requests, track entitlement balances, and approve applications.
          </p>
        </div>
        <Button
          onClick={() => setIsApplyModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md"
        >
          <Plus className="h-4 w-4" /> Apply For Leave
        </Button>
      </div>

      {/* Leave Balance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Annual Paid Leave</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">14 / 20 Days</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">6 Remaining</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Sick Leave</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">8 / 10 Days</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">2 Remaining</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Casual Leave</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">5 / 5 Days</p>
            <p className="text-xs text-slate-400 mt-2 font-medium">0 Remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Leave Applications Table */}
      <Table
        isLoading={isLoading}
        data={leaves}
        keyExtractor={(row) => row.id}
        columns={[
          {
            header: 'Employee ID',
            accessorKey: 'employeeId',
          },
          {
            header: 'Start Date',
            accessorKey: 'startDate',
          },
          {
            header: 'End Date',
            accessorKey: 'endDate',
          },
          {
            header: 'Days',
            cell: (row) => `${row.totalDays} days`,
          },
          {
            header: 'Reason',
            accessorKey: 'reason',
          },
          {
            header: 'Status',
            cell: (row) => getStatusBadge(row.status),
          },
          {
            header: 'Actions',
            cell: (row) => (
              row.status === 'pending' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(row.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg transition-colors"
                    title="Approve"
                  >
                    <CheckCircle className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleReject(row.id)}
                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                    title="Reject"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              ) : null
            ),
          },
        ]}
      />

      {/* Apply Modal */}
      <Modal isOpen={isApplyModalOpen} onClose={() => setIsApplyModalOpen(false)} title="Apply for Leave">
        <form onSubmit={handleApply} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Start Date</label>
              <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">End Date</label>
              <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Reason</label>
            <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for leave request..." />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsApplyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-500">
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
