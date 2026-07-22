import React, { useState } from 'react';
import { Building2, Plus, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Department } from '../../types/models';

export const Departments: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([
    {
      id: 'dept-1',
      name: 'Engineering',
      description: 'Software development, DevOps, quality assurance, and architecture.',
      employeeCount: 54,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'dept-2',
      name: 'Product & Design',
      description: 'Product strategy, UX research, UI design, and analytics.',
      employeeCount: 22,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'dept-3',
      name: 'Human Resources',
      description: 'Talent acquisition, employee relations, payroll, and benefits.',
      employeeCount: 12,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'dept-4',
      name: 'Sales & Marketing',
      description: 'Brand awareness, digital growth, customer acquisition, and enterprise sales.',
      employeeCount: 48,
      createdAt: '',
      updatedAt: '',
    },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName) return;
    setDepartments([
      ...departments,
      {
        id: `dept-${Date.now()}`,
        name: deptName,
        description: deptDesc,
        employeeCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    setDeptName('');
    setDeptDesc('');
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Department Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize company departments, manager assignments, and headcounts.
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md"
        >
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <Card key={dept.id} className="hover:border-indigo-500/50 transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{dept.name}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 min-h-[40px]">
                {dept.description || 'No description provided.'}
              </p>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                  <Users className="h-4 w-4 text-slate-400" />
                  {dept.employeeCount} Members
                </span>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Active
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create Department">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Department Name
            </label>
            <Input
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="e.g. Legal & Compliance"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Description
            </label>
            <Input
              value={deptDesc}
              onChange={(e) => setDeptDesc(e.target.value)}
              placeholder="Brief description of department scope..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-500">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
