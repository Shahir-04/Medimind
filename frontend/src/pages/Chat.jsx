import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, ThumbsUp, ThumbsDown, LogOut, Loader2, CheckCircle2, Bot, Sparkles, Pencil, Check, X, Sun, Moon, MessageSquarePlus, History, Files, FileText, Trash2, LayoutDashboard, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useTheme } from '@/lib/useTheme';

export default function Chat({ session, onLogout }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isTempUpload, setIsTempUpload] = useState(false);
  const [isInChatOnly, setIsInChatOnly] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [symptoms, setSymptoms] = useState([]);
  const [isSymptomsLoading, setIsSymptomsLoading] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

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

  useEffect(() => {
    if (!session) return;
    const fetchMemoryAndSetWelcome = async () => {
      try {
        const res = await fetch(`/api/memory/${encodeURIComponent(session.email)}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          const memoryArray = Array.isArray(data.memories) ? data.memories : (data.memories?.results || []);
          const isMemoryEmpty = memoryArray.length === 0;

          setMessages([{
            id: 1,
            role: 'ai',
            content: isMemoryEmpty
              ? "Welcome to MediMind! 🌿\n\nTo provide you with highly personalized medical insights, I'd like to get to know you a bit better. To start, what is your name?"
              : "Welcome back to MediMind! 🌿\n\nHow can I help you today?"
          }]);
        }
      } catch (err) {
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
  }, [session, activeThreadId]);

  const loadThread = async (threadId) => {
    setActiveThreadId(threadId);
    try {
      const res = await fetch(`/api/messages/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map(m => ({ id: m.id, role: m.role, content: m.content })));
        }
      }
    } catch (e) { }
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

  const startNewChat = () => {
    cleanupTempFiles();
    setActiveThreadId(null);
    setMessages([{ id: 1, role: 'ai', content: "Welcome to MediMind! 🌿\n\nHow can I help you today?" }]);
  };

  const handleDeleteThread = async (e, threadId) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        if (activeThreadId === threadId) {
          startNewChat();
        }
      }
    } catch (e) {}
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
      .filter(m => m.role === 'user' || m.role === 'ai')
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

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const currentMessages = messages;
    const userMessage = { id: Date.now(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    await sendMessageToBackend(userMessage.content, currentMessages);
  };

  const handleEditMessage = async (msgId) => {
    if (!editText.trim()) return;

    // Find the index of the message being edited
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Keep all messages before the edited one, then add the edited message
    const messagesBeforeEdit = messages.slice(0, msgIndex);
    const editedMessage = { ...messages[msgIndex], content: editText };
    const newMessages = [...messagesBeforeEdit, editedMessage];

    setMessages(newMessages);
    setEditingId(null);
    setEditText('');
    setIsTyping(true);

    // Re-send with the corrected message and the history before it
    await sendMessageToBackend(editText, messagesBeforeEdit);
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
      <div className={`flex h-[100vh] font-sans overflow-hidden ${resolvedTheme === 'dark' ? 'bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950' : 'bg-gradient-to-br from-neutral-50 via-blue-50/20 to-sky-50/10'}`}>
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
          <div className="absolute bottom-20 right-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-pulse-soft animation-delay-1000" />
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-72 glass-card border-r border-neutral-200/50 flex flex-col z-10 animate-slide-down">
          {/* Logo Section */}
          <div className="p-6 border-b border-neutral-200/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow hover-lift">
              <Bot className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gradient">MediMind</h1>
              <p className="text-[11px] font-medium text-muted-foreground truncate mt-0.5">{session.email}</p>
            </div>
          </div>

          <div className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-premium flex flex-col">
            <button
              onClick={startNewChat}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${!activeThreadId ? 'bg-primary/10 text-primary shadow-subtle' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}
            >
              <MessageSquarePlus className="w-5 h-5" />
              New Chat
            </button>

            <button
              onClick={() => setIsFilesModalOpen(true)}
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

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {threads.map(thread => (
                <div
                  key={thread.id}
                  className={`group/thread w-full flex items-center gap-1 rounded-xl transition-all ${activeThreadId === thread.id ? 'bg-primary/10 shadow-subtle' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                >
                  <button
                    onClick={() => loadThread(thread.id)}
                    className={`flex-1 text-left truncate p-3 text-[13px] font-medium ${activeThreadId === thread.id ? 'text-primary' : 'text-neutral-600 dark:text-neutral-400'}`}
                  >
                    {thread.title}
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => handleDeleteThread(e, thread.id)}
                        className="p-1.5 mr-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover/thread:opacity-100 transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Delete chat</p></TooltipContent>
                  </Tooltip>
                </div>
              ))}
              {threads.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2 italic opacity-60">No past conversations</p>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-neutral-200/50 dark:border-neutral-700/50 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-all"
                >
                  {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent><p>{theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}</p></TooltipContent>
            </Tooltip>
            <Button variant="ghost" className="flex-1 justify-start text-muted-foreground font-medium hover:text-foreground hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full relative">
          <div className="absolute top-0 right-0 p-4 md:p-6 z-30">
            <button
              onClick={() => setIsDashboardOpen(!isDashboardOpen)}
              className={`flex items-center gap-2 px-4 py-2 glass-card border rounded-xl text-sm font-semibold transition-all shadow-subtle ${isDashboardOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'border-neutral-200/50 dark:border-neutral-700/50 text-neutral-500 hover:text-primary hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          <div className="absolute top-0 w-full h-12 bg-gradient-to-b from-background via-background to-transparent z-10 pointer-events-none"></div>

          <ScrollArea className="flex-1 px-4 md:px-8 py-6 pb-44 relative scrollbar-premium">
            <div className="max-w-3xl mx-auto space-y-8 pt-4">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`group flex gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`} style={{ animationDelay: `${idx * 50}ms` }}>

                  {msg.role !== 'system' && msg.role !== 'error' && (
                    <Avatar className="w-8 h-8 border border-neutral-200/50 shadow-subtle">
                      <AvatarFallback className={msg.role === 'user' ? 'bg-primary text-white text-xs' : 'bg-gradient-to-br from-primary/10 to-accent/10 text-primary text-xs font-bold'}>
                        {msg.role === 'user' ? 'U' : <Bot className="w-3.5 h-3.5" />}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {/* Editing mode for user messages */}
                    {msg.role === 'user' && editingId === msg.id ? (
                      <div className="flex items-center gap-2 w-full min-w-[200px] md:min-w-[400px]">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleEditMessage(msg.id);
                            }
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditText('');
                            }
                          }}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-primary/30 bg-white/90 dark:bg-neutral-800/90 dark:text-foreground text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-subtle min-h-[44px] resize-none overflow-y-auto"
                          rows={Math.min(editText.split('\n').length, 5)}
                          autoFocus
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleEditMessage(msg.id)}
                              className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary/30 transition-all shadow-subtle"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Save edit</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => { setEditingId(null); setEditText(''); }}
                              className="p-2 rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 transition-all shadow-subtle"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Cancel</p></TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <div
                            className={msg.isFile ? '' : `px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-subtle ${msg.role === 'user' ? 'message-user' :
                              msg.role === 'system' ? 'bg-emerald-50/80 backdrop-blur-sm text-emerald-800 rounded-xl border border-emerald-100/50 mx-auto text-center text-sm font-medium' :
                                msg.role === 'error' ? 'bg-red-50/80 backdrop-blur-sm text-red-700 rounded-xl border border-red-100/50 text-sm font-medium' :
                                  'message-ai'
                              }`}
                          >
                            {msg.role === 'ai' ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:mb-2 prose-ul:my-2 prose-ol:my-2">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : msg.isFile ? (
                              <div className="flex items-center gap-4 bg-white dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700/80 rounded-2xl p-3 shadow-subtle min-w-[250px]">
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-xl text-blue-500">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1 overflow-hidden pr-4">
                                  <p className="text-sm font-semibold truncate text-neutral-800 dark:text-neutral-200">{msg.fileName}</p>
                                  <p className="text-[11px] text-muted-foreground uppercase mt-0.5">{msg.fileBadge}</p>
                                </div>
                                <div className="text-emerald-500 dark:text-emerald-400 mr-2 flex-shrink-0">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap">{msg.content}</span>
                            )}
                          </div>

                          {/* Edit button for user messages */}
                          {msg.role === 'user' && !isTyping && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                                  className="absolute -left-9 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-300 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent><p>Edit message</p></TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </>
                    )}

                    {msg.role === 'ai' && (
                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleFeedback(msg.id, true)}
                              disabled={msg.feedback}
                              className={`p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition-all ${msg.feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : ''}`}
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
                              className={`p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-all ${msg.feedback === 'down' ? 'text-red-500 bg-red-50' : ''}`}
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
                <div className="flex gap-4 flex-row animate-fade-in">
                  <Avatar className="w-8 h-8 border border-neutral-200/50 shadow-subtle">
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
              <div ref={messagesEndRef} className="h-40" />
            </div>
          </ScrollArea>

          {/* Input Box */}
          <div className="absolute bottom-0 w-full bg-gradient-to-t from-background via-background/95 to-background/0 pt-12 pb-6 px-4 md:px-8 z-20">
            <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-end glass-card rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-all shadow-glass p-2 gap-2">
              <div className="flex-shrink-0 relative flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex items-center justify-center w-10 h-10 rounded-r-xl cursor-pointer text-neutral-400 hover:text-primary hover:bg-primary/5 transition-all mb-0.5">
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent><p>Upload Case File (PDF)</p></TooltipContent>
                </Tooltip>
              </div>

              <div className="flex-1 relative flex flex-col justify-center">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim()) handleSend();
                    }
                  }}
                  placeholder="Message MediMind..."
                  className="w-full border-0 focus-visible:ring-0 outline-none shadow-none py-3 text-[15px] bg-transparent font-medium placeholder:text-neutral-400 resize-none overflow-y-auto"
                  style={{ minHeight: '44px' }}
                  rows={Math.min(input.split('\n').length || 1, 5)}
                  disabled={isTyping}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={isTyping || !input.trim()}
                className="flex-shrink-0 w-10 h-10 mb-0.5 rounded-xl bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-glow transition-all hover:scale-105 active:scale-95 text-white"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </Button>
            </form>
            {uploadStatus && <div className="max-w-3xl mx-auto text-center mt-2 animate-fade-in"><p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold"><Sparkles className="w-3 h-3" />{uploadStatus}</p></div>}
            <div className="text-center mt-3.5 text-[11px] font-medium text-muted-foreground">
              AI can make mistakes. Always verify medical information with a doctor.
            </div>
          </div>
        </div>

        {/* Right Sidebar (Dashboard) */}
        {isDashboardOpen && (
          <div className="w-full md:w-80 glass-card border-l border-neutral-200/50 dark:border-neutral-700/50 flex flex-col z-10 animate-slide-left bg-neutral-50/50 dark:bg-neutral-900/50">
            <div className="p-5 border-b border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between space-x-2">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                Dashboard
              </h2>
              <button onClick={() => setIsDashboardOpen(false)} className="p-1.5 rounded-lg text-neutral-400 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-5 space-y-6 overflow-y-auto scrollbar-premium">
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
                  <button onClick={fetchSymptoms} className="text-neutral-400 hover:text-primary transition-colors" title="Refresh symptoms">
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
                    {symptoms.map((symptom, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-100 dark:border-blue-800/30 shadow-subtle flex items-center justify-center">
                        {symptom}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Files Modal */}
      {isFilesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-card rounded-2xl shadow-glass-strong overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-neutral-200/50 dark:border-neutral-700/50">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Files className="w-5 h-5 text-primary" />
                Uploaded Case Files
              </h2>
              <button
                onClick={() => setIsFilesModalOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3">
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-8 text-neutral-400 flex flex-col items-center gap-3">
                  <FileText className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">No files uploaded yet.</p>
                </div>
              ) : (
                uploadedFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50 bg-white/50 dark:bg-neutral-800/50 list-item-glow group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="bg-primary/10 p-2 rounded-lg text-primary flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 truncate">
                        <p className="text-[13px] font-semibold truncate flex items-center gap-1.5">
                          {file.filename}
                          {file.is_temporary && <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 px-1.5 py-0.5 rounded-sm flex-shrink-0">24h Temp</span>}
                          {file.in_chat_only && <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 px-1.5 py-0.5 rounded-sm flex-shrink-0">In-Chat Only</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{file.is_temporary || file.in_chat_only ? 'Indexed (Scoped)' : 'Indexed Globally'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex flex-col gap-1.5 border-r border-neutral-200/50 dark:border-neutral-700/50 pr-3 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <label className="flex items-center gap-1.5 text-[10px] font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={file.is_temporary}
                            onChange={(e) => handleUpdateFileScope(file.filename, e.target.checked, file.in_chat_only)}
                            className="rounded border-neutral-300 text-primary focus:ring-primary h-3 w-3"
                          />
                          Temp File
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={file.in_chat_only}
                            onChange={(e) => handleUpdateFileScope(file.filename, file.is_temporary, e.target.checked)}
                            className="rounded border-neutral-300 text-primary focus:ring-primary h-3 w-3"
                          />
                          In-Chat Only
                        </label>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.filename)}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50 dark:bg-neutral-900/50">
              <p className="text-xs text-center text-muted-foreground">
                Files are automatically vectorized to personalize your insights. You can attach new ones using the paperclip icon in chat.
              </p>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}
