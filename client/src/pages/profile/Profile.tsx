import React, { useState } from 'react';
import { UserCircle, Mail, Phone, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Account Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage your personal account credentials and security preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Personal Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">First Name</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Last Name</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email Address</label>
            <Input disabled value={user?.email || ''} icon={<Mail className="h-4 w-4 text-slate-400" />} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phone Number</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} icon={<Phone className="h-4 w-4 text-slate-400" />} />
          </div>

          <div className="flex justify-end pt-2">
            <Button className="bg-indigo-600 text-white hover:bg-indigo-500 gap-2">
              <Save className="h-4 w-4" /> Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
