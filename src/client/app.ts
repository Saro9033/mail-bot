type MessageType = 'user' | 'assistant' | 'error' | 'loading';

interface AuthStatusResponse {
  authenticated: boolean;
  email: string | null;
}

interface ChatResponse {
  reply?: string;
  error?: string;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface HistoryResponse {
  messages: StoredMessage[];
}

declare const marked: {
  parse: (src: string, options?: { breaks?: boolean }) => string;
};

declare const DOMPurify: {
  sanitize: (html: string) => string;
};

const messageList = document.getElementById('message-list') as HTMLDivElement;
const welcomeCard = document.getElementById('welcome-card') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const authBtn = document.getElementById('auth-btn') as HTMLButtonElement;
const userEmailEl = document.getElementById('user-email') as HTMLSpanElement;
const userChip = document.getElementById('user-chip') as HTMLDivElement;
const userAvatar = document.getElementById('user-avatar') as HTMLDivElement;
const statusPill = document.getElementById('status-pill') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const inputHint = document.getElementById('input-hint') as HTMLParagraphElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const sidebarOverlay = document.getElementById('sidebar-overlay') as HTMLDivElement;

let isAuthenticated = false;
let isLoading = false;

function renderMarkdown(text: string): string {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    return text;
  }
  const html = marked.parse(text, { breaks: true });
  return DOMPurify.sanitize(html);
}

function formatTime(date?: string | Date): string {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

function hideWelcome(): void {
  welcomeCard?.classList.add('hidden');
}

function showWelcome(): void {
  welcomeCard?.classList.remove('hidden');
}

function scrollToBottom(): void {
  messageList.scrollTop = messageList.scrollHeight;
}

function autoResizeInput(): void {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
}

function setQuickActionsEnabled(enabled: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.quick-action, .chip').forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function addMessage(text: string, type: MessageType, time?: string): HTMLDivElement {
  hideWelcome();

  const row = document.createElement('div');
  row.className = `message-row ${type === 'loading' ? 'assistant' : type}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${type === 'loading' ? 'assistant' : type}`;
  avatar.textContent = type === 'user' ? 'You' : type === 'error' ? '!' : 'AI';

  const body = document.createElement('div');
  body.className = 'msg-body';

  if (type !== 'loading') {
    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = time ?? formatTime();
    body.appendChild(timeEl);
  }

  const bubble = document.createElement('div');
  bubble.className = `message message-${type === 'loading' ? 'loading' : type}`;

  if (type === 'assistant') {
    bubble.innerHTML = renderMarkdown(text);
  } else if (type === 'loading') {
    bubble.innerHTML =
      '<span>Thinking</span><div class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
  } else {
    bubble.textContent = text;
  }

  body.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(body);
  messageList.appendChild(row);
  scrollToBottom();
  return row;
}

function removeMessage(el: HTMLElement | null): void {
  el?.remove();
}

function setLoading(loading: boolean): void {
  isLoading = loading;
  chatInput.disabled = !isAuthenticated || loading;
  sendBtn.disabled = !isAuthenticated || loading;
  setQuickActionsEnabled(isAuthenticated && !loading);
}

function updateAuthUI(authenticated: boolean, email: string | null): void {
  isAuthenticated = authenticated;

  if (authenticated && email) {
    userEmailEl.textContent = email;
    userAvatar.textContent = getInitials(email);
    userChip.classList.remove('hidden');
    authBtn.innerHTML = 'Sign out';
    authBtn.className = 'btn btn-logout';
    statusPill.classList.add('connected');
    statusText.textContent = 'Connected';
    chatInput.disabled = isLoading;
    sendBtn.disabled = isLoading;
    chatInput.placeholder = 'Ask about your emails… (Enter to send)';
    inputHint.textContent = 'Press Enter to send · Shift+Enter for new line';
    setQuickActionsEnabled(!isLoading);
  } else {
    userChip.classList.add('hidden');
    authBtn.innerHTML =
      '<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Sign in with Google';
    authBtn.className = 'btn btn-google';
    statusPill.classList.remove('connected');
    statusText.textContent = 'Not signed in';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = 'Sign in to start chatting…';
    inputHint.textContent = 'Sign in with Google to access your mailbox.';
    setQuickActionsEnabled(false);
  }
}

function clearMessages(): void {
  messageList.innerHTML = '';
  messageList.appendChild(welcomeCard);
  showWelcome();
}

async function loadHistory(): Promise<void> {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;

    const data = (await res.json()) as HistoryResponse;
    if (data.messages.length === 0) return;

    hideWelcome();
    messageList.innerHTML = '';

    for (const msg of data.messages) {
      const isError =
        msg.role === 'assistant' &&
        (msg.content.startsWith("I couldn't") || msg.content.startsWith('Something went wrong'));
      addMessage(
        msg.content,
        msg.role === 'user' ? 'user' : isError ? 'error' : 'assistant',
        formatTime(msg.createdAt)
      );
    }
    scrollToBottom();
  } catch {
    // non-critical
  }
}

