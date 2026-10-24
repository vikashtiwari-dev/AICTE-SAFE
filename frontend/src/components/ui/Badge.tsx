import React from 'react';

interface BadgeProps {
  status: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const getColors = () => {
    switch (status) {
      case 'Active':
      case 'Verified':
      case 'Approved':
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20';
      case 'Expiring Soon':
      case 'High':
        return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20';
      case 'Critical':
      case 'Discrepancy':
      case 'Rejected':
      case 'Cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20';
      case 'Matured':
        return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/20';
      case 'Renewed':
        return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-600/20';
      case 'Released':
        return 'bg-slate-50 text-slate-700 border-slate-200 ring-slate-600/20';
      case 'Pending Verification':
      case 'Pending':
      case 'Under Review':
      case 'Medium':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200 ring-yellow-600/20';
      case 'Low':
      case 'Unverified':
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200 ring-gray-600/20';
    }
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${getColors()} ${className}`}>
      {status}
    </span>
  );
};
