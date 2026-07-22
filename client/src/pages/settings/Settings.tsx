import React from 'react';
import { Building, Bell } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export const Settings: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure organization profile, system defaults, notifications, and security policies.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Company Name
              </label>
              <Input defaultValue="HRFlow Pro Inc." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Tax Registration ID
              </label>
              <Input defaultValue="EIN-98472910" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Corporate Headquarters Address
            </label>
            <Input defaultValue="500 Market Street, Suite 1200, San Francisco, CA 94105" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            System Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Email notifications for Leave approvals</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Automated monthly payroll generation reminders</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="bg-indigo-600 text-white hover:bg-indigo-500">Save Configuration</Button>
      </div>
    </div>
  );
};
