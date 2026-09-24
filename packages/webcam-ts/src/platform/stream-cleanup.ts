const stoppedStreams = new WeakSet<object>();

export function stopStream(stream: MediaStream): void {
  const key = stream as unknown as object;
  if (stoppedStreams.has(key)) return;
  stoppedStreams.add(key);
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
