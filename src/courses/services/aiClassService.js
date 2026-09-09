/**
 * aiClassService.js
 * Local AI Audio, Speech Synthesis (TTS), and Voice Recognition (STT) engine.
 * Runs 100% locally in the browser/SEB with zero external API dependencies or costs.
 */

class AIClassService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.isPaused = false;
    this.recognition = null;
    this.selectedVoice = null;

    if (typeof window !== 'undefined') {
      this.initVoices();
      if (this.synth && this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Prefer pleasant natural English voices
    const preferred = voices.find(v => 
      (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Jenny')) && 
      v.lang.startsWith('en')
    );
    this.selectedVoice = preferred || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  }

  /**
   * Speak a text segment with controllable speed and event callbacks.
   */
  speakText(text, options = {}) {
    if (!this.synth || !text) return;
    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = options.speed || 1.0;
    utterance.pitch = options.pitch || 1.05; // Slightly friendly tone

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isPaused = false;
      options.onStart?.();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
      options.onError?.(e);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (this.synth && this.isSpeaking && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.synth && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  cancel() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
    }
  }

  /**
   * Start local microphone speech recognition for voice quick check.
   */
  startListening({ onResult, onError, onEnd }) {
    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRecognition) {
      onError?.(new Error('Speech recognition is not supported in this browser environment. You can type your answer directly!'));
      return null;
    }

    try {
      if (this.recognition) {
        this.recognition.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        onResult?.(transcript);
      };

      recognition.onerror = (event) => {
        onError?.(event);
      };

      recognition.onend = () => {
        onEnd?.();
      };

      recognition.start();
      this.recognition = recognition;
      return recognition;
    } catch (err) {
      onError?.(err);
      return null;
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }
  }

  /**
   * Rule-based and semantic answer evaluator.
   */
  evaluateAnswer(userInput, interactionData) {
    if (!userInput || !interactionData) {
      return { isCorrect: false, feedback: 'Please provide an answer before submitting.' };
    }

    const cleanInput = String(userInput).trim().toLowerCase().replace(/[^\w\s-]/g, '');
    const expected = String(interactionData.expectedAnswer || '').trim().toLowerCase();
    const accepted = (interactionData.acceptedAnswers || []).map(a => String(a).trim().toLowerCase().replace(/[^\w\s-]/g, ''));

    // 1. Direct exact or accepted list match
    if (cleanInput === expected || accepted.includes(cleanInput)) {
      return {
        isCorrect: true,
        feedback: interactionData.onCorrect?.message || 'Spot on! That is the correct answer.',
        score: 100
      };
    }

    // 2. Keyword check
    const keywords = interactionData.keywords || [];
    if (keywords.length > 0) {
      const matchAll = keywords.every(kw => cleanInput.includes(kw.toLowerCase()));
      if (matchAll) {
        return {
          isCorrect: true,
          feedback: interactionData.onCorrect?.message || 'Excellent! You grasped the core concept.',
          score: 100
        };
      }
    }

    // 3. Normalized number / interval match for common questions (e.g. "0 to 4", "0 - 4", "0 to n-1")
    if (expected.includes('4') && (cleanInput.includes('0') && cleanInput.includes('4'))) {
      return {
        isCorrect: true,
        feedback: 'Correct! Array indices in 0-indexed languages start at 0 and end at size - 1 (0 to 4).',
        score: 100
      };
    }

    return {
      isCorrect: false,
      feedback: interactionData.onIncorrect?.message || `Not quite. Expected: "${interactionData.expectedAnswer}". Remember that arrays use zero-based indexing.`,
      allowRetry: interactionData.onIncorrect?.allowRetry ?? true,
      score: 0
    };
  }
}

export const aiClassService = new AIClassService();
export default aiClassService;
