export type LeadRadarMessageInput = {
  userId: string;
  telegramAccountId: string;

  chatId: string;
  chatTitle: string;
  chatType: string;

  messageId: string;
  senderId: string | null;
  senderUsername: string | null;
  senderDisplayName: string | null;

  sourceType?: string | null;
  relatedPostId?: string | null;
  contextPreview?: string | null;
  relatedChannelId?: string | null;

  text: string;
  date: Date;
};

export type LeadRadarMatchResult = {
  matched: boolean;
  keywords: string[];
};

