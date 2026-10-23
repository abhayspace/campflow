import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { supabaseConfigured } from './lib/supabase';
import AppShell from './components/AppShell';
import { Card, CardBody, Spinner } from './components/ui';

import Landing from './pages/Landing';
import SignIn from './pages/auth/SignIn';
import RegisterInstitution from './pages/auth/RegisterInstitution';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import AuthCallback from './pages/auth/AuthCallback';
import AcceptInvite from './pages/auth/AcceptInvite';
import JoinInstitution from './pages/auth/JoinInstitution';
import VerifyEmail from './pages/auth/VerifyEmail';
import StatusPage from './pages/auth/StatusPage';

import StudentDashboard from './pages/student/StudentDashboard';
import NewComplaint from './pages/student/NewComplaint';
import MyTickets from './pages/student/MyTickets';
import StudentTicketDetail from './pages/student/TicketDetail';
import StudentUpdates from './pages/student/IncidentUpdates';
import Community from './pages/student/Community';
import CommunityDetail from './pages/student/CommunityDetail';
import { MySurveys, SurveyRespond } from './pages/student/MySurveys';

import CampusPulse from './pages/intelligence/CampusPulse';
import IncidentsList from './pages/intelligence/IncidentsList';
import IncidentDetail from './pages/intelligence/IncidentDetail';
import IncidentIntelligence from './pages/intelligence/IncidentIntelligence';
import VerificationQueue from './pages/intelligence/VerificationQueue';
import RecurrenceRadar from './pages/intelligence/RecurrenceRadar';
import Scorecard from './pages/intelligence/Scorecard';
import EscalationCenter from './pages/intelligence/EscalationCenter';

import StaffDashboard from './pages/staff/StaffDashboard';
import StaffQueue from './pages/staff/StaffQueue';
import StaffComplaintDetail from './pages/staff/ComplaintDetail';
import SurveyBuilder from './pages/staff/SurveyBuilder';
import { SurveysList, SurveyResults } from './pages/staff/Surveys';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/Users';
import AdminDepartments from './pages/admin/Departments';
import AdminRouting from './pages/admin/Routing';
import AdminComplaints from './pages/admin/Complaints';
import AdminJoinRequests from './pages/admin/JoinRequests';
import AdminSettings from './pages/admin/Settings';

import NotificationsPage from './pages/shared/NotificationsPage';
import ProfilePage from './pages/shared/ProfilePage';
import GeminiPage from './pages/assistant/GeminiPage';

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">{children}</div>;
}

function BootScreen() {
  return (
    <Centered>
      <Spinner className="h-8 w-8 text-brand-600" />
    </Centered>
  );
}

function MissingConfig() {
  return (
    <Centered>
      <Card className="max-w-md">
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold">Supabase is not configured</h1>
          <p className="text-sm text-slate-600">
            Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to{' '}
            <code className="rounded bg-slate-100 px-1">.env</code> and fill in{' '}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>, then restart the dev
            server. See the README for full setup steps.
          </p>
        </CardBody>
      </Card>
    </Centered>
  );
}

