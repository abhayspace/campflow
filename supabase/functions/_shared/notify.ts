import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { emailLayout, esc, sendEmail, ticketLink } from './email.ts';

/**
 * Create an in-app notification and attempt an email delivery to the
 * recipient. Deduplicates on (recipient, dedup_key). Never throws.
 */
export interface NotifyOpts {
  institutionId: string;
  recipientId: string;
  complaintId?: string | null;
  type: string;
  title: string;
  message: string;
  emailSubject?: string;
  emailPath?: string;
  dedupKey?: string;
}

export async function notify(admin: SupabaseClient, opts: NotifyOpts): Promise<void> {
  try {
    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        institution_id: opts.institutionId,
        recipient_id: opts.recipientId,
        complaint_id: opts.complaintId ?? null,
        notification_type: opts.type,
        title: opts.title,
        message: opts.message,
        dedup_key: opts.dedupKey ?? null,
      })
      .select('id')
      .single();

    if (error) {
      // Unique-violation on dedup_key means an identical notification exists.
      if (error.code !== '23505') console.error('notify insert failed', error);
      return;
    }

    const { data: recipient } = await admin
      .from('profiles')
      .select('email, full_name, account_status')
      .eq('id', opts.recipientId)
      .single();

    if (!recipient || recipient.account_status !== 'active') return;

    const link = opts.emailPath ? ticketLink(opts.emailPath) : undefined;
    const body = `<p>Hi ${esc(recipient.full_name)},</p><p>${esc(opts.message)}</p>${
      link ? `<p><a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">View details</a></p>` : ''
    }`;

    await sendEmail(admin, {
      institutionId: opts.institutionId,
      notificationId: notification.id,
      to: recipient.email,
      subject: opts.emailSubject ?? opts.title,
      html: emailLayout(opts.title, body),
    });
  } catch (e) {
    console.error('notify failed', e);
  }
}

/** Notify every staff member of a department (head + teacher members). */
export async function notifyDepartmentStaff(
  admin: SupabaseClient,
  departmentId: string,
  opts: Omit<NotifyOpts, 'recipientId'>,
): Promise<void> {
  const { data: members } = await admin
    .from('department_members')
    .select('profile_id')
    .eq('department_id', departmentId)
    .in('membership_type', ['head', 'teacher']);
  const seen = new Set<string>();
  for (const m of members ?? []) {
    if (seen.has(m.profile_id)) continue;
    seen.add(m.profile_id);
    await notify(admin, { ...opts, recipientId: m.profile_id });
  }
}
