import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { employeesApi } from '../../api/employees.api';
import { Employee } from '../../types/models';

export const Employees: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Form states
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newEmploymentType] = useState<'full-time' | 'part-time' | 'contract'>('full-time');

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const res = await employeesApi.getAll();
      if (res.data) {
        setEmployees(res.data);
      } else {
        setEmployees(getMockEmployees());
      }
    } catch {
      setEmployees(getMockEmployees());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockEmployees = (): Employee[] => [
    {
      id: 'emp-1',
      employeeId: 'EMP-1001',
      userId: 'user-1',
      user: {
        id: 'u-1',
        email: 'alex.morgan@company.com',
        firstName: 'Alex',
        lastName: 'Morgan',
        role: 'manager',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      },
      departmentId: 'dept-1',
      branchId: 'branch-1',
      position: 'Senior Software Engineer',
      employmentType: 'full-time',
      hireDate: '2023-01-15',
      salary: 115000,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'emp-2',
      employeeId: 'EMP-1002',
      userId: 'user-2',
      user: {
        id: 'u-2',
        email: 'sarah.jenkins@company.com',
        firstName: 'Sarah',
        lastName: 'Jenkins',
        role: 'hr',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      },
      departmentId: 'dept-2',
      branchId: 'branch-1',
      position: 'HR Operations Lead',
      employmentType: 'full-time',
      hireDate: '2022-06-01',
      salary: 92000,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeesApi.create({
        position: newPosition,
        employmentType: newEmploymentType,
      });
      setIsAddModalOpen(false);
      fetchEmployees();
    } catch {
      setIsAddModalOpen(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const fullName = `${emp.user?.firstName || ''} ${emp.user?.lastName || ''}`.toLowerCase();
    const pos = emp.position.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || pos.includes(query) || emp.employeeId.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Directory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage organization members, roles, positions, and details.
          </p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md"
        >
          <Plus className="h-4 w-4" /> Add New Employee
        </Button>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name, position, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Employees Table */}
      <Table
        isLoading={isLoading}
        data={filteredEmployees}
        keyExtractor={(emp) => emp.id}
        columns={[
          {
            header: 'Employee',
            cell: (emp) => (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                  {emp.user?.firstName?.[0] || 'E'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {emp.user?.firstName} {emp.user?.lastName}
                  </p>
                  <p className="text-xs text-slate-400">{emp.employeeId}</p>
                </div>
              </div>
            ),
          },
          {
            header: 'Position',
            accessorKey: 'position',
          },
          {
            header: 'Employment',
            cell: (emp) => (
              <Badge variant="info" className="capitalize">
                {emp.employmentType}
              </Badge>
            ),
          },
          {
            header: 'Status',
            cell: (emp) => (
              <Badge
                variant={emp.user?.status === 'active' ? 'success' : 'neutral'}
                className="capitalize"
              >
                {emp.user?.status || 'active'}
              </Badge>
            ),
          },
          {
            header: 'Hire Date',
            accessorKey: 'hireDate',
          },
          {
            header: 'Actions',
            cell: (emp) => (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/employees/${emp.id}`)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors"
                  title="View Details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Employee"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                First Name
              </label>
              <Input
                required
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Last Name
              </label>
              <Input
                required
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Email Address
            </label>
            <Input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="john.doe@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Job Position
            </label>
            <Input
              required
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              placeholder="Product Manager"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-500">
              Save Employee
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
