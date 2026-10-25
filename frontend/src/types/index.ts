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
  deposit_type: 'FDR' | 'Security Deposit' | 'Bank Guarantee';
  purpose?: string;
  status: 'Active' | 'Expiring Soon' | 'Matured' | 'Renewed' | 'Released' | 'Cancelled' | 'Pending Verification';
  verification_status: 'Unverified' | 'Verified' | 'Discrepancy' | 'Pending';
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
  contact_person?: string;
  contact_email?: string;
  documents?: FDRDocument[];
  audit?: AuditLogEntry[];
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
  expiring_soon_fdrs?: number;
  discrepancy_count?: number;
  fdrs?: FDR[];
}

export interface InstitutionRequest {
  id: number;
  aicte_id: string;
  name: string;
  institution_type: string;
  state?: string;
  city?: string;
  address?: string;
  contact_person?: string;
  contact_email: string;
  contact_phone?: string;
  justification?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_at: string;
  reviewed_by?: number;
  reviewed_at?: string;
  reviewer_name?: string;
  remarks?: string;
}

export interface Alert {
  id: number;
  fdr_id: number;
  institution_id: number;
  institution_name?: string;
  aicte_id?: string;
  fdr_number?: string;
  bank_name?: string;
  deposit_amount?: number;
  maturity_date?: string;
  alert_type: 'Maturity' | 'Renewal' | 'Missing_Doc' | 'Discrepancy' | 'Overdue';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  message: string;
  due_date?: string;
  is_resolved: number;
  created_at: string;
  resolved_by_name?: string;
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
  request_type: 'Release' | 'Refund' | 'Discharge';
  reason: string;
  requested_by: number;
  requested_by_name?: string;
  requested_at: string;
  status: 'Pending' | 'Under Review' | 'Approved' | 'Rejected' | 'Completed';
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
  changed_by_role?: string;
  changed_at: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  notes?: string;
}

export interface DashboardSummary {
  total_fdrs: number;
  total_amount: number;
  active_count: number;
  expiring_soon_count: number;
  matured_count: number;
  renewed_count: number;
  released_count: number;
  pending_verification_count: number;
  discrepancy_count: number;
  unresolved_alerts_count: number;
  pending_releases_count: number;
}