async function checkAuthStatus(): Promise<void> {
  try {
    const res = await fetch('/auth/status');
    const data = (await res.json()) as AuthStatusResponse;
    updateAuthUI(data.authenticated, data.email);

    if (data.authenticated) {
      await loadHistory();
    }
  } catch {
    updateAuthUI(false, null);
  }
}

function handleAuthClick(): void {
  if (isAuthenticated) {
    fetch('/auth/logout', { method: 'POST' })
      .then(() => {
        updateAuthUI(false, null);
        clearMessages();
      })
      .catch(() => addMessage('Failed to sign out. Please try again.', 'error'));
  } else {
    window.location.href = '/auth/google';
  }
}

async function handleSend(message: string): Promise<void> {
  setLoading(true);
  const loadingEl = addMessage('', 'loading');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const data = (await res.json()) as ChatResponse;
    removeMessage(loadingEl);

    if (!res.ok) {
      addMessage(data.error ?? 'Something went wrong.', 'error');
      if (res.status === 401) {
        updateAuthUI(false, null);
        clearMessages();
      }
      return;
    }

    const reply = data.reply ?? '';
    const isErrorReply =
      reply.startsWith("I couldn't") || reply.startsWith('Something went wrong');
    addMessage(reply, isErrorReply ? 'error' : 'assistant');
  } catch {
    removeMessage(loadingEl);
    addMessage('Network error. Please check your connection and try again.', 'error');
  } finally {
    setLoading(false);
    autoResizeInput();
  }
}

function submitMessage(text: string): void {
  const message = text.trim();
  if (!message || !isAuthenticated || isLoading) return;

  addMessage(message, 'user');
  chatInput.value = '';
  autoResizeInput();
  handleSend(message);
}

function handlePromptClick(prompt: string): void {
  if (!isAuthenticated) {
    window.location.href = '/auth/google';
    return;
  }
  chatInput.value = prompt;
  autoResizeInput();
  chatInput.focus();
  submitMessage(prompt);
}

function toggleSidebar(): void {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('hidden', !sidebar.classList.contains('open'));
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitMessage(chatInput.value);
});

chatInput.addEventListener('input', autoResizeInput);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitMessage(chatInput.value);
  }
});

authBtn.addEventListener('click', handleAuthClick);
sidebarToggle.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', toggleSidebar);

document.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const prompt = btn.getAttribute('data-prompt');
    if (prompt) handlePromptClick(prompt);
  });
});

const urlParams = new URLSearchParams(window.location.search);
const authError = urlParams.get('auth_error');
if (authError) {
  hideWelcome();
  addMessage(`Sign-in failed: ${authError}`, 'error');
  window.history.replaceState({}, '', '/');
}

checkAuthStatus();
