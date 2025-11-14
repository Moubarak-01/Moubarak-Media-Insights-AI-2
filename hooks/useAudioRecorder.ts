import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = (onRecordingComplete: (file: File) => void) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [micVolume, setMicVolume] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Refs for Web Audio API
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect audio nodes
    if (sourceNodeRef.current && analyserRef.current) {
      sourceNodeRef.current.disconnect();
    }
    sourceNodeRef.current = null;
    analyserRef.current = null;
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;

    // Stop media stream tracks
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    // Clear timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    setMicVolume(0);
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        onRecordingComplete(audioFile);
        audioChunksRef.current = [];
        cleanup();
      });
      
      // --- Audio Visualizer Setup ---
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const sourceNode = audioContext.createMediaStreamSource(stream);

      sourceNode.connect(analyser);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = sourceNode;
      
      const draw = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const average = sum / bufferLength;
        // Normalize to a 0-1 range and clamp.
        const volume = Math.min(1, average / 128); 
        
        setMicVolume(volume);

        animationFrameRef.current = requestAnimationFrame(draw);
      };
      
      draw();
      // --- End Visualizer Setup ---

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not start recording. Please ensure you have given microphone permissions.');
      cleanup();
    }
  }, [onRecordingComplete, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Cleanup is now handled in the 'stop' event listener to ensure file is processed first.
    }
  }, [isRecording]);

  return { isRecording, startRecording, stopRecording, recordingTime, micVolume };
};