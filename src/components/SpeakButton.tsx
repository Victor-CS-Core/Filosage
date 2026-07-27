"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Square, Volume2 } from "lucide-react";

interface SpeakButtonProps {
  text: string;
  label: string;
}

/**
 * Reads the given text aloud with the browser's built-in speech synthesis.
 * Text is spoken paragraph by paragraph, which keeps long lessons reliable in
 * browsers that time out single long utterances. Hidden when the browser has
 * no speech support.
 */
export default function SpeakButton({ text, label }: SpeakButtonProps) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const active = useRef(false);

  useEffect(() => {
    void Promise.resolve().then(() => setSupported("speechSynthesis" in window));
    return () => {
      if (active.current) {
        active.current = false;
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const stop = useCallback(() => {
    active.current = false;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const start = useCallback(() => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = text.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean);
    if (!chunks.length) return;
    active.current = true;
    setSpeaking(true);
    let index = 0;
    const speakNext = () => {
      if (!active.current || index >= chunks.length) {
        active.current = false;
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      index += 1;
      utterance.onend = speakNext;
      utterance.onerror = () => {
        active.current = false;
        setSpeaking(false);
      };
      synth.speak(utterance);
    };
    speakNext();
  }, [text]);

  // Stop reading when the content changes, e.g. moving to the next lesson.
  useEffect(() => {
    if (active.current) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`icon-button speak-button ${speaking ? "is-active" : ""}`}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading aloud" : label}
      title={speaking ? "Stop reading aloud" : label}
      onClick={speaking ? stop : start}
    >
      {speaking ? <Square size={16} /> : <Volume2 size={17} />}
    </button>
  );
}
