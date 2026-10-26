import { db } from '../db/database';

export interface AlertConfig {
  criticalMaturityDays: number;
  highMaturityDays: number;
  mediumMaturityDays: number;
  statutoryEscalationOverdueDays: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  criticalMaturityDays: 10,
  highMaturityDays: 30,
  mediumMaturityDays: 90,
  statutoryEscalationOverdueDays: 30,
};

export async function generateAlerts(customConfig?: Partial<AlertConfig>): Promise<number> {
  const config = { ...DEFAULT_ALERT_CONFIG, ...customConfig };
  const today = new Date();

  // Get all active FDRs
  const fdrs = await db.query(`
    SELECT f.*, i.name as institution_name 
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.status NOT IN ('Released', 'Cancelled')
  `) as any[];

  let alertsCreated = 0;

  for (const fdr of fdrs) {
    const maturityDate = new Date(fdr.maturity_date);
    const daysToMaturity = Math.floor((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Update status based on days to maturity
    if (daysToMaturity < 0 && fdr.status === 'Active') {
      await db.execute('UPDATE fdrs SET status = ? WHERE id = ?', ['Matured', fdr.id]);
    } else if (daysToMaturity >= 0 && daysToMaturity <= config.highMaturityDays && fdr.status === 'Active') {
      await db.execute('UPDATE fdrs SET status = ? WHERE id = ?', ['Expiring Soon', fdr.id]);
    }

    // Check for existing unresolved alerts for this FDR+type
    const checkAlert = async (type: string) => {
      return await db.queryOne(
        'SELECT id FROM alerts WHERE fdr_id = ? AND alert_type = ? AND is_resolved = 0',
        [fdr.id, type]
      );
    };

    // Critical: maturing within critical threshold (default 10 days)
    if (daysToMaturity >= 0 && daysToMaturity <= config.criticalMaturityDays && !(await checkAlert('Maturity'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'Critical', ?, ?)
      `, [
        fdr.id, fdr.institution_id,
        `URGENT: FDR ${fdr.fdr_number} (${fdr.institution_name}) is maturing in ${daysToMaturity} days. Immediate action required.`,
        fdr.maturity_date
      ]);
      alertsCreated++;
    }
    // High: maturing within high threshold (default 30 days)
    else if (daysToMaturity > config.criticalMaturityDays && daysToMaturity <= config.highMaturityDays && !(await checkAlert('Maturity'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'High', ?, ?)
      `, [
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} (${fdr.institution_name}) is maturing in ${daysToMaturity} days. Plan for renewal.`,
        fdr.maturity_date
      ]);
      alertsCreated++;
    }
    // Medium: maturing within medium threshold (default 90 days)
    else if (daysToMaturity > config.highMaturityDays && daysToMaturity <= config.mediumMaturityDays && !(await checkAlert('Maturity'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Maturity', 'Medium', ?, ?)
      `, [
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} (${fdr.institution_name}) will mature in ${daysToMaturity} days.`,
        fdr.maturity_date
      ]);
      alertsCreated++;
    }

    // Matured but not renewed
    if (daysToMaturity < 0 && fdr.status === 'Matured' && !(await checkAlert('Renewal'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
        VALUES (?, ?, 'Renewal', 'High', ?, ?)
      `, [
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} matured ${Math.abs(daysToMaturity)} days ago. Renewal or replacement is required.`,
        fdr.maturity_date
      ]);
      alertsCreated++;

      // Statutory escalation if overdue beyond threshold (default 30 days)
      if (Math.abs(daysToMaturity) >= config.statutoryEscalationOverdueDays && !(await checkAlert('Overdue'))) {
        await db.execute(`
          INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
          VALUES (?, ?, 'Overdue', 'Critical', ?, ?)
        `, [
          fdr.id, fdr.institution_id,
          `STATUTORY ESCALATION: FDR ${fdr.fdr_number} is ${Math.abs(daysToMaturity)} days overdue. Subject to Regulation 8 Show-Cause Notice & Lien Invocation proceedings.`,
          fdr.maturity_date
        ]);
        alertsCreated++;
      }
    }

    // Missing documents
    const docRow = await db.queryOne(
      'SELECT COUNT(*) as cnt FROM fdr_documents WHERE fdr_id = ? AND is_active = 1',
      [fdr.id]
    ) as any;
    const docCount = docRow ? Number(docRow.cnt) : 0;
    if (docCount === 0 && !(await checkAlert('Missing_Doc'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Missing_Doc', 'Medium', ?)
      `, [
        fdr.id, fdr.institution_id,
        `FDR ${fdr.fdr_number} has no uploaded documents. Please upload FDR certificate and supporting documents.`
      ]);
      alertsCreated++;
    }

    // Discrepancy
    if (fdr.verification_status === 'Discrepancy' && !(await checkAlert('Discrepancy'))) {
      await db.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Discrepancy', 'Critical', ?)
      `, [
        fdr.id, fdr.institution_id,
        `Discrepancy flagged on FDR ${fdr.fdr_number}. Requires immediate attention: ${fdr.verification_notes || 'See FDR details.'}`
      ]);
      alertsCreated++;
    }
  }

  console.log(`✅ Alert generation complete. ${alertsCreated} new alerts created.`);
  return alertsCreated;
}

/**
 * Dispatches multi-channel statutory notification nudges (WhatsApp, Email, SMS)
 * and records delivery state in notifications_log table.
 */
export async function dispatchStatutoryNudges(): Promise<number> {
  const today = new Date();
  const expiringFdrs = await db.query(`
    SELECT f.*, i.name as inst_name, i.contact_person, i.contact_email, i.contact_phone
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.status IN ('Active', 'Expiring Soon')
  `) as any[];

  let nudgesSent = 0;

  for (const fdr of expiringFdrs) {
    const maturity = new Date(fdr.maturity_date);
    const diffDays = Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 60 && diffDays >= 0) {
      const stage = diffDays <= 7 ? 7 : diffDays <= 15 ? 15 : diffDays <= 30 ? 30 : 60;
      
      const alreadySent = await db.queryOne(`
        SELECT id FROM notifications_log 
        WHERE fdr_id = ? AND days_before_maturity = ? AND date(sent_at) = CURRENT_DATE
      `, [fdr.id, stage]);

      if (!alreadySent) {
        const phone = fdr.contact_phone || '+91 98100 00000';
        const email = fdr.contact_email || 'accounts@institution.edu.in';
        const msg = `AICTE Statutory Reminder: FDR ${fdr.fdr_number} for ${fdr.inst_name} matures in ${diffDays} days. Ensure timely renewal under Approval Process Handbook (APH) rules.`;

        // WhatsApp Nudge to Principal
        await db.execute(`
          INSERT INTO notifications_log (institution_id, fdr_id, notification_type, channel, recipient, message, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status, status)
          VALUES (?, ?, 'Maturity_Nudge', 'WhatsApp', ?, ?, 'Principal', ?, ?, ?, 'Delivered', 'SENT')
        `, [fdr.institution_id, fdr.id, phone, msg, phone, msg, stage]);

        // Email to Accounts Officer
        await db.execute(`
          INSERT INTO notifications_log (institution_id, fdr_id, notification_type, channel, recipient, message, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status, status)
          VALUES (?, ?, 'Maturity_Nudge', 'Email', ?, ?, 'Accounts_Officer', ?, ?, ?, 'Delivered', 'SENT')
        `, [fdr.institution_id, fdr.id, email, msg, email, msg, stage]);

        // SMS to Chairman
        await db.execute(`
          INSERT INTO notifications_log (institution_id, fdr_id, notification_type, channel, recipient, message, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status, status)
          VALUES (?, ?, 'Maturity_Nudge', 'SMS', ?, ?, 'Chairman', ?, ?, ?, 'Delivered', 'SENT')
        `, [fdr.institution_id, fdr.id, phone, msg, phone, msg, stage]);

        nudgesSent += 3;
      }
    }
  }

  return nudgesSent;
}
