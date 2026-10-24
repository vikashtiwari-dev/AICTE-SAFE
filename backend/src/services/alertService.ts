import { db } from '../db/database';

export function generateAlerts() {
  const today = new Date();

  // Get all active FDRs
  const fdrs = db.prepare(`
    SELECT f.*, i.name as institution_name 
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.status NOT IN ('Released', 'Cancelled')
  `).all() as any[];

  let alertsCreated = 0;

  for (const fdr of fdrs) {
    const maturityDate = new Date(fdr.maturity_date);
    const daysToMaturity = Math.floor((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Update status based on days to maturity
    if (daysToMaturity < 0 && fdr.status === 'Active') {
      db.prepare('UPDATE fdrs SET status = ? WHERE id = ?').run('Matured', fdr.id);
    } else if (daysToMaturity >= 0 && daysToMaturity <= 30 && fdr.status === 'Active') {
      db.prepare('UPDATE fdrs SET status = ? WHERE id = ?').run('Expiring Soon', fdr.id);
    }

    // Check for existing unresolved alerts for this FDR+type
    const existingAlert = (type: string) => db.prepare(
      'SELECT id FROM alerts WHERE fdr_id = ? AND alert_type = ? AND is_resolved = 0'
    ).get(fdr.id, type);

    // Critical: maturing within 10 days
    if (daysToMaturity >= 0 && daysToMaturity <= 10 && !existingAlert('Maturity')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'Critical', ?, ?)
      `).run(
        fdr.id, fdr.institution_id,
        `URGENT: FDR ${fdr.fdr_number} (${fdr.institution_name}) is maturing in ${daysToMaturity} days. Immediate action required.`,
        fdr.maturity_date
      );
      alertsCreated++;
    }
    // High: maturing within 30 days
    else if (daysToMaturity > 10 && daysToMaturity <= 30 && !existingAlert('Maturity')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'High', ?, ?)
      `).run(
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} (${fdr.institution_name}) is maturing in ${daysToMaturity} days. Plan for renewal.`,
        fdr.maturity_date
      );
      alertsCreated++;
    }
    // Medium: maturing within 90 days
    else if (daysToMaturity > 30 && daysToMaturity <= 90 && !existingAlert('Maturity')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'Medium', ?, ?)
      `).run(
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} (${fdr.institution_name}) will mature in ${daysToMaturity} days.`,
        fdr.maturity_date
      );
      alertsCreated++;
    }

    // Matured but not renewed
    if (daysToMaturity < 0 && fdr.status === 'Matured' && !existingAlert('Renewal')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Renewal', 'High', ?, ?)
      `).run(
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} matured ${Math.abs(daysToMaturity)} days ago. Renewal or replacement is required.`,
        fdr.maturity_date
      );
      alertsCreated++;
    }

    // Missing documents
    const docCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM fdr_documents WHERE fdr_id = ? AND is_active = 1'
    ).get(fdr.id) as any).cnt;
    if (docCount === 0 && !existingAlert('Missing_Doc')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Missing_Doc', 'Medium', ?)
      `).run(
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} has no uploaded documents. Please upload FDR certificate and supporting documents.`
      );
      alertsCreated++;
    }

    // Discrepancy
    if (fdr.verification_status === 'Discrepancy' && !existingAlert('Discrepancy')) {
      db.prepare(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Discrepancy', 'Critical', ?)
      `).run(
        fdr.id, fdr.institution_id,
        `Discrepancy flagged on FDR ${fdr.fdr_number}. Requires immediate attention: ${fdr.verification_notes || 'See FDR details.'}`
      );
      alertsCreated++;
    }
  }

  console.log(`✅ Alert generation complete. ${alertsCreated} new alerts created.`);
  return alertsCreated;
}
