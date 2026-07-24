import React, { useEffect, useState } from 'react';
import { FileText, Play } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { payrollApi } from '../../api/payroll.api';
import { Payroll as PayrollModel } from '../../types/models';

export const Payroll: React.FC = () => {
  const [payrolls, setPayrolls] = useState<PayrollModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollModel | null>(null);

  useEffect(() => {
    fetchPayroll();
  }, []);

  const fetchPayroll = async () => {
    setIsLoading(true);
    try {
      const res = await payrollApi.getAll();
      if (res.data) {
        setPayrolls(res.data);
      } else {
        setPayrolls(getMockPayroll());
      }
    } catch {
      setPayrolls(getMockPayroll());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockPayroll = (): PayrollModel[] => [
    {
      id: 'p-1',
      employeeId: 'EMP-1001',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      basicSalary: 8500,
      allowances: [
        { id: 'a1', name: 'Housing', amount: 1500, isTaxable: true },
        { id: 'a2', name: 'Transport', amount: 500, isTaxable: false },
      ],
      deductions: [
        { id: 'd1', name: 'Tax', amount: 1200, isTaxable: false },
        { id: 'd2', name: 'Health Insurance', amount: 300, isTaxable: false },
      ],
      grossSalary: 10500,
      netSalary: 9000,
      status: 'paid',
      paidAt: '2026-07-28',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'p-2',
      employeeId: 'EMP-1002',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      basicSalary: 7000,
      allowances: [{ id: 'a1', name: 'Housing', amount: 1000, isTaxable: true }],
      deductions: [{ id: 'd1', name: 'Tax', amount: 900, isTaxable: false }],
      grossSalary: 8000,
      netSalary: 7100,
      status: 'processed',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const handleGenerateMonthlyPayroll = async () => {
    try {
      await payrollApi.generatePayroll({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      });
      fetchPayroll();
    } catch {
      fetchPayroll();
    }
  };

  const getStatusBadge = (status: PayrollModel['status']) => {
    const map: Record<PayrollModel['status'], { variant: BadgeVariant; label: string }> = {
      draft: { variant: 'neutral', label: 'Draft' },
      processed: { variant: 'warning', label: 'Processed' },
      paid: { variant: 'success', label: 'Paid' },
      cancelled: { variant: 'error', label: 'Cancelled' },
    };
    const item = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payroll & Form 16</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Process monthly salaries, view allowances, statutory deductions, and generate tax Form 16.
          </p>
        </div>
        <Button
          onClick={handleGenerateMonthlyPayroll}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md"
        >
          <Play className="h-4 w-4" /> Run Monthly Payroll
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Total Monthly Gross Payroll</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">$450,000</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">July 2026</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Total Statutory Tax Deducted</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">$68,500</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 font-medium">Tax Remitted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Net Disbursed Salary</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">$381,500</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">Direct Deposit Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Table
        isLoading={isLoading}
        data={payrolls}
        keyExtractor={(row) => row.id}
        columns={[
          {
            header: 'Employee ID',
            accessorKey: 'employeeId',
          },
          {
            header: 'Period',
            cell: (row) => `${row.periodStart} to ${row.periodEnd}`,
          },
          {
            header: 'Basic Salary',
            cell: (row) => `$${row.basicSalary.toLocaleString()}`,
          },
          {
            header: 'Gross Salary',
            cell: (row) => `$${row.grossSalary.toLocaleString()}`,
          },
          {
            header: 'Net Salary',
            cell: (row) => (
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                ${row.netSalary.toLocaleString()}
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (row) => getStatusBadge(row.status),
          },
          {
            header: 'Actions',
            cell: (row) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedPayslip(row)}
                className="gap-1.5 text-xs"
              >
                <FileText className="h-3.5 w-3.5" /> View Payslip
              </Button>
            ),
          },
        ]}
      />

      {/* Payslip Modal */}
      <Modal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        title="Official Salary Payslip"
      >
        {selectedPayslip && (
          <div className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">HRFlow Pro Inc.</p>
                <p className="text-xs text-slate-400">Employee ID: {selectedPayslip.employeeId}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Pay Period</p>
                <p className="font-medium">{selectedPayslip.periodStart} to {selectedPayslip.periodEnd}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-xs uppercase text-slate-400 mb-2">Earnings</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span>${selectedPayslip.basicSalary}</span>
                  </div>
                  {selectedPayslip.allowances.map((a) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.name}</span>
                      <span>${a.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-xs uppercase text-slate-400 mb-2">Deductions</h4>
                <div className="space-y-1 text-xs">
                  {selectedPayslip.deductions.map((d) => (
                    <div key={d.id} className="flex justify-between">
                      <span>{d.name}</span>
                      <span>${d.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between font-bold text-base">
              <span>Net Payable:</span>
              <span className="text-indigo-600 dark:text-indigo-400">${selectedPayslip.netSalary}</span>
            </div>

            <div className="pt-2 flex justify-end">
              <Button onClick={() => setSelectedPayslip(null)} className="bg-indigo-600 text-white">
                Download PDF Payslip
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
