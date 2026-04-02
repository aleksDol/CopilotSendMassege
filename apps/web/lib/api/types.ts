export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  companyId: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
};

export type AccessState = {
  subscriptionStatus: "trial" | "active" | "free" | "expired";
  isTrialActive: boolean;
  isTrialExpired: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  timeLeftMs: number | null;
  effectivePlan: string;
  limitsPlan: string;
};

export type DashboardOverview = {
  activeConversations: number;
  waitingForReply: number;
  overdueFollowUps: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  suggestionsGenerated: number;
  suggestionsAccepted: number;
  acceptanceRate: number;
  avgReplyTimeSeconds: number;
};

export type ConversationListItem = {
  conversationId: string;
  title: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  leadStage: string;
  leadTemperature: string;
  unansweredClientMessageCount: number;
  isWaitingForReply: boolean;
};

export type ConversationListResponse = {
  items: ConversationListItem[];
  nextCursor: string | null;
};

export type MessageItem = {
  id: string;
  direction: string;
  text: string | null;
  sentAt: string;
  participant: {
    id: string;
    fullName: string | null;
    username: string | null;
  } | null;
};

export type MessagesResponse = {
  items: MessageItem[];
};

export type SendMessageResponse = {
  status: string;
  externalMessageId?: string | null;
  queue?: {
    queued?: boolean;
    queueWaitMs?: number;
    attempts?: number;
  } | null;
};

export type TaskItem = {
  id: string;
  taskType: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  source: string;
  conversation: { id: string; title: string | null } | null;
  assignedUser: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskListResponse = {
  items: TaskItem[];
  nextCursor: string | null;
};

export type TelegramAccountResponse = {
  status?: string;
  channelAccountId?: string;
  phone?: string | null;
  loginStatus?: string;
  displayName?: string | null;
  username?: string | null;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
};

export type AiSuggestion = {
  id: string;
  text: string;
  type: string;
  mode: string;
  status: string;
  confidence: number | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  model: string | null;
};

export type KnowledgeItem = {
  id: string;
  kind: string;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  version: number;
};

export type ReplyPolicy = {
  id?: string;
  toneRules?: unknown;
  pricingRules?: unknown;
  discountRules?: unknown;
  forbiddenPromises?: unknown;
  forbiddenTopics?: unknown;
  humanHandoffRules?: unknown;
};

export type BillingSubscription = {
  id: string;
  plan: string;
  status: string;
  subscriptionStatus: "trial" | "active" | "free" | "expired";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  trialTimeLeftMs: number | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    aiSuggestionsPerMonth: number;
    maxUsers: number;
  };
};

export type BillingUsage = {
  plan: string;
  subscriptionStatus: "trial" | "active" | "free" | "expired";
  trialEndsAt: string | null;
  trialTimeLeftMs: number | null;
  aiUsage: number;
  aiLimit: number;
  periodStart?: string;
  periodEnd: string;
};

export type TeamMember = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt?: string;
  inviteLink?: string;
};

export type TeamListResponse = {
  members: TeamMember[];
  invites: TeamInvite[];
};

export type WorkspaceSettings = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    plan: string;
    defaultReplyPolicy: Record<string, unknown> | null;
  };
};

// ===== LeadRadar =====
export type LeadRadarLeadStatus =
  | "new"
  | "reviewed"
  | "hot"
  | "contacted"
  | "replied"
  | "qualified"
  | "won"
  | "lost"
  | "ignored"
  | "spam";

export type LeadRadarLeadItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  chatId: string;
  chatTitle: string | null;
  messageText: string | null;
  score: number;
  status: LeadRadarLeadStatus;
  createdAt: string;
};

export type LeadRadarLeadListResponse = {
  items: LeadRadarLeadItem[];
  page: number;
  limit: number;
  total: number;
};

export type LeadRadarContextMessage = {
  text: string | null;
  sender: string | null;
  date: string;
};

export type LeadRadarLeadEvent = {
  id: string;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  comment: string | null;
  createdBy: string | null;
  createdAt: string | null;
};

export type LeadRadarLeadDetailsResponse = {
  lead: {
    id: string;
    username: string | null;
    displayName: string | null;
    chatId: string;
    chatTitle: string | null;
    messageText: string | null;
    score: number;
    status: LeadRadarLeadStatus;
    createdAt: string;
    notes: string | null;
  };
  context: {
    beforeMessages: LeadRadarContextMessage[];
    afterMessages: LeadRadarContextMessage[];
  } | null;
  events: LeadRadarLeadEvent[];
};

export type LeadRadarSourceItem = {
  id: string;
  telegram_chat_id: string;
  chat_title: string | null;
  chat_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadRadarListSourcesResponse = {
  items: LeadRadarSourceItem[];
  total: number;
};

export type LeadRadarMatchType = "contains" | "exact" | "regex";
export type LeadRadarCategory = "bot" | "website" | "ai" | "mvp" | "automation" | "general";

export type LeadRadarKeywordItem = {
  id: string;
  keyword: string;
  match_type: LeadRadarMatchType;
  category: LeadRadarCategory;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadRadarListKeywordsResponse = {
  items: LeadRadarKeywordItem[];
  total: number;
};

export type LeadRadarNegativeKeywordItem = {
  id: string;
  phrase: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadRadarListNegativeKeywordsResponse = {
  items: LeadRadarNegativeKeywordItem[];
  total: number;
};

export type LeadRadarSettingsResponse = {
  isEnabled: boolean;
  minScoreThreshold: number;
  storeContextEnabled: boolean;
  contextBeforeCount: number;
  contextAfterCount: number;
  dedupeWindowHours: number;
};
