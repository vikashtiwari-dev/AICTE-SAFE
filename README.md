# AICTE Security Deposit & FDR Management Portal (PS-26265)

A centralized, automated, and secure digital financial instrument management system developed for the **AICTE Regulation Bureau (Ministry of Education, Govt. of India)** to systematically manage Fixed Deposit Receipts (FDRs), Security Deposits, and Bank Guarantees throughout their regulatory lifecycle.

---

## 🏛️ Problem Statement & Objectives (SIH PS-26265)

Technical institutions applying for AICTE approval or maintaining ongoing technical programs are required to submit and maintain security deposits or FDRs as part of mandatory compliance and approval process handbooks (APH). Previously, these instruments were monitored via fragmented records, manual correspondence, and spreadsheets, causing:
- Risk of unnoticed maturity or lapse of guarantee validity
- Delays in renewal and lien discharge processing
- Inconsistent verification against issuing bank records
- High administrative burden on Council officers

**AICTE-SAFE** resolves these systemic bottlenecks through a unified, auditable, and automated digital architecture.

---

## 🚀 Key Functional Capabilities

1. **Centralized FDR Repository**:
   - Institutional & instrument-wise records with unique identifiers, issuing bank metadata, deposit value, maturity horizons, and regulatory statuses.
2. **Digital Document Storage & Private Scrutiny**:
   - Authenticated document streaming with institution-level clearance checks and strict binary file header (magic byte) validation. No public URL exposure.
3. **Automated Validity & Maturity Tracking**:
   - Automated timeline engine monitoring expiration windows (<10d critical, <30d high, <90d medium).
   - Vercel Cron Integration (`/api/alerts/cron-check`) ensuring scheduled daily compliance audits in serverless cloud environments.
4. **Honest AI Document Intelligence**:
   - Mathematical confidence scoring based strictly on authentic extracted tokens.
   - Zero fabricated financial values or placeholder amounts.
   - Explicit separation between declared amounts and extracted receipt data.
5. **Multi-Tier Maker-Checker Release Governance**:
   - Sequential stage gate (`Submitted` → `Dealing Assistant Scrutiny` → `Finance Officer Review` → `Director Approval` → `Bank Lien Discharged`).
   - Server-side enforcement preventing requester self-approval or skipping review stages.
6. **Executive Dashboard & Audit Reports**:
   - Aggregate financial liability metrics, status charts, institution-wise portfolios, and traceable tamper-proof audit trails.

---

## 🔍 Honest Integration & Verification Disclosure

To ensure complete credibility during Smart India Hackathon evaluation, the prototype explicitly distinguishes live integrations from prototype sandbox modules:

| Subsystem | Implementation Mode | Technical Details & Standard |
| :--- | :--- | :--- |
| **IFSC & Bank Directory** | **Authoritative National Lookup** | Validates 11-character format and checks prefix against official RBI Scheduled Commercial Banks directory. Rejects unrecognized banks. |
| **NeSL e-BG Verification** | **API Prototype Sandbox** | Validates e-stamping certificates and digital signatures against NeSL (National E-Governance Services Ltd) schema standards. |
| **SFMS Messaging** | **Standards-Compliant Engine** | Parses and generates Structured Financial Messaging System (`IFN 760COV`) messages with mandatory AICTE joint-lien clauses. |
| **OCR Document Extraction** | **Rule-Based Entity Extractor** | Parses raw document streams and applies regex token extractors. Missing fields remain `null`; confidence is calculated mathematically from evidence. |
| **Statutory Orders (Form A-D)** | **Cryptographic Order Attestation** | Generates statutory orders with QR verification codes and SHA-256 digital attestation hashes under Section 10(k) AICTE Act, 1987. |

---

## 🛡️ Security Architecture & DPDP Act 2023 Compliance

1. **Strict Fail-Closed Role-Based Access Control (RBAC)**:
   - `institution_user` accounts are locked to their own institution ID.
   - Creation, listing, document upload, and dispute replies automatically enforce institution ownership.
   - Fail-closed fallback: unassigned accounts receive `403 Forbidden` across all endpoints.
