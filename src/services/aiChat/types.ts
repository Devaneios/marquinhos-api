export type ResponseCategory =
  | 'general_question'
  | 'opinion_reference'
  | 'casual_chat'
  | 'off_topic_unclear';

export type AiChatCategory = ResponseCategory | 'guardrail_roast';

export interface AiChatRequest {
  userId: string;
  guildId: string;
  channelId: string;
  content: string;
  recentMessages: { author: string; content: string }[];
}

export interface AiChatResult {
  status: 'ok' | 'rate_limited' | 'error';
  category?: AiChatCategory;
  reply?: string;
}
