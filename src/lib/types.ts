export type Role = 'admin' | 'teacher' | 'student';
export type AccountStatus = 'pending' | 'active' | 'deactivated';
export type ComplaintStatus = 'new' | 'assigned' | 'in_progress' | 'resolved' | 'reopened' | 'closed';
export type VerificationStatus = 'awaiting_verification' | 'confirmed' | 'reopen_requested' | 'expired';
export type IncidentStatus = 'suspected' | 'confirmed' | 'investigating' | 'resolved' | 'dismissed';
export type IncidentNoteType = 'note' | 'hypothesis' | 'step' | 'outcome';
export type CauseReviewStatus = 'suspected' | 'investigated' | 'confirmed' | 'dismissed';
export type ComplaintCategory = 'plumbing' | 'electricity' | 'cleanliness' | 'internet';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MembershipType = 'head' | 'teacher' | 'student';
export type SubmissionType = 'complaint' | 'request';
export type SubmissionVisibility = 'personal' | 'campus';
export type RequestStatus = 'submitted' | 'under_review' | 'info_required' | 'under_consideration' | 'approved' | 'declined' | 'planned' | 'in_progress' | 'implemented' | 'closed';
export type CommunityVoteType = 'support' | 'affected' | 'report';
export type SolutionStatus = 'suggested' | 'accepted' | 'rejected';
export type SurveyStatus = 'draft' | 'published' | 'closed';
export type SurveyQuestionType = 'single' | 'multi' | 'rating' | 'yesno' | 'text';

export interface Institution {
  id: string;
  name: string;
  institution_code: string;
  institution_type: string;
  official_email: string;
  address: string;
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
}

export interface Profile {
  id: string;
  institution_id: string;
  full_name: string;
  email: string;
  role: Role;
  identifier: string | null;
  account_status: AccountStatus;
  created_at: string;
}

export interface Department {
  id: string;
  institution_id: string;
  name: string;
  description: string;
  department_head_id: string | null;
  is_active: boolean;
  created_at: string;
  head?: Profile | null;
  members?: DepartmentMember[];
}

export interface DepartmentMember {
  id: string;
  institution_id: string;
  department_id: string;
  profile_id: string;
  membership_type: MembershipType;
  created_at: string;
  profile?: Profile;
}

export interface Complaint {
  id: string;
  institution_id: string;
  ticket_number: string;
  created_by: string;
  title: string;
  description: string;
  location: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_department_id: string | null;
  assigned_to: string | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  due_at: string | null;
  first_response_at: string | null;
  escalation_level: number;
  reopen_count: number;
  verification: VerificationStatus | null;
  safety_flagged: boolean;
  resolution_attachment_id: string | null;
  submission_type: SubmissionType;
  visibility: SubmissionVisibility;
  request_status: RequestStatus | null;
  request_category_id: string | null;
  preferred_outcome: string | null;
  moderated: boolean;
  moderation_note: string | null;
  ai_analysis: AiAnalysis | null;
  created_at: string;
  updated_at: string;
  creator?: Profile;
  assignee?: Profile | null;
  department?: Department | null;
}

export interface ComplaintAttachment {
  id: string;
  complaint_id: string;
  storage_path: string;
  content_type: string;
  created_at: string;
}

export interface ComplaintEvent {
  id: string;
  complaint_id: string;
  actor_id: string | null;
  event_type: string;
  previous_value: string | null;
  new_value: string | null;
  note: string | null;
  is_internal: boolean;
  created_at: string;
  actor?: Profile | null;
}

export interface ComplaintLink {
  id: string;
  source_complaint_id: string;
  related_complaint_id: string;
  relationship_type: 'possible_duplicate' | 'related';
  score: number | null;
  review_status: 'pending' | 'confirmed' | 'dismissed';
  created_at: string;
  related_complaint?: Complaint;
  source_complaint?: Complaint;
}

export interface RoutingRule {
  id: string;
  category: ComplaintCategory;
  department_id: string;
  is_active: boolean;
  department?: Department;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  complaint_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  identifier: string | null;
  status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
}

