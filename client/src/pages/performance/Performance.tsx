import React, { useEffect, useState } from 'react';
import { Star, Target, Award, Plus } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { performanceApi } from '../../api/performance.api';
import { PerformanceReview } from '../../types/models';

export const Performance: React.FC = () => {
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    setIsLoading(true);
    try {
      const res = await performanceApi.getReviews();
      if (res.data) {
        setReviews(res.data);
      } else {
        setReviews(getMockReviews());
      }
    } catch {
      setReviews(getMockReviews());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockReviews = (): PerformanceReview[] => [
    {
      id: 'pr-1',
      employeeId: 'EMP-1001',
      reviewerId: 'rev-1',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      status: 'completed',
      overallRating: 4.8,
      goals: [
        {
          id: 'g-1',
          title: 'Migrate Core Backend to TypeScript',
          weight: 40,
          targetDate: '2026-06-30',
          status: 'completed',
          progress: 100,
        },
      ],
      competencies: [],
      strengths: 'Exceptional architectural foresight and code quality.',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'pr-2',
      employeeId: 'EMP-1002',
      reviewerId: 'rev-1',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      status: 'in-progress',
      overallRating: 4.2,
      goals: [],
      competencies: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  const getStatusBadge = (status: PerformanceReview['status']) => {
    const map: Record<PerformanceReview['status'], { variant: BadgeVariant; label: string }> = {
      draft: { variant: 'neutral', label: 'Draft' },
      'in-progress': { variant: 'warning', label: 'In Progress' },
      completed: { variant: 'success', label: 'Completed' },
      acknowledged: { variant: 'info', label: 'Acknowledged' },
    };
    const item = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Performance & Goals</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Conduct performance reviews, track OKRs/goals, and assess competencies.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md">
          <Plus className="h-4 w-4" /> Start Review Cycle
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Company Performance Score</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">4.6 / 5.0</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">H1 2026 Evaluation</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-500">
              <Star className="h-6 w-6 fill-current" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Company Goal Completion</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">88%</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">On Track</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Target className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Reviews Completed</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">142 / 148</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">95.9% Finalized</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Award className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews Table */}
      <Table
        isLoading={isLoading}
        data={reviews}
        keyExtractor={(r) => r.id}
        columns={[
          {
            header: 'Employee ID',
            accessorKey: 'employeeId',
          },
          {
            header: 'Review Period',
            cell: (r) => `${r.periodStart} to ${r.periodEnd}`,
          },
          {
            header: 'Rating',
            cell: (r) => (
              <div className="flex items-center gap-1 font-bold text-amber-500">
                <Star className="h-4 w-4 fill-current" />
                <span>{r.overallRating || 'N/A'}</span>
              </div>
            ),
          },
          {
            header: 'Status',
            cell: (r) => getStatusBadge(r.status),
          },
          {
            header: 'Strengths / Notes',
            cell: (r) => <span className="text-xs text-slate-500 truncate max-w-xs">{r.strengths || 'Pending evaluation'}</span>,
          },
        ]}
      />
    </div>
  );
};
