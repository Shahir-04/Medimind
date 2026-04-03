import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, ThumbsUp, ThumbsDown, LogOut, Loader2, CheckCircle2, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function Chat({ session, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

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
    fetchMemoryAndSetWelcome();
  }, [session]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const currentMessages = messages; // snapshot before setState
    const userMessage = { id: Date.now(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Build history for the LLM (exclude system messages, map 'ai' -> 'assistant')
    const history = currentMessages
      .filter(m => m.role === 'user' || m.role === 'ai')
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ user_email: session.email, message: userMessage.content, history })
      });

      if (!res.ok) throw new Error('Failed to get response');
      const data = await res.json();
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'error', content: "Connection Error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setUploadStatus('Analyzing PDF...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_email', session.email);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      await res.json();
      setUploadStatus('');
      setMessages((prev) => [...prev, { id: Date.now(), role: 'system', content: `📄 Successfully scanned and vectorized: ${file.name}` }]);
    } catch {
      setUploadStatus('Failed to upload PDF.');
      setTimeout(() => setUploadStatus(''), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFeedback = async (msgId, isPositive) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: isPositive ? 'up' : 'down' } : m));
    if (!isPositive) {
      const msg = messages.find(m => m.id === msgId);
      if (msg) {
        try {
          await fetch('/api/memory/add', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ user_email: session.email, fact: `User explicitly rejected this advice: "${msg.content}". Do not repeat.` })
          });
        } catch (e) { }
      }
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-[100vh] bg-gradient-to-br from-neutral-50 via-blue-50/20 to-sky-50/10 font-sans overflow-hidden">
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

          <div className="flex-1 p-4">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">Data Sources</h3>
            <label className="flex items-center gap-3 p-3.5 glass-subtle rounded-xl cursor-pointer hover:bg-primary/5 hover:border-primary/20 hover:shadow-subtle transition-all group">
              <div className="bg-neutral-100/80 p-2.5 rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                {isUploading ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Paperclip className="w-4 h-4 text-neutral-500 group-hover:text-primary" />}
              </div>
              <div className="flex-1 overflow-hidden">
                <span className="text-sm font-semibold text-neutral-700 group-hover:text-primary block truncate transition-colors">Upload Case File</span>
                <span className="text-[10px] text-muted-foreground">PDF standard format</span>
              </div>
              <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
            {uploadStatus && <p className="text-xs font-semibold text-primary mt-2.5 px-2 animate-pulse flex items-center gap-1.5"><Sparkles className="w-3 h-3" />{uploadStatus}</p>}
          </div>

          <div className="p-4 border-t border-neutral-200/50">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground font-medium hover:text-foreground hover:bg-neutral-100/50" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full relative">
          <div className="absolute top-0 w-full h-12 bg-gradient-to-b from-background via-background to-transparent z-10 pointer-events-none"></div>

          <ScrollArea className="flex-1 px-4 md:px-8 py-6 pb-44 relative scrollbar-premium">
            <div className="max-w-3xl mx-auto space-y-8 pt-4">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`flex gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`} style={{ animationDelay: `${idx * 50}ms` }}>

                  {msg.role !== 'system' && msg.role !== 'error' && (
                    <Avatar className="w-8 h-8 border border-neutral-200/50 shadow-subtle">
                      <AvatarFallback className={msg.role === 'user' ? 'bg-primary text-white text-xs' : 'bg-gradient-to-br from-primary/10 to-accent/10 text-primary text-xs font-bold'}>
                        {msg.role === 'user' ? 'U' : <Bot className="w-3.5 h-3.5" />}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap shadow-subtle ${msg.role === 'user' ? 'message-user' :
                          msg.role === 'system' ? 'bg-emerald-50/80 backdrop-blur-sm text-emerald-800 rounded-xl border border-emerald-100/50 mx-auto text-center text-sm font-medium' :
                            msg.role === 'error' ? 'bg-red-50/80 backdrop-blur-sm text-red-700 rounded-xl border border-red-100/50 text-sm font-medium' :
                              'message-ai'
                        }`}
                    >
                      {msg.content}
                    </div>

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
          <div className="absolute bottom-0 w-full bg-gradient-to-t from-background via-background/95 to-background/0 pt-12 pb-6 px-4 md:px-8">
            <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-center glass-card rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-all shadow-glass">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message MediMind..."
                className="w-full border-0 focus-visible:ring-0 shadow-none pl-6 pr-14 py-6 text-[15px] bg-transparent font-medium placeholder:text-neutral-400"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isTyping || !input.trim()}
                className="absolute right-2 rounded-full bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 h-9 w-9 shadow-glow transition-all hover:scale-105 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <div className="text-center mt-3.5 text-[11px] font-medium text-muted-foreground">
              AI can make mistakes. Always verify medical information with a doctor.
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
