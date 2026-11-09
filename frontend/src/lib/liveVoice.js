const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const WORKLET_URL = `${import.meta.env.BASE_URL}voice-capture.worklet.js`;
const CONNECTION_TIMEOUT = 20_000;
const MAX_QUEUED_INPUT = 256 * 1024;
const MAX_HISTORY_CHARACTERS = 40_000;
const MAX_HISTORY_MESSAGES = 120;

// Keep the newest whole messages so a long thread still leaves room for live audio.
function prepareHistory(history) {
  const turns = [];
  let remaining = MAX_HISTORY_CHARACTERS;
  for (const { role, content } of history.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (content.length > remaining) break;
    remaining -= content.length;
    turns.push({ role: role === 'ai' ? 'model' : 'user', parts: [{ text: content }] });
  }
  return turns.reverse();
}

// Use the signed-in MediMind session to get a credential for one Live connection.
async function requestVoiceToken(accessToken, signal, resume) {
  const path = resume ? '/api/voice/session?resume=true' : '/api/voice/session';
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.token || !data?.model) {
    throw new Error(data?.detail || 'Could not start voice chat. Try again shortly.');
  }
  return data;
}

// Start on a user gesture so browsers can authorize audio playback.
export function startVoiceSession(accessToken, { history = [], onStatus, onTranscript, onError }) {
  const abort = new AbortController();
  const playback = new Set();
  const historyTurns = prepareHistory(history);
  let audio;
  let microphone;
  let capture;
  let socket;
  let connectionTimer;
  let nextPlaybackTime = 0;
  let muted = false;
  let generation = 0;
  let ready = false;
  let turn = 0;

  // Cancel active and queued replies as soon as Gemini detects an interruption.
  function stopPlayback() {
    for (const source of playback) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    playback.clear();
    nextPlaybackTime = 0;
  }

  // Release everything even if permission, token issuance, or setup is still pending.
  function stop() {
    if (abort.signal.aborted) return;
    abort.abort();
    clearTimeout(connectionTimer);
    microphone?.getTracks().forEach(track => track.stop());
    if (capture) {
      capture.port.close();
      capture.disconnect();
    }
    socket?.close();
    stopPlayback();
    if (audio) void audio.close().catch(() => {});
  }

  // Ignore errors from callbacks that finish after the user ends the session.
  function fail(message) {
    if (abort.signal.aborted) return;
    stop();
    onError(message);
  }

  // Schedule PCM chunks consecutively so network bursts do not overlap playback.
  function play({ data, mimeType }) {
    if (!data || !mimeType?.startsWith('audio/pcm')) return;
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
    const pcm = new DataView(bytes.buffer);
    const sampleCount = Math.floor(bytes.length / 2);
    if (!sampleCount) return;
    const buffer = audio.createBuffer(1, sampleCount, rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = pcm.getInt16(i * 2, true) / 32768;
    }

    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.onended = () => {
      source.disconnect();
      playback.delete(source);
      if (!playback.size && !abort.signal.aborted) onStatus('listening');
    };
    const startTime = nextPlaybackTime > audio.currentTime ? nextPlaybackTime : audio.currentTime + 0.03;
    source.start(startTime);
    nextPlaybackTime = startTime + buffer.duration;
    if (!playback.size) onStatus('speaking');
    playback.add(source);
  }

  // Forward current microphone chunks only after Gemini acknowledges setup.
  function sendAudio({ data }) {
    if (abort.signal.aborted || muted || data.generation !== generation || !ready || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_QUEUED_INPUT) {
      fail('The connection is too slow for live audio. Start a new voice chat to try again.');
      return;
    }
    const bytes = new Uint8Array(data.pcm);
    socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: btoa(String.fromCharCode(...bytes)),
          mimeType: `audio/pcm;rate=${Math.min(audio.sampleRate, 16000)}`,
        },
      },
    }));
  }

  // Pause the microphone and tell Gemini to finish any buffered speech.
  function setMuted(value) {
    if (!ready || abort.signal.aborted || muted === value) return;
    muted = value;
    generation += 1;
    microphone.getAudioTracks().forEach(track => { track.enabled = !muted; });
    capture.port.postMessage({ muted, generation });
    if (muted && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  // Dispatch captions and audio in WebSocket order, including binary JSON frames.
  function receive({ data }) {
    if (abort.signal.aborted) return;
    try {
      const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      if (message.setupComplete && !ready) {
        if (historyTurns.length) {
          // Gemini imports this initial history without generating a reply until new input arrives.
          socket.send(JSON.stringify({ clientContent: { turns: historyTurns, turnComplete: true } }));
        }
        clearTimeout(connectionTimer);
        ready = true;
        onStatus('listening');
      }
      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        stopPlayback();
        onStatus('listening');
      }
      if (content.inputTranscription?.text) {
        onTranscript(turn, 'You', content.inputTranscription.text);
      }
      if (content.outputTranscription?.text) {
        onTranscript(turn, 'MediMind', content.outputTranscription.text);
      }
      if (!content.interrupted) {
        for (const part of content.modelTurn?.parts || []) {
          if (part.inlineData) play(part.inlineData);
        }
      }
      if (content.turnComplete) turn += 1;
    } catch {
      fail('There was a problem receiving Gemini audio. Start a new voice chat to try again.');
    }
  }

  // Prepare audio before asking for a short-lived token so permission prompts cannot expire it.
  async function connect() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !AudioContext) {
      fail('Voice chat needs microphone support on HTTPS or localhost.');
      return;
    }

    try {
      audio = new AudioContext();
      if (!audio.audioWorklet) throw new Error('This browser does not support live audio capture.');
      await Promise.all([
        audio.resume(),
        audio.audioWorklet.addModule(WORKLET_URL),
        navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        }).then(stream => {
          // A browser permission dialog can resolve even after the session is closed.
          if (abort.signal.aborted) stream.getTracks().forEach(track => track.stop());
          else microphone = stream;
        }),
      ]);
      if (abort.signal.aborted) return;

      microphone.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => fail('The microphone disconnected. Start a new voice chat to reconnect.'));
      });
      capture = new AudioWorkletNode(audio, 'voice-capture', { channelCount: 1 });
      capture.port.onmessage = sendAudio;
      audio.createMediaStreamSource(microphone).connect(capture);
      // The worklet emits silence on its output and needs an active graph to keep processing.
      capture.connect(audio.destination);

      onStatus('connecting');
      connectionTimer = setTimeout(() => fail('Gemini took too long to connect. Try again shortly.'), CONNECTION_TIMEOUT);
      const { token, model } = await requestVoiceToken(accessToken, abort.signal, historyTurns.length > 0);
      if (abort.signal.aborted) return;

      socket = new WebSocket(`${LIVE_URL}?access_token=${encodeURIComponent(token)}`);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (abort.signal.aborted) return;
        // Gemini applies the remaining settings from the token's locked configuration.
        const setup = { model, generationConfig: { responseModalities: ['AUDIO'] } };
        if (historyTurns.length) setup.historyConfig = { initialHistoryInClientContent: true };
        socket.send(JSON.stringify({ setup }));
      };
      socket.onmessage = receive;
      socket.onerror = () => fail('Could not connect to Gemini voice chat. Try again shortly.');
      socket.onclose = () => fail('The voice session ended. Start a new voice chat to continue.');
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        fail('Allow microphone access in your browser to start voice chat.');
      } else if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
        fail('No microphone is available. Check your microphone and try again.');
      } else {
        fail(error.message || 'Could not start voice chat. Try again shortly.');
      }
    }
  }

  void connect();
  return { stop, setMuted };
}
