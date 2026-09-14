/**
 * Speech Synthesis Utility
 * Provides a simple wrapper around Web Speech API for text-to-speech functionality
 * Compatible with both React hooks and vanilla JavaScript contexts
 */

interface SpeechSynthesisOptions {
    rate?: number; // 0.1 - 10 (default 1)
    pitch?: number; // 0 - 2 (default 1)
    volume?: number; // 0 - 1 (default 1)
}

class SpeechSynthesisManager {
    private isSupported: boolean;
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private listeners: {
        onStart?: () => void;
        onEnd?: () => void;
        onError?: (error: Error) => void;
    } = {};

    constructor() {
        this.isSupported =
            typeof window !== "undefined" &&
            ("speechSynthesis" in window || "webkitSpeechSynthesis" in window);
    }

    /**
     * Get the speech synthesis instance
     */
    private getSynthesis(): SpeechSynthesis | null {
        if (!this.isSupported || typeof window === "undefined") {
            return null;
        }
        return window.speechSynthesis || (window as any).webkitSpeechSynthesis;
    }

    /**
     * Speak the given text
     */
    speak(
        text: string,
        options: SpeechSynthesisOptions = {},
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const synthesis = this.getSynthesis();

            if (!synthesis) {
                const error = new Error(
                    "Speech Synthesis not supported on this browser/OS",
                );
                this.listeners.onError?.(error);
                reject(error);
                return;
            }

            // Cancel any ongoing speech
            this.stop();

            try {
                const utterance = new SpeechSynthesisUtterance(text);

                // Set properties
                utterance.rate = options.rate ?? 1;
                utterance.pitch = options.pitch ?? 1;
                utterance.volume = options.volume ?? 1;

                // Set event listeners
                utterance.onstart = () => {
                    this.listeners.onStart?.();
                };

                utterance.onend = () => {
                    this.currentUtterance = null;
                    this.listeners.onEnd?.();
                    resolve();
                };

                utterance.onerror = (event) => {
                    this.currentUtterance = null;
                    const error = new Error(
                        `Speech synthesis error: ${event.error}`,
                    );
                    this.listeners.onError?.(error);
                    reject(error);
                };

                this.currentUtterance = utterance;
                synthesis.speak(utterance);
            } catch (error) {
                const err =
                    error instanceof Error ? error : new Error(String(error));
                this.listeners.onError?.(err);
                reject(err);
            }
        });
    }

    /**
     * Stop any ongoing speech synthesis
     */
    stop(): void {
        const synthesis = this.getSynthesis();
        if (!synthesis) return;

        synthesis.cancel();
        this.currentUtterance = null;
    }

    /**
     * Check if speech is currently playing
     */
    isSpeaking(): boolean {
        const synthesis = this.getSynthesis();
        if (!synthesis) return false;
        return synthesis.speaking;
    }

    /**
     * Pause speech synthesis
     */
    pause(): void {
        const synthesis = this.getSynthesis();
        if (!synthesis) return;
        if (synthesis.paused) return;
        synthesis.pause();
    }

    /**
     * Resume speech synthesis
     */
    resume(): void {
        const synthesis = this.getSynthesis();
        if (!synthesis) return;
        if (!synthesis.paused) return;
        synthesis.resume();
    }

    /**
     * Register event listeners
     */
    on(
        event: "start" | "end" | "error",
        callback: (error?: Error) => void,
    ): void {
        if (event === "start") {
            this.listeners.onStart = callback;
        } else if (event === "end") {
            this.listeners.onEnd = callback;
        } else if (event === "error") {
            this.listeners.onError = callback;
        }
    }

    /**
     * Unregister event listeners
     */
    off(event: "start" | "end" | "error"): void {
        if (event === "start") {
            this.listeners.onStart = undefined;
        } else if (event === "end") {
            this.listeners.onEnd = undefined;
        } else if (event === "error") {
            this.listeners.onError = undefined;
        }
    }

    /**
     * Get list of available voices
     */
    getVoices(): SpeechSynthesisVoice[] {
        const synthesis = this.getSynthesis();
        if (!synthesis) return [];
        return synthesis.getVoices();
    }
}

// Create singleton instance
export const speechSynthesisManager = new SpeechSynthesisManager();

/**
 * React Hook for Speech Synthesis
 * Provides speak(), stop(), and isSpeaking() methods
 */
export function useSpeechSynthesis() {
    const speak = (text: string, options?: SpeechSynthesisOptions) => {
        return speechSynthesisManager.speak(text, options);
    };

    const stop = () => {
        speechSynthesisManager.stop();
    };

    const isSpeaking = () => {
        return speechSynthesisManager.isSpeaking();
    };

    const pause = () => {
        speechSynthesisManager.pause();
    };

    const resume = () => {
        speechSynthesisManager.resume();
    };

    const on = (
        event: "start" | "end" | "error",
        callback: (error?: Error) => void,
    ) => {
        speechSynthesisManager.on(event, callback);
    };

    const off = (event: "start" | "end" | "error") => {
        speechSynthesisManager.off(event);
    };

    return {
        speak,
        stop,
        isSpeaking,
        pause,
        resume,
        on,
        off,
    };
}