/** Signed-in routes. Verifies the real role from the database profile —
 *  whatever role tab was clicked on the sign-in page is never trusted. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, profile, needsSetup, institution } = useAuth();
  if (!ready) return <BootScreen />;
  if (!session) return <Navigate to="/signin" replace />;
  if (needsSetup) return <Navigate to="/auth/complete-setup" replace />;
  if (profile?.account_status === 'deactivated') {
    return <Navigate to="/account-deactivated" replace />;
  }
  if (institution && institution.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }
  return <>{children}</>;
}

function RequireRole({ role, children }: { role: string | string[]; children: ReactNode }) {
  const { profile } = useAuth();
  const roles = Array.isArray(role) ? role : [role];
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { ready, session, profile } = useAuth();
  if (!ready) return <BootScreen />;
  if (session && profile) {
    const dest = profile.role === 'admin' ? '/admin' : profile.role === 'teacher' ? '/staff' : '/student';
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  if (!supabaseConfigured) return <MissingConfig />;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/signin" element={<RedirectIfAuthed><SignIn /></RedirectIfAuthed>} />
            <Route path="/register" element={<RedirectIfAuthed><RegisterInstitution /></RedirectIfAuthed>} />
            <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />
            <Route path="/join" element={<JoinInstitution />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/accept-invite" element={<AcceptInvite />} />
            <Route path="/auth/verify" element={<VerifyEmail />} />
            <Route path="/pending" element={<StatusPage kind="pending" />} />
            <Route path="/unauthorized" element={<StatusPage kind="unauthorized" />} />
            <Route path="/account-deactivated" element={<StatusPage kind="deactivated" />} />

            {/* Authenticated shell */}
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/assistant" element={<GeminiPage />} />

              {/* Student */}
              <Route path="/student" element={<RequireRole role="student"><StudentDashboard /></RequireRole>} />
              <Route path="/student/new" element={<RequireRole role="student"><NewComplaint /></RequireRole>} />
              <Route path="/student/tickets" element={<RequireRole role="student"><MyTickets /></RequireRole>} />
              <Route path="/student/tickets/:id" element={<RequireRole role="student"><StudentTicketDetail /></RequireRole>} />
              <Route path="/student/updates" element={<RequireRole role="student"><StudentUpdates /></RequireRole>} />
              <Route path="/student/surveys" element={<RequireRole role="student"><MySurveys /></RequireRole>} />
              <Route path="/student/surveys/:id" element={<RequireRole role="student"><SurveyRespond /></RequireRole>} />

              {/* Community feed — all signed-in roles */}
              <Route path="/community" element={<Community />} />
              <Route path="/community/:id" element={<CommunityDetail />} />

              {/* Shared intelligence (staff + admin) */}
              <Route path="/pulse" element={<RequireRole role={['teacher', 'admin']}><CampusPulse /></RequireRole>} />
              <Route path="/incidents" element={<RequireRole role={['teacher', 'admin']}><IncidentsList /></RequireRole>} />
              <Route path="/incidents/:id" element={<RequireRole role={['teacher', 'admin']}><IncidentDetail /></RequireRole>} />
              <Route path="/intelligence" element={<RequireRole role={['teacher', 'admin']}><IncidentIntelligence /></RequireRole>} />
              <Route path="/verification" element={<RequireRole role={['teacher', 'admin']}><VerificationQueue /></RequireRole>} />
              <Route path="/recurrence" element={<RequireRole role="admin"><RecurrenceRadar /></RequireRole>} />
              <Route path="/scorecard" element={<RequireRole role="admin"><Scorecard /></RequireRole>} />
              <Route path="/escalation" element={<RequireRole role="admin"><EscalationCenter /></RequireRole>} />

              {/* Staff */}
              <Route path="/staff" element={<RequireRole role={['teacher', 'admin']}><StaffDashboard /></RequireRole>} />
              <Route path="/staff/complaints" element={<RequireRole role={['teacher', 'admin']}><StaffQueue /></RequireRole>} />
              <Route path="/staff/complaints/:id" element={<RequireRole role={['teacher', 'admin']}><StaffComplaintDetail /></RequireRole>} />
              <Route path="/surveys" element={<RequireRole role={['teacher', 'admin']}><SurveysList /></RequireRole>} />
              <Route path="/surveys/new" element={<RequireRole role={['teacher', 'admin']}><SurveyBuilder /></RequireRole>} />
              <Route path="/surveys/:id" element={<RequireRole role={['teacher', 'admin']}><SurveyResults /></RequireRole>} />

              {/* Admin */}
              <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
              <Route path="/admin/users" element={<RequireRole role="admin"><AdminUsers /></RequireRole>} />
              <Route path="/admin/departments" element={<RequireRole role="admin"><AdminDepartments /></RequireRole>} />
              <Route path="/admin/routing" element={<RequireRole role="admin"><AdminRouting /></RequireRole>} />
              <Route path="/admin/complaints" element={<RequireRole role="admin"><AdminComplaints /></RequireRole>} />
              <Route path="/admin/join-requests" element={<RequireRole role="admin"><AdminJoinRequests /></RequireRole>} />
              <Route path="/admin/settings" element={<RequireRole role="admin"><AdminSettings /></RequireRole>} />
            </Route>

            {/* Completing account setup (invite accept / join) */}
            <Route path="/auth/complete-setup" element={<AcceptInvite />} />

            <Route path="*" element={<StatusPage kind="notfound" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
