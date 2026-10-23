import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { sendViaGmail } from './smtp.ts';

const RESEND_URL = 'https://api.resend.com/emails';

export interface EmailResult {
  delivered: boolean;
  configured: boolean;
  error?: string;
}

/** Escape user-controlled strings interpolated into HTML emails. */
export function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Send a transactional email via Resend and record the delivery attempt.
 * Never throws — failures are captured in email_deliveries for retry.
 */
export async function sendEmail(
  admin: SupabaseClient,
  opts: {
    institutionId: string | null;
    notificationId?: string | null;
    to: string;
    subject: string;
    html: string;
  },
): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'Campflow <notifications@campflow.app>';

  const { data: delivery } = await admin
    .from('email_deliveries')
    .insert({
      institution_id: opts.institutionId,
      notification_id: opts.notificationId ?? null,
      recipient_email: opts.to,
      subject: opts.subject,
      status: 'pending',
      attempts: 1,
    })
    .select('id')
    .single();

  const finish = async (status: 'sent' | 'failed' | 'skipped', error?: string, providerId?: string) => {
    if (delivery?.id) {
      await admin
        .from('email_deliveries')
        .update({ status, error: error ?? null, provider_id: providerId ?? null, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', delivery.id);
    }
    return { delivered: status === 'sent', configured: !!apiKey, error };
  };

  if (apiKey) {
    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return finish('failed', `provider ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
      }
      return finish('sent', undefined, body.id);
    } catch (e) {
      return finish('failed', `network error: ${(e as Error).message}`);
    }
  }

  // Fallback: Gmail SMTP with an app password.
  if (Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) {
    const res = await sendViaGmail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return finish(res.ok ? 'sent' : 'failed', res.error, res.ok ? 'gmail-smtp' : undefined);
  }

  return finish('skipped', 'no email provider configured (RESEND_API_KEY or GMAIL_USER/GMAIL_APP_PASSWORD)');
}

export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden">
    <div style="background:#1e3a5f;color:#fff;padding:18px 24px;font-size:16px;font-weight:600">Campflow</div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:18px;color:#111827">${esc(title)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#374151">${bodyHtml}</div>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e4e7ec;font-size:12px;color:#9ca3af">
      This is an automated message from Campflow. Please do not reply.
    </div>
  </div></body></html>`;
}

export function ticketLink(path: string): string {
  const site = (Deno.env.get('SITE_URL') || 'http://localhost:5173').replace(/\/$/, '');
  return `${site}${path}`;
}
