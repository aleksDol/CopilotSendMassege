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
