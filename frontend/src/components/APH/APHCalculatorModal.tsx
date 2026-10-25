import React, { useState } from 'react';
import api from '../../api/client';
import { Modal } from '../ui/Modal';
import { Calculator, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

interface APHCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDepositAmount?: number;
}

export const APHCalculatorModal: React.FC<APHCalculatorModalProps> = ({
  isOpen,
  onClose,
  currentDepositAmount,
}) => {
  const [programmeKey, setProgrammeKey] = useState('Engineering_UG');
  const [isWomen, setIsWomen] = useState(false);
  const [isMinority, setIsMinority] = useState(false);
  const [isSpecialRegion, setIsSpecialRegion] = useState(false);
  const [isPwd, setIsPwd] = useState(false);

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    try {
      setLoading(true);
      const res = await api.post('/fdrs/aph-calculate', {
        programme_key: programmeKey,
        is_women_institution: isWomen,
        is_minority_institution: isMinority,
        is_special_region: isSpecialRegion,
        is_pwd_special: isPwd
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      handleCalculate();
    }
  }, [isOpen, programmeKey, isWomen, isMinority, isSpecialRegion, isPwd]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AICTE Approval Process Handbook (APH) Statutory Calculator" maxWidth="max-w-2xl">
      <div className="space-y-5">
        <p className="text-xs text-slate-500">
          Compute mandatory security deposit amounts, statutory lock-in periods, and applicable council concessions in accordance with APH 2024-27 regulations.
        </p>

        {/* Input Controls */}
        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Technical Discipline & Level</label>
            <select
              value={programmeKey}
              onChange={(e) => setProgrammeKey(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-medium focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="Engineering_UG">Engineering & Technology (B.E. / B.Tech - UG)</option>
              <option value="Engineering_PG">Engineering & Technology (M.E. / M.Tech - PG)</option>
              <option value="Management_MBA_PGDM">Management (MBA / PGDM)</option>
              <option value="Pharmacy_BPharm">Pharmacy (B.Pharm - UG)</option>
              <option value="Architecture_BArch">Architecture (B.Arch - UG)</option>
              <option value="Polytechnic_Diploma">Polytechnic Diploma in Engineering</option>
              <option value="MCA">Master of Computer Applications (MCA)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Statutory Concessions & Category</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isWomen}
                  onChange={(e) => setIsWomen(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Exclusive Women's Institution (20% Concession)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isMinority}
                  onChange={(e) => setIsMinority(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Minority Institution (20% Concession)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isSpecialRegion}
                  onChange={(e) => setIsSpecialRegion(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Special Region (J&K, Ladakh, NER, A&N)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={isPwd}
                  onChange={(e) => setIsPwd(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Divyang / PwD Institution (50% Concession)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Calculation Result Card */}
        {result && (
          <div className="p-5 bg-white border-2 border-blue-600 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                  Mandatory Statutory Requirement
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  ₹{result.final_required_deposit.toLocaleString('en-IN')}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-400 block">Statutory Lock-in</span>
                <span className="text-sm font-bold text-slate-800">{result.mandatory_lock_in_years} Years Minimum</span>
              </div>
            </div>

            {/* Comparison against current deposit if supplied */}
            {currentDepositAmount !== undefined && (
              <div className="pt-2">
                {currentDepositAmount >= result.final_required_deposit ? (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Compliance Verified:</strong> Current deposit of ₹{currentDepositAmount.toLocaleString('en-IN')} satisfies the APH threshold of ₹{result.final_required_deposit.toLocaleString('en-IN')}.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      <strong>Compliance Shortfall:</strong> Current deposit of ₹{currentDepositAmount.toLocaleString('en-IN')} is short by ₹{(result.final_required_deposit - currentDepositAmount).toLocaleString('en-IN')} from the mandatory statutory norm.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-800 block">Applicable Provisions:</span>
              <p className="text-[11px] text-slate-500">• {result.interest_rule}</p>
              {result.applicable_concessions.map((c: string, idx: number) => (
                <p key={idx} className="text-[11px] text-emerald-700 font-medium">• {c}</p>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

