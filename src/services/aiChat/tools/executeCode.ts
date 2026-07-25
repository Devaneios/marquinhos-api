import type { AgentTool } from './types';

const LANGUAGE_COMMANDS: Record<string, (code: string) => string[]> = {
  python: (code) => ['python3', '-c', code],
  javascript: (code) => ['bun', '-e', code],
  bash: (code) => ['bash', '-c', code],
};

export const executeCodeTool: AgentTool = {
  name: 'execute_code',
  description:
    'Executa um trecho de código dentro do sandbox da sessão. Linguagens suportadas: python, javascript, bash. Sem acesso à rede; a sessão persiste entre chamadas.',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['python', 'javascript', 'bash'],
        description: 'Linguagem do código a executar',
      },
      code: { type: 'string', description: 'Código a executar' },
    },
    required: ['language', 'code'],
  },
  async execute(args, ctx) {
    const language = String(args.language ?? '');
    const code = String(args.code ?? '');
    const buildArgv = LANGUAGE_COMMANDS[language];
    if (!buildArgv) {
      return `Erro: linguagem "${language}" não suportada. Use python, javascript ou bash.`;
    }
    const result = await ctx.exec(ctx.containerId, buildArgv(code));
    const output = [
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
      `exit code: ${result.exitCode}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    return output.slice(0, 4000);
  },
};
