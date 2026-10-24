# AICTE Security Deposit & FDR Management Portal (PS-26265)

A centralized, automated, and secure digital management system developed for the **AICTE Regulation Bureau (Ministry of Education, Govt. of India)** to systematically manage Fixed Deposit Receipts (FDRs), Security Deposits, and Bank Guarantees throughout their regulatory lifecycle.

---

## 🏛️ Problem Statement Overview

Technical institutions applying for AICTE approval or running ongoing programs are required to submit and maintain security deposits or FDRs as part of mandatory compliance and approval process handbooks (APH). Previously, these instruments were monitored via fragmented records, manual correspondence, and spreadsheets, causing:
- Risk of unnoticed maturity or lapse of guarantee validity
- Delays in renewal and lien discharge processing
- Inconsistent verification against issuing bank records
- High administrative burden on Council officers

---

## 🚀 Key Functional Capabilities

1. **Centralized FDR Repository**:
   - Institutional & instrument-wise records with unique identifiers, issuing bank metadata, deposit value, maturity horizons, and regulatory statuses.
2. **Digital Document Storage & Scrutiny**:
   - Secure upload and archiving of bank FDR certificates, joint-lien endorsement letters, and verification correspondences.
3. **Automated Validity & Maturity Tracking**:
   - Automated timeline engine monitoring expiration windows (<10d critical, <30d high, <90d medium).
   - Advance reminders and notifications for renewal or replacement compliance.
4. **Discrepancy Identification**:
   - Separation between self-declared institutional entries and independently verified bank confirmations.
5. **Release & Refund Workflow**:
   - Multi-stage formal pipeline (*Pending Scrutiny → Under Review → Approved → Council Lien Discharged*).
6. **Executive Dashboard & Audit Reports**:
   - Aggregate financial liability metrics, status charts, institution-wise portfolios, and traceable tamper-proof audit trails.

---

## 🛠️ Architecture & Tech Stack

- **Backend**:
  - Node.js & Express with TypeScript
  - High-performance SQLite via `better-sqlite3` with Write-Ahead Logging (WAL)
  - JWT Role-Based Access Control (RBAC) supporting 4 distinct user tiers: `admin`, `bureau_officer`, `institution_user`, and `viewer`
  - Automated scheduling with `node-cron`
  - Secure file handling via `multer`
- **Frontend**:
  - React 18 with TypeScript & Vite
  - Tailwind CSS with an official Government of India portal theme (`#1e3a8a` navy)
  - Recharts for data visualization
  - React Router v6 & TanStack React Query

---

## 🔑 Pre-Configured Demo Credentials

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full system control, user management, and approval rights |
| **Regulation Bureau Officer** | `officer1` | `officer123` | Scrutiny review, verification confirmation, release approval |
| **Institution User (MIT Pune)** | `inst_user1` | `inst123` | View own institution FDRs, submit renewals & release requests |
| **Audit Viewer** | `viewer1` | `viewer123` | Read-only access to audit logs and analytical reports |

---

## ⚡ Quickstart Guide

### 1. Backend Setup & Seeding
```bash
cd backend
npm install
npx ts-node src/db/seed.ts
npm run dev
# Backend starts on http://localhost:3001
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Frontend starts on http://localhost:5173
```

Navigate to `http://localhost:5173` in your browser. Demo credentials can be clicked on the login screen for instant sign-in.
