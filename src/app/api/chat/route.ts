import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { chat, ChatMessage } from '@/lib/rag';

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message, history } = await req.json();
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  const userId = session.user.sub;
  const chatHistory: ChatMessage[] = history || [];

  const response = await chat(userId, message, chatHistory);
  return NextResponse.json(response);
}
