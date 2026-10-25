import React, { useState } from 'react';
import api from '../../api/client';
import { Modal } from '../ui/Modal';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    window.open('/api/bulk/template', '_blank');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/bulk/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      if (res.data.success_count > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to process bulk CSV ingestion.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Batch Bulk Ingestion of Security Deposits & FDRs" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Upload multi-institution FDR records in bulk using standardized CSV formatting. The system automatically creates institutions, parses deposit values, validates issuing bank details, and initializes compliance countdowns.
        </p>

        {/* Template download banner */}
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-blue-900">Download Standard CSV Template</h4>
              <p className="text-[11px] text-blue-700">Pre-formatted with required headers and sample data</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Template</span>
          </button>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select CSV File</label>
            <input
              type="file"
              required
              accept=".csv"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Batch Processing Summary</span>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {result.success_count} / {result.total_rows} Ingested
                </span>
              </div>

              {result.error_count > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-rose-700 block">Row Validation Exceptions:</span>
                  <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] bg-white p-2.5 rounded border border-slate-200">
                    {result.errors.map((errItem: any, idx: number) => (
                      <div key={idx} className="text-rose-600">
                        • <strong>Row {errItem.row}:</strong> {errItem.fdr_number ? `[${errItem.fdr_number}] ` : ''}{errItem.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'Processing Batch...' : 'Upload & Ingest Records'}</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

