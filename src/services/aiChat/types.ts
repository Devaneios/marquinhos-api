export type ResponseCategory =
  | 'general_question'
  | 'code_technical_question'
  | 'opinion_reference'
  | 'bot_help_info'
  | 'user_roast_provocation'
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