2. **Private Document Storage**:
   - Public static access to `/uploads` is disabled. All document access requires authenticated streaming via `/api/documents/stream/:id`.
   - Single-use 60-second view tokens (`POST /api/documents/:id/view-token`) protect against query-token leakage in browser histories.
3. **Binary File Header (Magic Byte) Validation**:
   - Rejects malicious executables or scripts masquerading as documents. Verifies authentic `%PDF`, `FF D8 FF` (JPEG), `89 50 4E 47` (PNG), and `PK\x03\x04` (DOCX).
4. **Data Protection (DPDP Act 2023)**:
   - Account numbers are masked (`•••• •••• 1234`) for non-oversight roles with eye-toggle reveals restricted to authorized Bureau Officers and Administrators.
5. **Hardened JWT Authentication**:
   - Ephemeral 256-bit cryptographic signing keys or environment variables. Zero predictable static fallback keys in production.

---

## 🛠️ Architecture & Tech Stack

- **Cloud Database**: Supabase PostgreSQL (`aws-0-ap-northeast-1.pooler.supabase.com:6543`) with transactional pooling and local caching.
- **Backend**: Node.js, Express, TypeScript, `pg` (PostgreSQL Client), `node:sqlite`.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS (Govt of India `#1e3a8a` navy theme), Lucide Icons, Recharts.
- **Serverless Automation**: Vercel Serverless Functions + Vercel Cron.

---

## 🔑 Pre-Configured Demo Credentials

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full system control, user management, and approval rights |
| **Regulation Bureau Officer** | `officer1` | `officer123` | Scrutiny review, verification confirmation, release approval |
| **Institution User (IIT Bombay)** | `inst_user1` | `admin123` | View own institution FDRs, submit renewals & release requests |
| **Audit Viewer** | `viewer1` | `viewer123` | Read-only access to audit logs and analytical reports |

---

## 🧪 Acceptance Test Suite (SIH 2024 Audit Verification)

### Test 1 — Fake FDR & Honest OCR
- **Action**: Upload an arbitrary or non-financial file to `/api/fdrs/ocr-extract`.
- **Result**: Confidence score evaluates to `0%`, missing fields are explicitly identified (`null`), and the document is marked `INSUFFICIENT_DATA_UNREADABLE`. Zero fabricated financial values are generated.

### Test 2 — Cross-Institution Isolation
- **Action**: Log in as `inst_user1` (IIT Bombay) and attempt to create an FDR or upload a document against IIT Delhi (`institution_id: 2`).
- **Result**: Backend rejects the attempt with `403 Forbidden` and forces records to bind strictly to IIT Bombay (`institution_id: 1`).

### Test 3 — Cloud Database Persistence
- **Action**: Create an FDR or resolve an alert, log out, sign in from a separate session or trigger a container restart.
- **Result**: Record is durably committed in Supabase PostgreSQL via `executeMutation` and remains fully intact.

### Test 4 — Idempotent Maturity Alerts
- **Action**: Trigger `/api/alerts/cron-check` repeatedly.
- **Result**: Scans 90, 30, and 10-day maturity windows. Subsequent executions yield `0 new alerts created`, preventing duplicate alert spam.

### Test 5 — Release Stage-Gate Control
- **Action**: Attempt to call `/complete` on a release request while it is still in `Submitted` or `Dealing_Officer` stage.
- **Result**: Backend rejects the transition with `400 Bad Request` (`Release Control Violation`), preserving the instrument status until formal Director Approval.

---

## ⚡ Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/vikashtiwari-dev/AICTE-SAFE.git
cd AICTE-SAFE

# 2. Setup backend
cd backend
npm install
npm run build
npm run dev
# Starts on http://localhost:3001

# 3. Setup frontend
cd ../frontend
npm install
npm run dev
# Starts on http://localhost:5173
```
