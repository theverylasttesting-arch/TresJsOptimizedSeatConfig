// Create audio only in response to an accessory action (browser autoplay policy).
export function createAccessorySounds() {
    let context;
    let disposed = false;

    return {
        async prepare() {
            if (disposed) return;
            try {
                const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
                if (!AudioContext) return;
                context ??= new AudioContext();
                if (context.state === 'suspended') await context.resume();
            } catch {
                // A blocked audio context must not prevent accessory animation.
            }
        },
        play(direction) {
            if (disposed || context?.state !== 'running' || !['forward', 'reverse'].includes(direction)) return;
            try {
                const start = context.currentTime;
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                const frequencies = direction === 'forward' ? [520, 780] : [780, 520];
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequencies[0], start);
                oscillator.frequency.exponentialRampToValueAtTime(frequencies[1], start + 0.12);
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.07, start + 0.008);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
                gain.gain.linearRampToValueAtTime(0, start + 0.18);
                oscillator.connect(gain);
                gain.connect(context.destination);
                oscillator.onended = () => {
                    oscillator.disconnect();
                    gain.disconnect();
                };
                oscillator.start(start);
                oscillator.stop(start + 0.18);
            } catch {
                // Audio may be unavailable or blocked; accessory controls still work.
            }
        },
        dispose() {
            disposed = true;
            if (context && context.state !== 'closed') void context.close().catch(() => {});
        },
    };
}
