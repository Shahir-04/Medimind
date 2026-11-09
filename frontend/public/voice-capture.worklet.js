const captureRate = Math.min(sampleRate, 16000);
const chunkSamples = Math.round(captureRate * 0.08);

class VoiceCapture extends AudioWorkletProcessor {
  // Collect mono samples into 80 ms chunks and drop partial audio when muted.
  constructor() {
    super();
    this.buffer = new DataView(new ArrayBuffer(chunkSamples * 2));
    this.offset = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.generation = 0;
    this.muted = false;
    this.port.onmessage = ({ data }) => {
      this.muted = data.muted;
      this.generation = data.generation;
      this.offset = this.phase = this.sum = this.count = 0;
    };
  }

  // Average input samples down to the capture rate, keeping time across render blocks.
  process(inputs) {
    const samples = inputs[0][0];
    if (!samples || this.muted) return true;

    for (const sample of samples) {
      this.sum += sample;
      this.count += 1;
      this.phase += captureRate;
      if (this.phase < sampleRate) continue;

      this.phase -= sampleRate;
      const average = Math.max(-1, Math.min(1, this.sum / this.count));
      this.buffer.setInt16(this.offset, average * (average < 0 ? 32768 : 32767), true);
      this.sum = this.count = 0;
      this.offset += 2;

      if (this.offset === this.buffer.byteLength) {
        const pcm = this.buffer.buffer;
        this.port.postMessage({ pcm, generation: this.generation }, [pcm]);
        this.buffer = new DataView(new ArrayBuffer(chunkSamples * 2));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCapture);
