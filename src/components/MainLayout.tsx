import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavbar } from './TopNavbar';

export const MainLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#F5F7FA] via-[#EEF2F6] to-[#E5EBF2] text-slate-800">
      <TopNavbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
};
