const stoppedStreams = new WeakSet<object>();

export function stopStream(stream: MediaStream): void {
	if (stoppedStreams.has(stream)) return;
	stoppedStreams.add(stream);
	for (const track of stream.getTracks()) {
		track.stop();
	}
}
