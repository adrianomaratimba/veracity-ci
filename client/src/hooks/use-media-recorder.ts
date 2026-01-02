import { useState, useRef, useCallback } from "react";

interface MediaRecorderState {
  status: "idle" | "recording" | "paused" | "stopped";
  isRecording: boolean;
  error: string | null;
  audioBlob: Blob | null;
}

export function useMediaRecorder() {
  const [state, setState] = useState<MediaRecorderState>({
    status: "idle",
    isRecording: false,
    error: null,
    audioBlob: null,
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        setState(prev => ({ ...prev, status: "stopped", isRecording: false, audioBlob }));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setState(prev => ({ ...prev, status: "recording", isRecording: true, error: null }));
    } catch (err) {
      console.error("Failed to start recording:", err);
      setState(prev => ({ ...prev, error: "Microphone access denied or not available." }));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { ...state, startRecording, stopRecording };
}
