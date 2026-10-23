// register-institution
// Creates an institution + admin auth user + admin profile in one safe,
// idempotent workflow. Rolls everything back if any step fails.
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { emailLayout, esc, sendEmail, ticketLink } from '../_shared/email.ts';

const TYPES = ['school', 'college', 'university', 'institute', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${suffix}`;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid JSON body');
  }

  const name = String(body.institution_name ?? '').trim();
  const type = String(body.institution_type ?? '').trim();
  const officialEmail = String(body.official_email ?? '').trim().toLowerCase();
  const address = String(body.address ?? '').trim();
  const adminName = String(body.admin_full_name ?? '').trim();
  const adminEmail = String(body.admin_email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const terms = body.terms_accepted === true;

  const fieldErrors: Record<string, string> = {};
  if (name.length < 3 || name.length > 160) fieldErrors.institution_name = 'Institution name must be 3–160 characters.';
  if (!TYPES.includes(type)) fieldErrors.institution_type = 'Select a valid institution type.';
  if (!EMAIL_RE.test(officialEmail)) fieldErrors.official_email = 'Enter a valid official email.';
  if (address.length < 5) fieldErrors.address = 'Enter the institution address.';
  if (adminName.length < 2) fieldErrors.admin_full_name = 'Enter the administrator name.';
  if (!EMAIL_RE.test(adminEmail)) fieldErrors.admin_email = 'Enter a valid administrator email.';
  if (password.length < 8) fieldErrors.password = 'Password must be at least 8 characters.';
  if (!terms) fieldErrors.terms = 'You must accept the terms and privacy policy.';
  if (Object.keys(fieldErrors).length) return errorResponse('validation failed', 422, { field_errors: fieldErrors });

  const admin = adminClient();

  // Duplicate guards — idempotent retries return the original outcome instead
  // of creating a second institution.
  const { data: dup } = await admin
    .from('institutions')
    .select('id, name, official_email')
    .or(`name.ilike.${name},official_email.ilike.${officialEmail}`)
    .limit(1)
    .maybeSingle();
  if (dup) {
    return errorResponse(
      dup.official_email.toLowerCase() === officialEmail
        ? 'An institution with this official email already exists.'
        : 'An institution with this name already exists.',
      409,
    );
  }
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', adminEmail)
    .limit(1)
    .maybeSingle();
  if (existingProfile) return errorResponse('An account with this administrator email already exists.', 409);

  // 1. Create the auth user (unconfirmed → verification email required).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: false,
    user_metadata: { full_name: adminName },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'failed to create administrator account';
    return errorResponse(msg.includes('already') ? 'An account with this administrator email already exists.' : msg, 409);
  }
  const userId = created.user.id;

  const cleanup = async () => {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  };

  // 2. Institution row with a unique generated code.
  let institution: { id: string; institution_code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !institution; attempt++) {
    const { data, error } = await admin
      .from('institutions')
      .insert({
        name,
        institution_code: makeCode(name),
        institution_type: type,
        official_email: officialEmail,
        address,
        status: 'pending',
      })
      .select('id, institution_code')
      .single();
    if (!error && data) institution = data;
    else if (error && error.code !== '23505') {
      await cleanup();
      return errorResponse(`failed to create institution: ${error.message}`, 500);
    }
  }
  if (!institution) {
    await cleanup();
    return errorResponse('failed to allocate an institution code', 500);
  }

  // 3. Admin profile.
  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    institution_id: institution.id,
    full_name: adminName,
    email: adminEmail,
    role: 'admin',
    account_status: 'active',
  });
  if (profileErr) {
    await admin.from('institutions').delete().eq('id', institution.id);
    await cleanup();
    return errorResponse(`failed to create administrator profile: ${profileErr.message}`, 500);
  }

  // 4. Verification email. Prefer the configured transactional provider;
  //    fall back to Supabase Auth's own confirmation mail (client calls
  //    auth.resend) so registration never dead-ends.
  let verification: 'resend' | 'supabase' | 'none' = 'none';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: adminEmail,
    password,
    options: { redirectTo: ticketLink('/auth/callback') },
  });
  if (!linkErr && linkData?.properties?.action_link && Deno.env.get('RESEND_API_KEY')) {
    const res = await sendEmail(admin, {
      institutionId: institution.id,
      to: adminEmail,
      subject: 'Verify your Campflow administrator account',
      html: emailLayout(
        'Verify your email',
        `<p>Hi ${esc(adminName)},</p>
         <p>Your institution <strong>${esc(name)}</strong> (code <strong>${institution.institution_code}</strong>) has been registered on Campflow.</p>
         <p>Please verify your email to activate the institution:</p>
         <p><a href="${linkData.properties.action_link}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Verify email</a></p>
         <p>Your institution code is <strong>${institution.institution_code}</strong> — share it only with people you invite.</p>`,
      ),
    });
    verification = res.delivered ? 'resend' : 'none';
  }
  if (verification === 'none') verification = 'supabase';

  return jsonResponse({
    status: 'pending_verification',
    verification_channel: verification,
    institution: { id: institution.id, name, code: institution.institution_code },
    message:
      'Registration received. Verify the administrator email to activate the institution. ' +
      (verification === 'resend'
        ? 'A verification link was sent to the administrator email.'
        : 'Use the verification email sent by the authentication service.'),
  });
});