export interface JoinRequest {
  id: string;
  institution_id: string;
  user_id: string;
  email: string;
  full_name: string;
  requested_role: Role;
  identifier: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Incident {
  id: string;
  institution_id: string;
  title: string;
  summary: string | null;
  category: ComplaintCategory | null;
  location: string;
  status: IncidentStatus;
  department_id: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  member_count?: number;
  department?: Department | null;
}

export interface IncidentNote {
  id: string;
  incident_id: string;
  author_id: string | null;
  note_type: IncidentNoteType;
  content: string;
  ai_generated: boolean;
  review_state: 'confirmed' | 'rejected' | null;
  created_at: string;
  author?: Profile | null;
}

export interface IncidentBroadcast {
  id: string;
  incident_id: string;
  sent_by: string | null;
  message: string;
  recipient_count: number;
  created_at: string;
  sender?: Profile | null;
}

export interface SlaRule {
  id: string;
  institution_id: string;
  category: ComplaintCategory | null;
  priority: ComplaintPriority | null;
  response_hours: number;
  resolve_hours: number;
  escalate_after_hours: number;
  is_active: boolean;
}

export interface EscalationEvent {
  id: string;
  complaint_id: string;
  level: number;
  reason: string;
  created_at: string;
}

export interface CauseReview {
  id: string;
  location_key: string;
  category: ComplaintCategory;
  status: CauseReviewStatus;
  note: string | null;
  updated_at: string;
}

export interface PriorityFactor {
  factor: string;
  detail: string;
  points: number;
}

export interface PriorityExplanation {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: PriorityFactor[];
  recommended_action: string;
}

export interface AiAnalysis {
  problem_statement?: string;
  known_facts?: string[];
  missing_information?: string[];
  hypotheses?: { text: string; confidence: string; evidence?: string }[];
  suggested_steps?: string[];
  suggested_priority?: string;
  priority_reason?: string;
  suggested_department?: string | null;
  solutions?: { text: string; caution?: string }[];
  request_extras?: {
    intended_benefit?: string;
    affected_groups?: string[];
    questions_for_staff?: string[];
    implementation_approaches?: string[];
    info_needed_before_approval?: string[];
  } | null;
}

export interface RequestCategory {
  id: string;
  institution_id: string;
  name: string;
  is_active: boolean;
}

export interface VoteCounts {
  supporters: number;
  affected: number;
  reports: number;
}

export interface CommunityVote {
  id: string;
  complaint_id: string;
  vote_type: CommunityVoteType;
  created_at: string;
}

export interface Solution {
  id: string;
  complaint_id: string;
  source: 'ai' | 'staff';
  content: string;
  status: SolutionStatus;
  decided_by: string | null;
  decided_reason: string | null;
  created_at: string;
}

export interface Survey {
  id: string;
  institution_id: string;
  complaint_id: string | null;
  title: string;
  description: string | null;
  anonymous: boolean;
  deadline: string | null;
  status: SurveyStatus;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  complaint?: { ticket_number: string; title: string } | null;
  questions?: SurveyQuestion[];
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  ord: number;
  question_type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  respondent_id: string;
  submitted_at: string;
  answers?: SurveyAnswer[];
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  value: string | string[] | number;
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_required: 'Info required',
  under_consideration: 'Under consideration',
  approved: 'Approved',
  declined: 'Declined',
  planned: 'Planned',
  in_progress: 'In progress',
  implemented: 'Implemented',
  closed: 'Closed',
};

const REQUEST_CHIP = 'bg-[#171716] text-white ring-[#171716]';
export const REQUEST_STATUS_STYLES: Record<RequestStatus, string> = {
  submitted: REQUEST_CHIP,
  under_review: REQUEST_CHIP,
  info_required: REQUEST_CHIP,
  under_consideration: REQUEST_CHIP,
  approved: REQUEST_CHIP,
  declined: REQUEST_CHIP,
  planned: REQUEST_CHIP,
  in_progress: REQUEST_CHIP,
  implemented: REQUEST_CHIP,
  closed: REQUEST_CHIP,
};

export const REQUEST_NEXT: Record<RequestStatus, { to: RequestStatus; label: string; needsReason?: boolean }[]> = {
  submitted: [{ to: 'under_review', label: 'Begin review' }],
  under_review: [
    { to: 'under_consideration', label: 'Move to consideration' },
    { to: 'info_required', label: 'Request more information', needsReason: true },
    { to: 'declined', label: 'Decline', needsReason: true },
  ],
  info_required: [{ to: 'under_review', label: 'Resume review' }],
  under_consideration: [
    { to: 'approved', label: 'Approve' },
    { to: 'declined', label: 'Decline', needsReason: true },
  ],
  approved: [{ to: 'planned', label: 'Create plan' }],
  planned: [{ to: 'in_progress', label: 'Start implementation' }],
  in_progress: [{ to: 'implemented', label: 'Mark implemented' }],
  implemented: [{ to: 'closed', label: 'Close' }],
  declined: [{ to: 'under_review', label: 'Reopen review' }],
  closed: [],
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  suspected: 'Suspected',
  confirmed: 'Confirmed',
  investigating: 'Investigating',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  awaiting_verification: 'Awaiting verification',
  confirmed: 'Student confirmed',
  reopen_requested: 'Reopening requested',
  expired: 'No response — unverified',
};

const INCIDENT_CHIP = 'bg-[#171716] text-white ring-[#171716]';
export const INCIDENT_STATUS_STYLES: Record<IncidentStatus, string> = {
  suspected: INCIDENT_CHIP,
  confirmed: INCIDENT_CHIP,
  investigating: INCIDENT_CHIP,
  resolved: INCIDENT_CHIP,
  dismissed: INCIDENT_CHIP,
};

export const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'internet', label: 'Internet connectivity' },
];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  reopened: 'Reopened',
  closed: 'Closed',
};

export const PRIORITY_LABELS: Record<ComplaintPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};
