import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFound: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/10 text-rose-500">
        <AlertCircle className="h-10 w-10" />
      </div>
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">404 - Page Not Found</h1>
      <p className="mt-3 text-base text-slate-400 max-w-md">
        The page or resource you are trying to access does not exist or has been relocated.
      </p>
      <div className="mt-8">
        <Link to="/dashboard">
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 px-6 py-3 font-semibold">
            <ArrowLeft className="h-4 w-4" /> Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};
