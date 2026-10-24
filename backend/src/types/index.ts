export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: 'admin' | 'bureau_officer' | 'institution_user' | 'viewer';
  institution_id?: number | null;
  is_active: number;
}

export interface FDR {
  id: number;
  institution_id: number;
  institution_name?: string;
  aicte_id?: string;
  fdr_number: string;
  bank_name: string;
  bank_branch?: string;
  account_number?: string;
  deposit_amount: number;
  currency: string;
  issue_date: string;
  maturity_date: string;
  interest_rate?: number;
  deposit_type: string;
  purpose?: string;
  status: string;
  verification_status: string;
  verification_notes?: string;
  submitted_by?: number;
  submitted_by_name?: string;
  verified_by?: number;
  verified_by_name?: string;
  submitted_at: string;
  last_updated_at?: string;
  remarks?: string;
  is_renewal: number;
  parent_fdr_id?: number | null;
  days_to_maturity?: number;
}

export interface Institution {
  id: number;
  aicte_id: string;
  name: string;
  address?: string;
  state?: string;
  city?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  institution_type?: string;
  created_at?: string;
  total_fdrs?: number;
  total_deposit_amount?: number;
  active_fdrs?: number;
}

export interface Alert {
  id: number;
  fdr_id: number;
  institution_id: number;
  institution_name?: string;
  fdr_number?: string;
  alert_type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  message: string;
  due_date?: string;
  is_resolved: number;
  created_at: string;
}

export interface ReleaseRequest {
  id: number;
  fdr_id: number;
  institution_id: number;
  fdr_number?: string;
  institution_name?: string;
  aicte_id?: string;
  bank_name?: string;
  deposit_amount?: number;
  request_type: string;
  reason: string;
  requested_by: number;
  requested_by_name?: string;
  requested_at: string;
  status: string;
  reviewed_by?: number;
  reviewed_by_name?: string;
  reviewed_at?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  remarks?: string;
}

export interface FDRDocument {
  id: number;
  fdr_id: number;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by?: number;
  uploaded_by_name?: string;
  uploaded_at: string;
  is_active: number;
}

export interface AuditLogEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  changed_by?: number;
  changed_by_name?: string;
  changed_at: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  notes?: string;
}
