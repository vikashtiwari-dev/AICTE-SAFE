import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { FDR, Institution } from '../../types';
import { Sparkles, CheckCircle2, ShieldCheck, Upload, AlertCircle, Building2 } from 'lucide-react';

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
  
  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState<string | null>(null);

  // IFSC validation state
  const [ifscCode, setIfscCode] = useState('SBIN0001234');
  const [ifscLoading, setIfscLoading] = useState(false);
  const [ifscResult, setIfscResult] = useState<any>(null);

  // NeSL e-BG state
  const [neslId, setNeslId] = useState('NESL-MH-2024-8899');
  const [neslLoading, setNeslLoading] = useState(false);
  const [neslResult, setNeslResult] = useState<any>(null);

  const handleValidateNeSL = async () => {
    if (!neslId) return;
    setNeslLoading(true);
    try {
      const res = await api.post('/fdrs/verify-nesl', {
        nesl_identifier: neslId,
        deposit_amount: watch('deposit_amount') ? parseFloat(watch('deposit_amount') as any) : 5000000,
        bank_name: watch('bank_name') || 'State Bank of India'
      });
      setNeslResult(res.data);
    } catch (err) {
      setNeslResult({ verified: false, message: 'NeSL authentication service error' });
    } finally {
      setNeslLoading(false);
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
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

  const handleOcrScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrSuccess(null);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/fdrs/ocr-extract', formData);
      const data = res.data;

      setValue('fdr_number', data.fdr_number);
      setValue('bank_name', data.bank_name);
      setValue('bank_branch', data.bank_branch);
      setValue('account_number', data.account_number);
      setValue('deposit_amount', data.deposit_amount);
      setValue('issue_date', data.issue_date);
      setValue('maturity_date', data.maturity_date);
      setValue('interest_rate', data.interest_rate);
      setValue('purpose', 'Mandatory AICTE Regulatory Security Deposit (AI OCR Extracted)');

      setIfscCode(data.ifsc_code);
      setOcrSuccess(`AI OCR extracted instrument details (${data.confidence_score}% confidence) for ${data.bank_name}. Fields pre-filled.`);
    } catch (err: any) {
      setError('AI OCR extraction failed. Please enter the values manually.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleValidateIfsc = async () => {
    if (!ifscCode || ifscCode.length < 5) return;
    setIfscLoading(true);
    try {
      const res = await api.get(`/fdrs/validate-ifsc/${ifscCode}`);
      setIfscResult(res.data);
      if (res.data.valid) {
        setValue('bank_name', res.data.bank_name);
        setValue('bank_branch', `${res.data.bank_branch}, ${res.data.city} (IFSC: ${res.data.ifsc})`);
      }
    } catch (err: any) {
      setIfscResult({ valid: false, error: 'Invalid IFSC code format.' });
    } finally {
      setIfscLoading(false);
    }
  };

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
      {/* AI OCR Extraction Section */}
      <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800">AI / Optical Character Recognition (OCR)</span>
              <p className="text-[11px] text-slate-500">Upload scanned FDR / Bank Guarantee to auto-extract details</p>
            </div>
          </div>
          <label className="cursor-pointer px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>{ocrLoading ? 'Extracting with AI...' : 'Scan FDR Certificate'}</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleOcrScan}
              disabled={ocrLoading}
              className="hidden"
            />
          </label>
        </div>

        {ocrSuccess && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{ocrSuccess}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
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
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:bg-slate-100"
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

      {/* NeSL Electronic Bank Guarantee (e-BG) Verification */}
      <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            NeSL Electronic Bank Guarantee (e-BG) & Digital Stamp Verification
          </label>
          <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100 px-2 py-0.5 rounded">
            RBI / DFS Mandated
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. NESL-MH-2024-8899"
            value={neslId}
            onChange={(e) => setNeslId(e.target.value.toUpperCase())}
            className="w-full px-3 py-1.5 border border-indigo-200 rounded-lg text-xs uppercase font-mono"
          />
          <button
            type="button"
            onClick={handleValidateNeSL}
            disabled={neslLoading}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            {neslLoading ? 'Authenticating...' : 'Verify NeSL'}
          </button>
        </div>

        {neslResult && neslResult.verified && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {neslResult.e_stamping_certificate}
              </span>
              <span>₹{neslResult.stamp_duty_paid} e-Stamp Duty Paid</span>
            </div>
            <p className="text-[10px] text-emerald-700 font-medium">
              Signed by: {neslResult.signer_name} • Certifying Authority: {neslResult.certifying_authority}
            </p>
          </div>
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
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            <option value="FDR">Fixed Deposit Receipt (FDR)</option>
            <option value="Security Deposit">Direct Security Deposit</option>
            <option value="Bank Guarantee">Bank Guarantee</option>
          </select>
        </div>
      </div>

      {/* RBI IFSC Verification */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <label className="block text-xs font-semibold text-slate-700">
          Issuing Bank Branch IFSC Verification (RBI Database)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. SBIN0001234 or PUNB0012345"
            value={ifscCode}
            onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs uppercase font-mono"
          />
          <button
            type="button"
            onClick={handleValidateIfsc}
            disabled={ifscLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            {ifscLoading ? 'Validating...' : 'Validate IFSC'}
          </button>
        </div>

        {ifscResult && ifscResult.valid && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              {ifscResult.bank_name} • {ifscResult.bank_branch}
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
              ✓ RBI Scheduled Bank
            </span>
          </div>
        )}
      </div>

      {/* NeSL Electronic Bank Guarantee (e-BG) Verification */}
      <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            NeSL Electronic Bank Guarantee (e-BG) & Digital Stamp Verification
          </label>
          <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100 px-2 py-0.5 rounded">
            RBI / DFS Mandated
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. NESL-MH-2024-8899"
            value={neslId}
            onChange={(e) => setNeslId(e.target.value.toUpperCase())}
            className="w-full px-3 py-1.5 border border-indigo-200 rounded-lg text-xs uppercase font-mono"
          />
          <button
            type="button"
            onClick={handleValidateNeSL}
            disabled={neslLoading}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shrink-0"
          >
            {neslLoading ? 'Authenticating...' : 'Verify NeSL'}
          </button>
        </div>

        {neslResult && neslResult.verified && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {neslResult.e_stamping_certificate}
              </span>
              <span>₹{neslResult.stamp_duty_paid} e-Stamp Duty Paid</span>
            </div>
            <p className="text-[10px] text-emerald-700 font-medium">
              Signed by: {neslResult.signer_name} • Certifying Authority: {neslResult.certifying_authority}
            </p>
          </div>
        )}
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
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Branch</label>
          <input
            type="text"
            placeholder="Branch name / IFSC"
            {...register('bank_branch')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
            placeholder="e.g. 5000000"
            {...register('deposit_amount', { required: 'Deposit amount is required', min: 1 })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account Number</label>
          <input
            type="text"
            placeholder="Linked A/C No."
            {...register('account_number')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Interest Rate (% p.a.)</label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 7.15"
            {...register('interest_rate')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
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
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Maturity / Expiry Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            {...register('maturity_date', { required: 'Maturity date is required' })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Regulatory Approval Purpose</label>
        <input
          type="text"
          placeholder="e.g. AICTE Mandatory Regulatory Reserve / Intake Expansion"
          {...register('purpose')}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-lg text-xs hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg text-xs hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
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
