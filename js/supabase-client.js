const SUPABASE_URL = 'https://ttjgkfsrkxpxeufkikma.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0amdrZnNya3hweGV1Zmtpa21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODAxOTYsImV4cCI6MjEwNjM1NjE5Nn0.WeSQ17D0rjM_Jxltvy1X4sjeFG7lRtRDPUjcUdaw8Uk';

export const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) || null;

if (!supabase) {
  console.warn('Supabase client was not loaded. Add the Supabase CDN script before this file.');
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function getAdminStatus() {
  if (!supabase) return false;
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function submitApplication(payload) {
  if (!supabase) throw new Error('Supabase not configured');

  const reference = buildReference(payload.program_type);
  const { data, error } = await supabase
    .from('applications')
    .insert([
      {
        reference_number: reference,
        program_type: payload.program_type,
        applicant_name: payload.applicant_name,
        email: payload.email,
        phone: payload.phone,
        guardian_name: payload.guardian_name || null,
        guardian_phone: payload.guardian_phone || null,
        status: payload.program_type === 'college' ? 'waitlisted' : 'submitted',
        intake_year: payload.intake_year || new Date().getFullYear(),
        form_data: payload.form_data || {}
      }
    ])
    .select();

  if (error) throw error;
  return { ...data?.[0], reference_number: reference };
}

export async function subscribeNewsletter(payload) {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert([
      {
        full_name: payload.full_name,
        email: payload.email,
        interest_area: payload.interest_area || 'general',
        consent_given: true,
        status: 'active'
      }
    ]);

  if (error) throw error;
  return { email: payload.email.trim().toLowerCase() };
}

export async function fetchApplications(filters = {}) {
  if (!supabase) return [];
  let query = supabase.from('applications').select('*').order('submitted_at', { ascending: false });

  if (filters.program_type) {
    query = query.eq('program_type', filters.program_type);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function buildReference(programType) {
  const prefixMap = {
    shs: 'SHS',
    remedial: 'REM',
    college: 'COL'
  };

  const year = new Date().getFullYear();
  const random = Math.floor(10000 + Math.random() * 90000);
  return `LC-${year}-${prefixMap[programType] || 'APP'}-${random}`;
}
