import React, { useEffect, useState } from 'react';
import { UserPlus, Briefcase, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { recruitmentApi } from '../../api/recruitment.api';
import { Job, Candidate } from '../../types/models';

export const Recruitment: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'candidates'>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);

  // Form states
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('San Francisco, CA');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [jobsRes, candidatesRes] = await Promise.allSettled([
        recruitmentApi.getJobs(),
        recruitmentApi.getCandidates(),
      ]);

      if (jobsRes.status === 'fulfilled' && jobsRes.value.data) {
        setJobs(jobsRes.value.data);
      } else {
        setJobs(getMockJobs());
      }

      if (candidatesRes.status === 'fulfilled' && candidatesRes.value.data) {
        setCandidates(candidatesRes.value.data);
      } else {
        setCandidates(getMockCandidates());
      }
    } catch {
      setJobs(getMockJobs());
      setCandidates(getMockCandidates());
    } finally {
      setIsLoading(false);
    }
  };

  const getMockJobs = (): Job[] => [
    {
      id: 'j-1',
      title: 'Senior Frontend Engineer (React/TS)',
      departmentId: 'Engineering',
      branchId: 'HQ',
      description: 'Build robust enterprise UI features in React and TypeScript.',
      requirements: '5+ years React experience',
      responsibilities: 'Lead UI development',
      employmentType: 'full-time',
      experienceLevel: 'senior',
      currency: 'USD',
      location: 'Remote',
      isRemote: true,
      status: 'published',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'j-2',
      title: 'Technical Product Manager',
      departmentId: 'Product',
      branchId: 'HQ',
      description: 'Own enterprise product roadmap and work with cross-functional teams.',
      requirements: '4+ years PM experience',
      responsibilities: 'Product roadmap',
      employmentType: 'full-time',
      experienceLevel: 'mid',
      currency: 'USD',
      location: 'New York, NY',
      isRemote: false,
      status: 'published',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const getMockCandidates = (): Candidate[] => [
    {
      id: 'c-1',
      firstName: 'Emily',
      lastName: 'Watson',
      email: 'emily.watson@gmail.com',
      position: 'Senior Frontend Engineer',
      source: 'linkedin',
      status: 'interview',
      applications: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'c-2',
      firstName: 'Marcus',
      lastName: 'Vance',
      email: 'marcus.vance@yahoo.com',
      position: 'Technical Product Manager',
      source: 'referral',
      status: 'offer',
      applications: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await recruitmentApi.createJob({
        title: jobTitle,
        departmentId: 'Engineering',
        location,
        status: 'published',
      });
      setIsJobModalOpen(false);
      fetchData();
    } catch {
      setIsJobModalOpen(false);
    }
  };

  const getCandidateStatusBadge = (status: Candidate['status']) => {
    const map: Record<Candidate['status'], { variant: BadgeVariant; label: string }> = {
      new: { variant: 'info', label: 'New Applicant' },
      screening: { variant: 'purple', label: 'Screening' },
      interview: { variant: 'warning', label: 'Interviewing' },
      offer: { variant: 'success', label: 'Offer Extended' },
      hired: { variant: 'success', label: 'Hired' },
      rejected: { variant: 'error', label: 'Rejected' },
      withdrawn: { variant: 'neutral', label: 'Withdrawn' },
    };
    const item = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recruitment & Onboarding</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Publish job openings, manage candidate hiring pipelines, and onboard new hires.
          </p>
        </div>
        <Button
          onClick={() => setIsJobModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-md"
        >
          <Plus className="h-4 w-4" /> Post New Job Opening
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'jobs' | 'candidates')}
        tabs={[
          { id: 'jobs', label: 'Job Openings', count: jobs.length, icon: <Briefcase className="h-4 w-4" /> },
          { id: 'candidates', label: 'Candidate Pipeline', count: candidates.length, icon: <UserPlus className="h-4 w-4" /> },
        ]}
      />

      {/* Tab 1: Job Openings */}
      {activeTab === 'jobs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {jobs.map((job) => (
            <Card key={job.id} className="hover:border-indigo-500/50 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle>{job.title}</CardTitle>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                    {job.location} • {job.employmentType}
                  </p>
                </div>
                <Badge variant="success">Published</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">{job.description}</p>
                <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-400">
                  <span>Experience: {job.experienceLevel}</span>
                  <span>{job.isRemote ? 'Remote Friendly' : 'On-Site'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 2: Candidate Pipeline */}
      {activeTab === 'candidates' && (
        <Table
          isLoading={isLoading}
          data={candidates}
          keyExtractor={(c) => c.id}
          columns={[
            {
              header: 'Candidate',
              cell: (c) => (
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-slate-400">{c.email}</p>
                </div>
              ),
            },
            {
              header: 'Applied Position',
              accessorKey: 'position',
            },
            {
              header: 'Source',
              cell: (c) => <span className="capitalize">{c.source}</span>,
            },
            {
              header: 'Pipeline Stage',
              cell: (c) => getCandidateStatusBadge(c.status),
            },
          ]}
        />
      )}

      {/* Modal */}
      <Modal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} title="Post Job Opening">
        <form onSubmit={handleCreateJob} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Job Title</label>
            <Input required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior DevOps Specialist" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA or Remote" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsJobModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-500">
              Publish Job
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
