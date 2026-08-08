import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { formatHistoryForContext } from './messages';
import type { IMessage } from '../models/Message';

export interface UserIntent {
  needsGmailTools: boolean;
  isConfirmingAction: boolean;
}

const GMAIL_SYSTEM_PROMPT = `You are a helpful Gmail assistant. The user is authenticated with Gmail.

Tools:
- read_emails — search inbox/sent/drafts (no confirmation)
- compose_email — compose and save as Gmail draft (does NOT send)
- create_draft — save email to Gmail Drafts folder (does NOT send)
- send_email / send_emails — send immediately
- reply_to_email — send reply immediately

## Compose / draft flow (does not send)
Use compose_email or create_draft with confirmed=false to preview, then confirm once to save in Gmail Drafts.

## Send flow
Use send_email / send_emails / reply_to_email with confirmed=false to preview, confirm once to send.

## Multi-recipient
- Same message → send_email with comma-separated to OR compose_email
- Different messages → send_emails

1. Collect all real info (no placeholders).
2. Call tool with confirmed=false ONCE.
3. Show draft in markdown and ask user to confirm.
4. Do NOT call the same tool again this turn.

## Search tips
- Sent mail to someone: in:sent to:email@mail.com
- Sent mail from someone: in:sent from:email@mail.com
- Inbox from someone: from:email@mail.com

Use markdown. Never invent email content.`;

const CHAT_ONLY_PROMPT = `You are a friendly Gmail assistant.

Handle greetings and off-topic politely. You have NO email tools in this mode.
Do NOT claim you sent/read/updated emails.
If the user wants email actions (search, send, list sent mail), acknowledge and encourage them — the system will handle it on the next tool-enabled turn.
Never say you cannot work with email addresses — you help with Gmail.
Use conversation history to stay on topic. Use markdown when helpful.`;

const CONFIRMATION_EXECUTE_PROMPT = `The user confirmed a pending email action.

Execute NOW with confirmed=true:
1. Use conversation history for recipients, subject, body, messageId, threadId.
2. For send → send_email/reply_to_email. For draft → compose_email/create_draft.
3. Do NOT show draft again or ask for confirmation again.`;

async function analyzeUserIntent(
  message: string,
  history: IMessage[]
): Promise<UserIntent> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const context = formatHistoryForContext(history);
  const lastAssistant = history.filter((m) => m.role === 'assistant').pop()?.content ?? '';

  const response = await llm.invoke([
    new SystemMessage(
      `Analyze the user's message using FULL conversation context. Reply JSON only:
{"needsGmailTools": boolean, "isConfirmingAction": boolean}

needsGmailTools = true when:
- Reading/searching/listing/summarizing emails (inbox, sent, drafts)
- Sending, composing, drafting, or replying to emails
- User provides email body, subject, or email address as part of ongoing task
- Short follow-ups that continue a task: "search in sent", "in sent email", an email address alone, "yes", "ok", providing a name
- User wants to message multiple people

isConfirmingAction = true when:
- User affirms/agrees to proceed with something the assistant already proposed (draft email, send, reply, update)
- Short affirmative replies (yes, ok, sure, go ahead, please send) AND assistant's last message asked to confirm or proposed an action

isConfirmingAction = false when: new unrelated request, first-time request, declining, or changing the draft entirely.

IMPORTANT: If assistant asked a question and user answers with email address or short phrase, needsGmailTools=true (continuing task).
If user affirms after assistant proposed email action, isConfirmingAction=true.`
    ),
    new HumanMessage(
      `Conversation:\n${context}\n\nAssistant's last message:\n${lastAssistant.slice(0, 600)}\n\nCurrent user message: ${message}`
    ),
  ]);

  try {
    const text = String(response.content).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as UserIntent;
    return {
      needsGmailTools: Boolean(parsed.needsGmailTools),
      isConfirmingAction: Boolean(parsed.isConfirmingAction),
    };
  } catch {
    return { needsGmailTools: true, isConfirmingAction: false };
  }
}

async function runChatOnly(message: string, chatHistory: BaseMessage[]): Promise<string> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await llm.invoke([
    new SystemMessage(CHAT_ONLY_PROMPT),
    ...chatHistory,
    new HumanMessage(message),
  ]);

  return String(response.content);
}

async function runGmailAgent(
  message: string,
  tools: DynamicStructuredTool[],
  chatHistory: BaseMessage[],
  systemPrompt = GMAIL_SYSTEM_PROMPT
): Promise<string> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['placeholder', '{chat_history}'],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });
  const executor = new AgentExecutor({
    agent,
    tools,
    maxIterations: 10,
    verbose: false,
  });

  const result = await executor.invoke({
    input: message,
    chat_history: chatHistory,
  });

  return String(result.output);
}

export async function runConfirmationAgent(
  message: string,
  tools: DynamicStructuredTool[],
  historyMessages: IMessage[]
): Promise<string> {
  const chatHistory = historyMessages.map((msg) =>
    msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  );
  return runGmailAgent(message, tools, chatHistory, CONFIRMATION_EXECUTE_PROMPT);
}

export async function runAgent(
  message: string,
  tools: DynamicStructuredTool[],
  historyMessages: IMessage[],
  intent?: UserIntent
): Promise<string> {
  const chatHistory = historyMessages.map((msg) =>
    msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  );

  const resolvedIntent = intent ?? (await analyzeUserIntent(message, historyMessages));

  if (!resolvedIntent.needsGmailTools) {
    return runChatOnly(message, chatHistory);
  }

  return runGmailAgent(message, tools, chatHistory);
}

export { analyzeUserIntent };
