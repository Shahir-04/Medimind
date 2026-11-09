import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, ThumbsUp, ThumbsDown, LogOut, Loader2, CheckCircle2, Bot, Sparkles, Pencil, Check, X, Sun, Moon, MessageSquarePlus, History, Files, FileText, Trash2, LayoutDashboard, Activity, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import VoiceChat from '@/components/VoiceChat';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useTheme } from '@/lib/useTheme';

const markdownComponents = {
  // Keep wide tables readable and scrollable inside the message bubble.
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto overscroll-x-contain">
      <table {...props} className="w-max min-w-full [overflow-wrap:normal]" />
    </div>
  ),
};

// Chat fills the visible viewport so the composer stays reachable on phones.
export default function Chat({ session, onLogout }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [messages, setMessages] = useState([{ id: 1, role: 'ai', content: "Welcome to MediMind! 🌿\n\nHow can I help you today?" }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const [threads, setThreads] = useState([]);
  const [voiceThreads, setVoiceThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isVoiceThread, setIsVoiceThread] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isTempUpload, setIsTempUpload] = useState(false);
  const [isInChatOnly, setIsInChatOnly] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [symptoms, setSymptoms] = useState([]);
  const [isSymptomsLoading, setIsSymptomsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const chatViewportRef = useRef(null);
  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadRequest = useRef(0);
  const historyThreads = [...threads, ...voiceThreads].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // Replies and file cards can follow the latest user text message.
  const editableMessageIndex = isTyping || isVoiceThread ? -1 : messages.findLastIndex(m => m.role === 'user' && !m.isFile);

  // Discard the draft when editing ends or the conversation changes.
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // Scroll the transcript without moving the page or the composer.
  useEffect(() => {
    const messageList = messageListRef.current;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const chatViewport = chatViewportRef.current;
    if (!viewport) return;

    // Some mobile browsers resize only the visual viewport for the keyboard.
    // Leave the CSS layout in place during pinch zoom so the user can pan.
    const resizeChat = () => {
      const isZoomed = viewport.scale !== 1;
      chatViewport.style.height = isZoomed ? '' : `${viewport.height}px`;
      chatViewport.style.top = isZoomed ? '' : `${viewport.offsetTop}px`;
    };

    resizeChat();
    viewport.addEventListener('resize', resizeChat);
    viewport.addEventListener('scroll', resizeChat);
    return () => {
      viewport.removeEventListener('resize', resizeChat);
      viewport.removeEventListener('scroll', resizeChat);
    };
  }, []);

  const fetchThreads = async () => {
    try {
      const res = await fetch(`/api/threads/${encodeURIComponent(session.email)}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (e) { }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(session.email)}`);
      if (res.ok) {
        const data = await res.json();
        setUploadedFiles(data.documents || []);
      }
    } catch (e) { }
  };

  const fetchSymptoms = async () => {
    setIsSymptomsLoading(true);
    try {
      const res = await fetch(`/api/symptoms/${encodeURIComponent(session.email)}`);
      if (res.ok) {
        const data = await res.json();
        setSymptoms(data.symptoms || []);
      }
    } catch (e) { }
    setIsSymptomsLoading(false);
  };

  useEffect(() => {
    if (session) {
      fetchThreads();
      fetchFiles();
      fetchSymptoms();
    }
  }, [session]);

  // Fetch private voice history independently so text history remains available if it fails.
  useEffect(() => {
    const controller = new AbortController();
    async function fetchVoiceThreads() {
      try {
        const res = await fetch('/api/voice/threads', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        if (res.status === 401 && !controller.signal.aborted) {
          setHistoryError('Sign out and sign back in to load voice history.');
          return;
        }
        if (!res.ok) throw new Error('Could not load voice history.');
        const data = await res.json();
        if (controller.signal.aborted) return;
        setVoiceThreads(previous => {
          const existing = new Set(previous.map(thread => thread.id));
          const loaded = data.threads.filter(thread => !existing.has(thread.id));
          return [...previous, ...loaded.map(thread => ({ ...thread, isVoice: true }))];
        });
      } catch {
        if (!controller.signal.aborted) setHistoryError('Could not load voice history. Refresh to try again.');
      }
    }
    void fetchVoiceThreads();
    return () => controller.abort();
  }, [session.access_token]);

  useEffect(() => {
    if (!session) return;
    let ignore = false;
    const fetchMemoryAndSetWelcome = async () => {
      try {
        const res = await fetch(`/api/memory/${encodeURIComponent(session.email)}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        let isMemoryEmpty = true;
        if (res.ok) {
          const data = await res.json();
          const memoryArray = Array.isArray(data.memories) ? data.memories : (data.memories?.results || []);
          isMemoryEmpty = memoryArray.length === 0;
        }

        if (ignore) return;
        setMessages([{
          id: 1,
          role: 'ai',
          content: isMemoryEmpty
            ? "Welcome to MediMind! 🌿\n\nTo provide you with highly personalized medical insights, I'd like to get to know you a bit better. To start, what is your name?"
            : "Welcome back to MediMind! 🌿\n\nHow can I help you today?"
        }]);
      } catch (err) {
        if (ignore) return;
        console.error("Failed to fetch memory:", err);
        setMessages([{
          id: 1,
          role: 'ai',
          content: "Welcome to MediMind! 🌿\n\nHow can I help you today?"
        }]);
      }
    };
    if (!activeThreadId) {
      fetchMemoryAndSetWelcome();
    }
    return () => { ignore = true; };
  }, [session, activeThreadId]);

  // Display a thread and invalidate any earlier history request that is still pending.
  const openThread = (thread, savedMessages) => {
    threadRequest.current += 1;
    cancelEdit();
    setActiveThreadId(thread.id);
    setIsVoiceThread(Boolean(thread.isVoice));
    setMessages(savedMessages.map(({ id, role, content }) => ({ id, role, content })));
  };

  // Read text history or the signed-in user's private voice transcript.
  const loadThread = async (thread) => {
    const request = ++threadRequest.current;
    setHistoryError('');
    try {
      const path = thread.isVoice ? '/api/voice/threads' : '/api/messages';
      const res = await fetch(`${path}/${thread.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Could not open the conversation.');
      const data = await res.json();
      if (request === threadRequest.current) openThread(thread, data.messages || []);
    } catch {
      if (request === threadRequest.current) setHistoryError('Could not open the conversation. Try again.');
    }
  };

  // Add the saved session to History and show its transcript without a second network request.
  const showSavedVoiceThread = ({ thread, messages: savedMessages }) => {
    const savedThread = { ...thread, isVoice: true };
    setVoiceThreads(previous => [savedThread, ...previous.filter(item => item.id !== thread.id)]);
    setHistoryError('');
    openThread(savedThread, savedMessages);
  };

  const cleanupTempFiles = async () => {
    try {
      await fetch(`/api/documents/cleanup/${encodeURIComponent(session.email)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      fetchFiles();
    } catch (e) { }
  };

  // Reset the transcript and its edit draft when starting a conversation.
  const startNewChat = () => {
    threadRequest.current += 1;
    cleanupTempFiles();
    cancelEdit();
    setActiveThreadId(null);
    setIsVoiceThread(false);
    setMessages([{ id: 1, role: 'ai', content: "Welcome to MediMind! 🌿\n\nHow can I help you today?" }]);
  };

  // Remove the conversation from its history only after the server deletes it.
  const handleDeleteThread = async (e, thread) => {
    e.stopPropagation();
    const request = threadRequest.current;
    setHistoryError('');
    try {
      const path = thread.isVoice ? '/api/voice/threads' : '/api/threads';
      const res = await fetch(`${path}/${thread.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const updateHistory = thread.isVoice ? setVoiceThreads : setThreads;
        updateHistory(prev => prev.filter(t => t.id !== thread.id));
        if (activeThreadId === thread.id && request === threadRequest.current) {
          startNewChat();
        }
      } else {
        setHistoryError('Could not delete the conversation. Try again.');
      }
    } catch {
      setHistoryError('Could not delete the conversation. Try again.');
    }
  };

  const handleLogout = () => {
    cleanupTempFiles();
    onLogout();
  };

  const handleDeleteFile = async (filename) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(filename)}?user_email=${encodeURIComponent(session.email)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setUploadedFiles(prev => prev.filter(f => f.filename !== filename));
      }
    } catch (e) { }
  };

  const handleUpdateFileScope = async (filename, currentTemp, currentChatOnly) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(filename)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_email: session.email,
          is_temporary: currentTemp,
          in_chat_only: currentChatOnly,
          thread_id: activeThreadId
        })
      });
      if (res.ok) {
        setUploadedFiles(prev => prev.map(f => f.filename === filename ? { ...f, is_temporary: currentTemp, in_chat_only: currentChatOnly } : f));
      }
    } catch (e) { }
  };

  const sendMessageToBackend = async (messageContent, historyMessages) => {
    const history = historyMessages
      .filter(m => (m.role === 'user' || m.role === 'ai') && m.content)
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ user_email: session.email, message: messageContent, history, thread_id: activeThreadId })
      });

      if (!res.ok) throw new Error('Failed to get response');
      const data = await res.json();
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', content: data.response }]);

      if (data.thread_id && data.thread_id !== activeThreadId) {
        setActiveThreadId(data.thread_id);
        fetchThreads();
        // Re-fetch after a delay to pick up the AI-generated title
        setTimeout(fetchThreads, 4000);
      }
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'error', content: "Connection Error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Sending a new message supersedes any open edit draft.
  const handleSend = async (e) => {
    e?.preventDefault();
    if (isTyping || isVoiceThread || !input.trim()) return;

    const currentMessages = messages;
    const userMessage = { id: Date.now(), role: 'user', content: input };
    cancelEdit();
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    await sendMessageToBackend(userMessage.content, currentMessages);
  };

  // Resend the latest user message with the history that preceded it.
  const handleEditMessage = async (msgId) => {
    const message = messages[editableMessageIndex];
    if (!message || message.id !== msgId || editingId !== msgId || !editText.trim()) return;

    const messagesBeforeEdit = messages.slice(0, editableMessageIndex);
    const editedMessage = { ...message, content: editText };

    // Replace the old reply while keeping any uploads made after the message.
    setMessages(prev => [
      ...prev.slice(0, editableMessageIndex),
      editedMessage,
      ...prev.slice(editableMessageIndex + 1).filter(m => m.isFile),
    ]);
    cancelEdit();
    setIsTyping(true);

    await sendMessageToBackend(editedMessage.content, messagesBeforeEdit);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setUploadStatus('Analyzing PDF...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_email', session.email);
    formData.append('is_temporary', isTempUpload);
    formData.append('in_chat_only', isInChatOnly);
    if (activeThreadId) formData.append('thread_id', activeThreadId);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      await res.json();
      setUploadStatus('');

      let badge = '';
      if (isTempUpload) badge += ' [24h Temp]';
      if (isInChatOnly) badge += ' [In-Chat Only]';

      setMessages((prev) => [...prev, {
        id: Date.now(),
        role: 'user',
        isFile: true,
        fileName: file.name,
        fileBadge: badge || 'PDF'
      }]);

      setIsTempUpload(false);
      setIsInChatOnly(false);
      setShowUploadOptions(false);

      fetchFiles();
    } catch {
      setUploadStatus('Failed to upload PDF.');
      setTimeout(() => setUploadStatus(''), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFeedback = async (msgId, isPositive) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: isPositive ? 'up' : 'down' } : m));

    const aiMsg = messages.find(m => m.id === msgId);
    if (!aiMsg) return;

    // Find the user message just before this AI response
    const aiIndex = messages.findIndex(m => m.id === msgId);
    const userMsg = messages.slice(0, aiIndex).reverse().find(m => m.role === 'user');

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_email: session.email,
          ai_response: aiMsg.content,
          user_message: userMsg?.content || '',
          is_positive: isPositive
        })
      });
    } catch (e) { }
  };

  return (
    <TooltipProvider>
      <div ref={chatViewportRef} className={`relative isolate flex h-dvh overflow-hidden font-sans ${resolvedTheme === 'dark' ? 'bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950' : 'bg-gradient-to-br from-neutral-50 via-blue-50/20 to-sky-50/10'}`}>
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
          <div className="absolute bottom-20 right-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-pulse-soft animation-delay-1000" />
        </div>

        {/* Mobile Sidebar Backdrop */}
        {isSidebarOpen && (
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside id="chat-sidebar" aria-label="Chat navigation" className={`absolute inset-y-0 left-0 z-40 w-[min(18rem,88%)] shrink-0 flex-col border-r border-neutral-200/50 bg-background shadow-glass lg:relative lg:z-10 lg:flex lg:w-72 lg:bg-white/60 lg:backdrop-blur-lg lg:dark:bg-neutral-900/60 ${isSidebarOpen ? 'flex animate-fade-in' : 'hidden'}`}>
          {/* Logo Section */}
          <div className="p-4 lg:p-6 border-b border-neutral-200/50 flex shrink-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow hover-lift">
              <Bot className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gradient">MediMind</h1>
              <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">{session.email}</p>
            </div>
            {/* Close button visible only on mobile */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close chat navigation"
              className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 p-3 space-y-1 overflow-y-auto overscroll-y-contain scrollbar-premium">
            <button
              onClick={() => { startNewChat(); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${!activeThreadId ? 'bg-primary/10 text-primary shadow-subtle' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}
            >
              <MessageSquarePlus className="w-5 h-5" />
              New Chat
            </button>

            <button
              onClick={() => { setIsFilesModalOpen(true); setIsSidebarOpen(false); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl transition-all font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Files className="w-5 h-5" />
              Files
            </button>

            <div className="pt-5 pb-2">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> History
              </h3>
            </div>

            <div className="space-y-1">
              {historyThreads.map(thread => (
                <div
                  key={thread.id}
                  className={`w-full flex items-center gap-1 rounded-xl transition-all ${activeThreadId === thread.id ? 'bg-primary/10 shadow-subtle' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                >
                  <button
                    onClick={() => { loadThread(thread); setIsSidebarOpen(false); }}
                    disabled={thread.isVoice && isTyping}
                    className={`min-h-11 min-w-0 flex-1 text-left truncate p-3 text-[13px] font-medium ${activeThreadId === thread.id ? 'text-primary' : 'text-neutral-600 dark:text-neutral-400'}`}
                  >
                    {thread.title}
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => handleDeleteThread(e, thread)}
                        aria-label={`Delete chat: ${thread.title}`}
                        className="grid size-11 lg:size-8 mr-1.5 place-items-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Delete chat</p></TooltipContent>
                  </Tooltip>
                </div>
              ))}
              {historyThreads.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2 italic opacity-60">No past conversations</p>
              )}
            </div>
          </div>

          <div className="p-3 lg:p-4 border-t border-neutral-200/50 dark:border-neutral-700/50 flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-all"
                >
                  {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent><p>{theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}</p></TooltipContent>
            </Tooltip>
            <Button variant="ghost" className="h-11 flex-1 justify-start text-muted-foreground font-medium hover:text-foreground hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-4 lg:justify-end lg:px-8">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open chat navigation"
              aria-expanded={isSidebarOpen}
              aria-controls="chat-sidebar"
              className="grid size-11 shrink-0 place-items-center glass-card border border-neutral-200/50 dark:border-neutral-700/50 rounded-xl text-muted-foreground hover:text-primary transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsDashboardOpen(!isDashboardOpen)}
              aria-expanded={isDashboardOpen}
              aria-controls={isDashboardOpen ? 'chat-dashboard' : undefined}
              className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 lg:px-4 glass-card border rounded-xl text-sm font-semibold transition-colors shadow-subtle ${isDashboardOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'border-neutral-200/50 dark:border-neutral-700/50 text-muted-foreground hover:text-primary hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50'}`}
            >
              <LayoutDashboard className="size-5 lg:size-4" />
              <span className="sr-only lg:not-sr-only">Dashboard</span>
            </button>
          </header>

          <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 scrollbar-premium sm:px-4 lg:px-8 lg:py-6">
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`flex gap-2 sm:gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`} style={{ animationDelay: `${idx * 50}ms` }}>

                  {msg.role !== 'system' && msg.role !== 'error' && (
                    <Avatar className="size-6 sm:size-8 border border-neutral-200/50 shadow-subtle">
                      <AvatarFallback className={msg.role === 'user' ? 'bg-primary text-white text-xs' : 'bg-gradient-to-br from-primary/10 to-accent/10 text-primary text-xs font-bold'}>
                        {msg.role === 'user' ? 'U' : <Bot className="w-3.5 h-3.5" />}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`flex min-w-0 max-w-[88%] flex-col gap-1 xl:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} ${editingId === msg.id ? 'w-full' : ''}`}>
                    {/* Editing mode for user messages */}
                    {idx === editableMessageIndex && editingId === msg.id ? (
                      <div className="flex w-full max-w-md flex-wrap items-center justify-end gap-2">
                        <textarea
                          aria-label="Edit message text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              handleEditMessage(msg.id);
                            }
                            if (e.key === 'Escape') {
                              cancelEdit();
                            }
                          }}
                          className="min-h-11 min-w-0 basis-full sm:flex-1 px-3 py-2.5 rounded-xl border border-primary/30 bg-white/90 dark:bg-neutral-800/90 dark:text-foreground text-base font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-subtle resize-none overflow-y-auto"
                          rows={Math.min(editText.split('\n').length, 5)}
                          autoFocus
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleEditMessage(msg.id)}
                              aria-label="Save edit"
                              className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary/30 transition-all shadow-subtle"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Save edit</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={cancelEdit}
                              aria-label="Cancel edit"
                              className="grid size-11 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 transition-all shadow-subtle"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Cancel</p></TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <>
                        <div className="max-w-full">
                          <div
                            className={msg.isFile ? '' : `px-3 py-2.5 sm:px-5 sm:py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-subtle [overflow-wrap:anywhere] ${msg.role === 'user' ? 'message-user' :
                              msg.role === 'system' ? 'bg-emerald-50/80 backdrop-blur-sm text-emerald-800 rounded-xl border border-emerald-100/50 mx-auto text-center text-sm font-medium' :
                                msg.role === 'error' ? 'bg-red-50/80 backdrop-blur-sm text-red-700 rounded-xl border border-red-100/50 text-sm font-medium' :
                                  'message-ai'
                              }`}
                          >
                            {msg.role === 'ai' && !isVoiceThread ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:mb-2 prose-ul:my-2 prose-ol:my-2">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={markdownComponents}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : msg.isFile ? (
                              <div className="flex w-64 max-w-full items-center gap-2.5 sm:gap-3 bg-white dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700/80 rounded-2xl p-3 shadow-subtle">
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-xl text-blue-500">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200">{msg.fileName}</p>
                                  <p className="text-[11px] text-muted-foreground uppercase mt-0.5">{msg.fileBadge}</p>
                                </div>
                                <div className="text-emerald-500 dark:text-emerald-400 shrink-0">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap">{msg.content}</span>
                            )}
                          </div>
                        </div>

                        {idx === editableMessageIndex && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                                aria-label="Edit message"
                                className="grid size-11 lg:size-8 place-items-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p>Edit message</p></TooltipContent>
                          </Tooltip>
                        )}
                      </>
                    )}

                    {msg.role === 'ai' && !isVoiceThread && (
                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleFeedback(msg.id, true)}
                              disabled={msg.feedback}
                              aria-label="Helpful advice"
                              className={`grid size-11 lg:size-8 shrink-0 place-items-center rounded-lg hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-all ${msg.feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : ''}`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Helpful advice</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleFeedback(msg.id, false)}
                              disabled={msg.feedback}
                              aria-label="Inaccurate response"
                              className={`grid size-11 lg:size-8 shrink-0 place-items-center rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all ${msg.feedback === 'down' ? 'text-red-500 bg-red-50' : ''}`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Inaccurate (MediMind will relearn)</p></TooltipContent>
                        </Tooltip>

                        {msg.feedback === 'down' && <span className="text-[11px] font-medium text-muted-foreground italic ml-1">Noted. Will fix.</span>}
                        {msg.feedback === 'up' && <span className="text-[11px] font-medium text-emerald-600 italic flex items-center gap-1 ml-1"><CheckCircle2 className="w-3 h-3" /></span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-2 sm:gap-4 flex-row animate-fade-in">
                  <Avatar className="size-6 sm:size-8 border border-neutral-200/50 shadow-subtle">
                    <AvatarFallback className="bg-gradient-to-br from-primary/10 to-accent/10 text-primary text-xs font-bold">
                      <Bot className="w-3.5 h-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="px-5 py-4 message-ai shadow-subtle flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm font-medium text-muted-foreground">MediMind is thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Box */}
          <div className="shrink-0 px-3 py-2 sm:px-4 sm:pb-4 lg:px-8">
            {historyError && <p role="alert" className="mb-2 text-center text-sm text-destructive">{historyError}</p>}
            <form onSubmit={handleSend} className="max-w-3xl mx-auto flex items-end glass-card rounded-2xl focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-shadow shadow-glass p-1.5 sm:p-2 gap-1 sm:gap-2">
              {isVoiceThread ? (
                <p className="flex min-h-11 flex-1 items-center px-3 text-sm text-muted-foreground">Saved voice transcript</p>
              ) : (
                <>
                  <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleFileUpload} disabled={isUploading} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Upload case file (PDF)"
                        onClick={() => fileInputRef.current.click()}
                        disabled={isUploading}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Upload Case File (PDF)</p></TooltipContent>
                  </Tooltip>

                  <textarea
                    aria-label="Message MediMind"
                    enterKeyHint="send"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (input.trim()) handleSend();
                      }
                    }}
                    placeholder="Message MediMind..."
                    className="min-h-11 min-w-0 flex-1 border-0 focus-visible:ring-0 outline-none shadow-none py-2.5 text-base bg-transparent font-medium placeholder:text-neutral-400 resize-none overflow-y-auto"
                    rows={Math.min(input.split('\n').length || 1, 5)}
                    disabled={isTyping}
                  />
                </>
              )}
              <VoiceChat accessToken={session.access_token} disabled={isTyping || isUploading} onSaved={showSavedVoiceThread} />
              {!isVoiceThread && (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={isTyping || !input.trim()}
                  className="shrink-0 size-11 rounded-xl bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-glow transition-all hover:scale-105 active:scale-95 text-white"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </Button>
              )}
            </form>
            {uploadStatus && <div className="max-w-3xl mx-auto text-center mt-2 animate-fade-in"><p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold"><Sparkles className="w-3 h-3" />{uploadStatus}</p></div>}
            <div className="text-center mt-1.5 sm:mt-2 text-[11px] font-medium text-muted-foreground">
              AI can make mistakes. Always verify medical information with a doctor.
            </div>
          </div>
        </main>

        {/* Dashboard Backdrop (mobile) */}
        {isDashboardOpen && (
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
            onClick={() => setIsDashboardOpen(false)}
          />
        )}

        {/* Right Sidebar (Dashboard) */}
        {isDashboardOpen && (
          <aside id="chat-dashboard" aria-labelledby="dashboard-title" className="absolute inset-y-0 right-0 z-40 flex w-[min(20rem,88%)] shrink-0 flex-col border-l border-neutral-200/50 bg-background shadow-glass dark:border-neutral-700/50 lg:relative lg:z-10 lg:w-80 lg:bg-neutral-50/50 lg:backdrop-blur-lg lg:dark:bg-neutral-900/50 animate-fade-in">
            <div className="p-3 sm:p-5 border-b border-neutral-200/50 dark:border-neutral-700/50 flex shrink-0 items-center justify-between gap-2">
              <h2 id="dashboard-title" className="text-lg font-bold text-foreground flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                Dashboard
              </h2>
              <button onClick={() => setIsDashboardOpen(false)} aria-label="Close dashboard" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3 sm:p-5 space-y-6 overflow-y-auto overscroll-y-contain scrollbar-premium">
              {/* Uploaded Assets */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Uploaded Assets</h3>
                <div className="space-y-2">
                  {uploadedFiles.length === 0 ? (
                    <div className="text-center py-4 text-neutral-400 flex flex-col items-center gap-2 border border-dashed border-neutral-200/50 dark:border-neutral-700/50 rounded-xl bg-white/30 dark:bg-neutral-800/30">
                      <FileText className="w-6 h-6 opacity-40" />
                      <p className="text-xs font-medium">No assets yet.</p>
                    </div>
                  ) : (
                    uploadedFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 bg-white/80 dark:bg-neutral-800/80 shadow-subtle list-item-glow">
                        <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg text-orange-500 flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 truncate">
                          <p className="text-xs font-bold truncate text-foreground">{file.filename}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Indexed</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reported Symptoms */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Reported Symptoms</h3>
                  <button onClick={fetchSymptoms} className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors" aria-label="Refresh symptoms">
                    <Activity className={`w-3.5 h-3.5 ${isSymptomsLoading ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
                {isSymptomsLoading ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-medium">Analyzing history...</span>
                  </div>
                ) : symptoms.length === 0 ? (
                  <div className="text-center py-4 text-neutral-400 flex flex-col items-center gap-2 border border-dashed border-neutral-200/50 dark:border-neutral-700/50 rounded-xl bg-white/30 dark:bg-neutral-800/30">
                    <Activity className="w-6 h-6 opacity-40" />
                    <p className="text-xs font-medium">No symptoms reported yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {symptoms.map((symptom, i) => {
                      const isObj = typeof symptom === 'object' && symptom !== null;
                      const name = isObj ? symptom.name : symptom;
                      const type = isObj ? symptom.type : 'active';
                      const isChronic = type === 'chronic';

                      return (
                        <span key={i} className={`max-w-full px-3 py-1.5 rounded-full text-xs font-bold border shadow-subtle flex items-center gap-1.5 [overflow-wrap:anywhere] ${
                          isChronic 
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800/30' 
                            : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/30'
                        }`}>
                          <Activity className="size-3 shrink-0 opacity-70" />
                          <span className="min-w-0">{name}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Files Modal */}
        {isFilesModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div role="dialog" aria-labelledby="files-title" className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-background shadow-glass-strong">
              <div className="flex shrink-0 items-center justify-between gap-2 p-3 sm:p-5 border-b border-neutral-200/50 dark:border-neutral-700/50">
                <h2 id="files-title" className="text-lg font-bold flex items-center gap-2">
                  <Files className="w-5 h-5 text-primary" />
                  Uploaded Case Files
                </h2>
                <button
                  onClick={() => setIsFilesModalOpen(false)}
                  aria-label="Close uploaded case files"
                  className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="min-h-0 max-h-[60dvh] overflow-y-auto overscroll-y-contain p-3 sm:p-5 space-y-3">
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 flex flex-col items-center gap-3">
                    <FileText className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">No files uploaded yet.</p>
                  </div>
                ) : (
                  uploadedFiles.map((file, i) => (
                    <div key={i} className="flex flex-col gap-2 p-3 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 bg-white/50 dark:bg-neutral-800/50">
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg text-primary flex-shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-[13px] font-semibold [overflow-wrap:anywhere]">{file.filename}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {file.is_temporary && <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 px-1.5 py-0.5 rounded-sm flex-shrink-0">24h Temp</span>}
                            {file.in_chat_only && <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 px-1.5 py-0.5 rounded-sm flex-shrink-0">In-Chat Only</span>}
                            <p className="text-[11px] text-muted-foreground">{file.is_temporary || file.in_chat_only ? 'Indexed (Scoped)' : 'Indexed Globally'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1 border-t border-neutral-200/50 dark:border-neutral-700/50">
                        <div className="flex flex-wrap items-center gap-x-3">
                          <label className="flex min-h-11 items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={file.is_temporary}
                              onChange={(e) => handleUpdateFileScope(file.filename, e.target.checked, file.in_chat_only)}
                              className="size-4 accent-primary"
                            />
                            Temp File
                          </label>
                          <label className="flex min-h-11 items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={file.in_chat_only}
                              onChange={(e) => handleUpdateFileScope(file.filename, file.is_temporary, e.target.checked)}
                              className="size-4 accent-primary"
                            />
                            In-Chat Only
                          </label>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(file.filename)}
                          aria-label={`Delete file: ${file.filename}`}
                          className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="shrink-0 p-3 sm:p-4 border-t border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50 dark:bg-neutral-900/50">
                <p className="text-xs text-center text-muted-foreground">
                  Files are automatically vectorized to personalize your insights. You can attach new ones using the paperclip icon in chat.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
