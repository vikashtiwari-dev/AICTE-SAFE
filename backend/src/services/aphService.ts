/**
 * AICTE Approval Process Handbook (APH) Regulatory Compliance Rules Engine
 * Implements statutory norms for Security Deposit amounts, mandatory lock-in durations,
 * and release criteria across technical education disciplines.
 */

export interface APHRuleSpecification {
  programme: string;
  level: 'UG' | 'PG' | 'Diploma' | 'Integrated';
  base_deposit_inr: number;
  mandatory_lock_in_years: number;
  annual_inspection_required: boolean;
  interest_utilization_rule: string;
}

export const APH_PROGRAMME_NORMS: Record<string, APHRuleSpecification> = {
  'Engineering_UG': {
    programme: 'Engineering & Technology (Undergraduate)',
    level: 'UG',
    base_deposit_inr: 3500000, // 35 Lakhs
    mandatory_lock_in_years: 10,
    annual_inspection_required: true,
    interest_utilization_rule: 'Interest accrues to principal; no withdrawal permitted during lock-in.'
  },
  'Engineering_PG': {
    programme: 'Engineering & Technology (Postgraduate / M.Tech)',
    level: 'PG',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 8,
    annual_inspection_required: false,
    interest_utilization_rule: 'Interest accrues to principal.'
  },
  'Management_MBA_PGDM': {
    programme: 'Management (MBA / PGDM)',
    level: 'PG',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 10,
    annual_inspection_required: true,
    interest_utilization_rule: 'Annual interest may be utilized strictly for institutional infrastructure development with Council NOC.'
  },
  'Pharmacy_BPharm': {
    programme: 'Pharmacy (B.Pharm)',
    level: 'UG',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 10,
    annual_inspection_required: true,
    interest_utilization_rule: 'Cumulative lock-in with AICTE joint lien.'
  },
  'Architecture_BArch': {
    programme: 'Architecture (B.Arch)',
    level: 'UG',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 10,
    annual_inspection_required: false,
    interest_utilization_rule: 'Interest accrues to deposit principal.'
  },
  'Polytechnic_Diploma': {
    programme: 'Polytechnic Diploma in Engineering',
    level: 'Diploma',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 10,
    annual_inspection_required: false,
    interest_utilization_rule: 'Subject to State DTE & AICTE joint lien.'
  },
  'MCA': {
    programme: 'Master of Computer Applications (MCA)',
    level: 'PG',
    base_deposit_inr: 1500000, // 15 Lakhs
    mandatory_lock_in_years: 8,
    annual_inspection_required: false,
    interest_utilization_rule: 'Interest accrues to principal.'
  },
};

export interface APHCalculationInput {
  programme_key: string;
  is_women_institution?: boolean;
  is_minority_institution?: boolean;
  is_special_region?: boolean; // J&K, Ladakh, North-East, Island territories
  is_pwd_special?: boolean;
}

export function calculateRequiredDeposit(input: APHCalculationInput) {
  const norm = APH_PROGRAMME_NORMS[input.programme_key] || APH_PROGRAMME_NORMS['Engineering_UG'];
  let baseAmount = norm.base_deposit_inr;
  const applicableConcessions: string[] = [];

  if (input.is_pwd_special) {
    baseAmount = Math.round(baseAmount * 0.5);
    applicableConcessions.push('50% Concession for Divyang/PwD Focused Institution');
  } else {
    if (input.is_women_institution) {
      baseAmount = Math.round(baseAmount * 0.8);
      applicableConcessions.push('20% Statutory Concession for Exclusive Women Institution');
    }
    if (input.is_minority_institution) {
      baseAmount = Math.round(baseAmount * 0.8);
      applicableConcessions.push('20% Statutory Concession for Linguistic/Religious Minority Institution');
    }
    if (input.is_special_region) {
      baseAmount = Math.round(baseAmount * 0.8);
      applicableConcessions.push('20% Special Regional Rebate (J&K, Ladakh, NER, A&N)');
    }
  }

  return {
    programme: norm.programme,
    level: norm.level,
    base_statutory_amount: norm.base_deposit_inr,
    final_required_deposit: baseAmount,
    mandatory_lock_in_years: norm.mandatory_lock_in_years,
    applicable_concessions: applicableConcessions,
    interest_rule: norm.interest_utilization_rule
  };
}

/**
 * Validate an FDR's lock-in maturity status for release eligibility
 */
export function validateLockInEligibility(issueDate: string, lockInYears: number = 8) {
  const issue = new Date(issueDate);
  const now = new Date();
  const diffYears = (now.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const yearsRemaining = Math.max(0, lockInYears - diffYears);

  const eligibleForRelease = diffYears >= lockInYears;

  return {
    eligible_for_release: eligibleForRelease,
    years_served: parseFloat(diffYears.toFixed(2)),
    lock_in_mandatory_years: lockInYears,
    years_remaining: parseFloat(yearsRemaining.toFixed(2)),
    warning: eligibleForRelease
      ? null
      : `Instrument has completed only ${diffYears.toFixed(1)} years out of mandatory ${lockInYears} years lock-in. Premature release requires AICTE Executive Committee approval.`
  };
}

