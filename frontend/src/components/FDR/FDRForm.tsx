import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { FDR, Institution } from '../../types';

interface FDRFormProps {
  initialData?: Partial<FDR>;
  onSuccess: () => void;
  onCancel: () => void;
  isRenewal?: boolean;
}

export const FDRForm: React.FC<FDRFormProps> = ({
  initialData,
  onSuccess,
  onCancel,
  isRenewal = false,
}) => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      institution_id: initialData?.institution_id || '',
      fdr_number: isRenewal ? `${initialData?.fdr_number}-REN` : initialData?.fdr_number || '',
      bank_name: initialData?.bank_name || '',
      bank_branch: initialData?.bank_branch || '',
      account_number: initialData?.account_number || '',
      deposit_amount: initialData?.deposit_amount || '',
      issue_date: isRenewal ? new Date().toISOString().split('T')[0] : initialData?.issue_date || '',
      maturity_date: initialData?.maturity_date || '',
      interest_rate: initialData?.interest_rate || '',
      deposit_type: initialData?.deposit_type || 'FDR',
      purpose: isRenewal ? `Renewal of ${initialData?.fdr_number}` : initialData?.purpose || '',
      remarks: initialData?.remarks || '',
    },
  });

  useEffect(() => {
    api.get('/institutions').then((res) => setInstitutions(res.data)).catch(console.error);
  }, []);

  const onSubmit = async (data: any) => {
    setError('');
    setSubmitting(true);
    try {
      if (isRenewal && initialData?.id) {
        await api.post(`/fdrs/${initialData.id}/renew`, {
          ...data,
          deposit_amount: parseFloat(data.deposit_amount),
          interest_rate: data.interest_rate ? parseFloat(data.interest_rate) : null,
        });
      } else if (initialData?.id) {
        await api.put(`/fdrs/${initialData.id}`, {
          ...data,
          deposit_amount: parseFloat(data.deposit_amount),
          interest_rate: data.interest_rate ? parseFloat(data.interest_rate) : null,
        });
      } else {
        await api.post('/fdrs', {
          ...data,
          deposit_amount: parseFloat(data.deposit_amount),
          interest_rate: data.interest_rate ? parseFloat(data.interest_rate) : null,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Operation failed. Please review the inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {/* Institution selector */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Technical Institution <span className="text-rose-500">*</span>
        </label>
        <select
          disabled={isRenewal}
          {...register('institution_id', { required: 'Institution is required' })}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:bg-slate-100"
        >
          <option value="">Select Institution</option>
          {institutions.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.aicte_id} - {inst.name}
            </option>
          ))}
        </select>
        {errors.institution_id && (
          <span className="text-[11px] text-rose-500">{errors.institution_id.message as string}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            FDR / Instrument Reference No. <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. FDR-SBI-2024-9988"
            {...register('fdr_number', { required: 'Instrument number is required' })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          {errors.fdr_number && (
            <span className="text-[11px] text-rose-500">{errors.fdr_number.message as string}</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Deposit Instrument Type <span className="text-rose-500">*</span>
          </label>
          <select
            {...register('deposit_type', { required: true })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            <option value="FDR">Fixed Deposit Receipt (FDR)</option>
            <option value="Security Deposit">Direct Security Deposit</option>
            <option value="Bank Guarantee">Bank Guarantee</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Issuing Bank Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. State Bank of India"
            {...register('bank_name', { required: 'Bank name is required' })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          {errors.bank_name && (
            <span className="text-[11px] text-rose-500">{errors.bank_name.message as string}</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Branch</label>
          <input
            type="text"
            placeholder="Branch name / IFS code"
            {...register('bank_branch')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Deposit Principal Amount (₹) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            step="1000"
            placeholder="e.g. 2500000"
            {...register('deposit_amount', { required: 'Deposit amount is required', min: 1 })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          {errors.deposit_amount && (
            <span className="text-[11px] text-rose-500">{errors.deposit_amount.message as string}</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account Number</label>
          <input
            type="text"
            placeholder="Linked A/C No."
            {...register('account_number')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Interest Rate (% p.a.)</label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 7.10"
            {...register('interest_rate')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Date of Issue / Deposit <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            {...register('issue_date', { required: 'Issue date is required' })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          {errors.issue_date && (
            <span className="text-[11px] text-rose-500">{errors.issue_date.message as string}</span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Maturity / Expiry Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            {...register('maturity_date', { required: 'Maturity date is required' })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          {errors.maturity_date && (
            <span className="text-[11px] text-rose-500">{errors.maturity_date.message as string}</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Regulatory Approval Purpose</label>
        <input
          type="text"
          placeholder="e.g. New Institution Approval 2024-25 / Intake Expansion"
          {...register('purpose')}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Scrutiny / Administrative Remarks</label>
        <textarea
          rows={2}
          placeholder="Optional notes or instructions..."
          {...register('remarks')}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-lg text-sm hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
        >
          {submitting
            ? 'Submitting Record...'
            : isRenewal
            ? 'Submit Renewal Instrument'
            : initialData?.id
            ? 'Update FDR Record'
            : 'Register New FDR'}
        </button>
      </div>
    </form>
  );
};
