import { useEffect, useRef, useState } from 'react';
import { AudioLines, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { startVoiceSession } from '@/lib/liveVoice';

const statusLabels = {
  microphone: 'Waiting for microphone access…',
  connecting: 'Connecting to Medimind…',
  listening: 'Listening',
  speaking: 'MediMind is speaking',
  ended: 'Voice session ended',
  saving: 'Saving conversation…',
};

// Save only new captions, using the same session ID for retries and navigation.
function saveTranscript(accessToken, transcript, keepalive = false) {
  const messages = Object.values(transcript.turns).flatMap(turn => [
    { role: 'user', content: turn.You?.trim() },
    { role: 'ai', content: turn.MediMind?.trim() },
  ]).filter(message => message.content);
  if (!messages.length) return null;

  transcript.sessionId ??= crypto.randomUUID();
  const { threadId, sessionId } = transcript;
  const path = threadId ? `/api/voice/threads/${threadId}/sessions` : '/api/voice/threads';
  const body = threadId ? { session_id: sessionId, messages } : { thread_id: sessionId, messages };
  return fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
    signal: keepalive ? undefined : AbortSignal.timeout?.(15_000),
  });
}

// Start or continue a voice thread and save its new turns when the session ends.
export default function VoiceChat({ accessToken, disabled, threadId, history, onSaved }) {
  const dialog = useRef(null);
  const session = useRef(null);
  const captions = useRef(null);
  const transcript = useRef(null);
  const [status, setStatus] = useState('microphone');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [turns, setTurns] = useState({});

  // Follow new captions when the reader is near the bottom of the transcript.
  useEffect(() => {
    const panel = captions.current;
    if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [turns]);

  // Try to save on navigation too. The same transcript ID makes a concurrent save safe.
  useEffect(() => {
    const voiceDialog = dialog.current;
    const endSession = () => {
      session.current?.stop();
      session.current = null;
      if (voiceDialog.open) voiceDialog.close();
    };
    const onPageHide = () => {
      const conversation = transcript.current;
      transcript.current = null;
      endSession();
      if (conversation) saveTranscript(accessToken, conversation, true)?.catch(() => {});
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      transcript.current = null;
      endSession();
    };
  }, [accessToken]);

  // Open the dialog and start a new microphone and Gemini session from the same click.
  function start() {
    if (dialog.current.open) return;
    dialog.current.showModal();
    setStatus('microphone');
    setMuted(false);
    setError('');
    setSaveError('');
    setTurns({});
    const conversation = { threadId, sessionId: null, turns: {}, saving: false };
    transcript.current = conversation;
    session.current = startVoiceSession(accessToken, {
      history,
      onStatus: setStatus,
      onTranscript(turn, speaker, text) {
        // Keep the latest captions available even before React renders the update.
        const previous = conversation.turns[turn];
        conversation.turns = {
          ...conversation.turns,
          [turn]: { ...previous, [speaker]: (previous?.[speaker] || '') + text },
        };
        setTurns(conversation.turns);
      },
      onError(message) {
        setError(message);
        void end(false);
      },
    });
  }

  // Clear the transcript only when it has been saved or the user dismisses it.
  function close() {
    transcript.current = null;
    dialog.current.close();
    setTurns({});
  }

  // Release audio immediately, then wait for the save before opening the thread.
  async function end(closeEmpty = true) {
    session.current?.stop();
    session.current = null;
    const conversation = transcript.current;
    if (!conversation || conversation.saving) return;

    setSaveError('');
    try {
      const request = saveTranscript(accessToken, conversation);
      if (!request) {
        setStatus('ended');
        if (closeEmpty) close();
        return;
      }
      conversation.saving = true;
      setStatus('saving');
      const response = await request;
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === 'string' ? data.detail : 'Could not save the conversation.');
      }
      const saved = await response.json();
      if (!saved.thread?.id || !Array.isArray(saved.messages)) throw new Error('Could not confirm the saved conversation. Try again.');
      if (transcript.current !== conversation) return;
      close();
      onSaved(saved);
    } catch (failure) {
      if (transcript.current !== conversation) return;
      setStatus('ended');
      setSaveError(failure instanceof TypeError || failure.name === 'TimeoutError'
        ? 'Could not reach the server. Try saving again.' : failure.message);
    } finally {
      conversation.saving = false;
    }
  }

  // Pause or resume microphone capture without closing the conversation.
  function toggleMute() {
    session.current?.setMuted(!muted);
    setMuted(!muted);
  }

  const active = status === 'listening' || status === 'speaking';
  const connecting = status === 'microphone' || status === 'connecting';
  const saving = status === 'saving';
  const label = muted && status === 'listening' ? 'Microphone muted' : statusLabels[status];
  const turnList = Object.entries(turns);
  const startLabel = threadId ? 'Continue voice chat' : 'Start voice chat';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size={threadId ? 'default' : 'icon'}
            variant="ghost"
            aria-label={startLabel}
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={start}
            className={`h-11 shrink-0 rounded-xl text-primary [&_svg]:size-5 ${threadId ? 'px-3' : 'w-11'}`}
          >
            <AudioLines />
            {threadId && <span>{startLabel}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent><p>{startLabel}</p></TooltipContent>
      </Tooltip>

      <dialog
        ref={dialog}
        aria-labelledby="voice-chat-title"
        onCancel={event => { event.preventDefault(); if (!saving) void end(); }}
        className="fixed inset-0 m-auto w-[calc(100%-1.5rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-background p-4 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-6"
      >
        <div className="text-center">
          <h2 id="voice-chat-title" className="text-xl font-semibold">MediMind Voice</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {transcript.current?.threadId
              ? 'Gemini uses your recent transcript for context. New turns are saved to this conversation.'
              : 'Gemini processes live audio. The transcript is saved to History when the chat ends.'}
          </p>
          <div className="relative mx-auto mt-5 grid size-20 place-items-center rounded-full bg-primary/10 text-primary">
            {status === 'speaking' && <span className="absolute inset-0 rounded-full bg-primary/15 motion-safe:animate-ping" />}
            {connecting || saving ? <Loader2 className="size-7 animate-spin" /> : <AudioLines className="relative size-8" />}
          </div>
          <p role="status" className="mt-3 text-sm font-semibold">{label}</p>
        </div>

        <div ref={captions} role="region" aria-label="Voice captions" tabIndex={0} className="mt-4 h-32 space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/40 p-3 text-sm sm:h-44">
          {!turnList.length && <p className="text-muted-foreground">Captions appear here as you talk.</p>}
          {turnList.map(([turn, captions]) => (
            <div key={turn} className="space-y-2 break-words">
              {captions.You && <p><strong>You</strong><br />{captions.You}</p>}
              {captions.MediMind && <p><strong className="text-primary">MediMind</strong><br />{captions.MediMind}</p>}
            </div>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {saveError && <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {status !== 'ended' && !saving && (
            <Button type="button" variant="secondary" disabled={!active} onClick={toggleMute}>
              {muted ? <MicOff /> : <Mic />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
          )}
          {saveError && <Button type="button" variant="secondary" onClick={close}>Close without saving</Button>}
          {!saving && (
            <Button type="button" variant="destructive" onClick={() => void end()}>
              <PhoneOff />
              {saveError ? 'Retry save' : status === 'ended' ? 'Close' : 'End voice chat'}
            </Button>
          )}
        </div>
      </dialog>
    </>
  );
}
