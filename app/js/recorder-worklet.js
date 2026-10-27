/* Holt die Mikrofon-Daten ab, rechnet sie auf die halbe Abtastrate herunter
   (spart Speicher) und schickt sie in Paketen an die App. */
class JZoRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.factor = (options.processorOptions && options.processorOptions.factor) || 1;
    this.buf = new Float32Array(4096);
    this.pos = 0;
    this.acc = 0;
    this.cnt = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this.acc += ch[i];
        if (++this.cnt === this.factor) {
          this.buf[this.pos++] = this.acc / this.factor;
          this.acc = 0; this.cnt = 0;
          if (this.pos === this.buf.length) {
            this.port.postMessage(this.buf, [this.buf.buffer]);
            this.buf = new Float32Array(4096);
            this.pos = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('jzo-recorder', JZoRecorder);
