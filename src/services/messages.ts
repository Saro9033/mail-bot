import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { Message, IMessage, MessageRole } from '../models/Message';

const MAX_HISTORY_MESSAGES = 40;

export async function saveMessage(
  userId: string,
  role: MessageRole,
  content: string
): Promise<IMessage> {
  return Message.create({ userId, role, content });
}

export async function getMessages(userId: string, limit = MAX_HISTORY_MESSAGES): Promise<IMessage[]> {
  const messages = await Message.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return messages.reverse();
}

export function toLangChainHistory(messages: IMessage[]): BaseMessage[] {
  return messages.map((msg) =>
    msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  );
}

export function formatHistoryForContext(messages: IMessage[]): string {
  return messages
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');
}
