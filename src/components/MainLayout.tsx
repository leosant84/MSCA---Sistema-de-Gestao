import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#F5F7FA] via-[#EEF2F6] to-[#E5EBF2] text-slate-800">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
