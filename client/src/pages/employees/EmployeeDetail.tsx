import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { employeesApi } from '../../api/employees.api';
import { Employee } from '../../types/models';

export const EmployeeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (id) {
      fetchDetail(id);
    }
  }, [id]);

  const fetchDetail = async (empId: string) => {
    setIsLoading(true);
    try {
      const res = await employeesApi.getById(empId);
      if (res.data) {
        setEmployee(res.data);
      } else {
        setEmployee(getMockDetail(empId));
      }
    } catch {
      setEmployee(getMockDetail(empId));
    } finally {
      setIsLoading(false);
    }
  };

  const getMockDetail = (empId: string): Employee => ({
    id: empId,
    employeeId: 'EMP-1001',
    userId: 'u-1',
    user: {
      id: 'u-1',
      email: 'alex.morgan@company.com',
      firstName: 'Alex',
      lastName: 'Morgan',
      role: 'manager',
      status: 'active',
      phone: '+1 (555) 234-5678',
      createdAt: '',
      updatedAt: '',
    },
    departmentId: 'Engineering',
    branchId: 'HQ Branch',
    position: 'Senior Software Engineer',
    employmentType: 'full-time',
    hireDate: '2023-01-15',
    salary: 115000,
    bankDetails: {
      bankName: 'Chase Bank',
      accountNumber: '••••••••4829',
      routingNumber: '122000496',
      accountType: 'checking',
    },
    emergencyContact: {
      name: 'Claire Morgan',
      relationship: 'Spouse',
      phone: '+1 (555) 987-6543',
    },
    createdAt: '',
    updatedAt: '',
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/employees')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Directory
      </button>

      {/* Header Profile Summary */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg">
            {employee?.user?.firstName?.[0] || 'E'}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {employee?.user?.firstName} {employee?.user?.lastName}
              </h1>
              <Badge variant="success" className="capitalize">
                {employee?.user?.status || 'active'}
              </Badge>
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {employee?.position}
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
              ID: {employee?.employeeId}
            </p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal & Work Info */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-slate-500">Email Address</span>
              <span className="font-semibold text-slate-900 dark:text-white">{employee?.user?.email}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-slate-500">Phone Number</span>
              <span className="font-semibold text-slate-900 dark:text-white">{employee?.user?.phone || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-slate-500">Employment Type</span>
              <span className="font-semibold text-slate-900 dark:text-white capitalize">{employee?.employmentType}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-slate-500">Hire Date</span>
              <span className="font-semibold text-slate-900 dark:text-white">{employee?.hireDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Annual Base Salary</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                ${employee?.salary?.toLocaleString() || 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Financial & Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Bank & Emergency Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-400">
                Bank Details
              </h4>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
                <p className="font-medium text-slate-800 dark:text-slate-200">{employee?.bankDetails?.bankName}</p>
                <p className="text-xs text-slate-500">Account: {employee?.bankDetails?.accountNumber}</p>
                <p className="text-xs text-slate-500">Routing: {employee?.bankDetails?.routingNumber}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h4 className="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-400">
                Emergency Contact
              </h4>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {employee?.emergencyContact?.name} ({employee?.emergencyContact?.relationship})
                </p>
                <p className="text-xs text-slate-500">{employee?.emergencyContact?.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
