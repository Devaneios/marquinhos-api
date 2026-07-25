import type OpenAI from 'openai';
import { executeCodeTool } from './executeCode';
import { grepSearchTool } from './grepSearch';
import { listDirectoryTool } from './listDirectory';
import { readFileTool } from './readFile';
import type { AgentTool } from './types';

export const AGENT_TOOLS: AgentTool[] = [
  listDirectoryTool,
  grepSearchTool,
  readFileTool,
  executeCodeTool,
];

export function toOpenAiTools(): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function findTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}
