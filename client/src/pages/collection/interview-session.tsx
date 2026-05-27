import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { useUpload } from "@/hooks/use-upload";
import { useSubmitResponse, ApiError } from "@/hooks/use-responses";
import { useSurvey } from "@/hooks/use-surveys";
import { useLocationTracking } from "@/hooks/use-location-tracking";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { useGeofencing } from "@/hooks/use-geofencing";
import { isPointInsidePolygon } from "@/lib/geofences";
import { GpsEngine, SmoothedPosition } from "@/lib/gps-engine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MapPin, CheckCircle, AlertTriangle, ChevronRight, Save, XCircle, WifiOff, Cloud, Square, Play } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { savePendingInterview, generateInterviewId, generateClientId, getPendingCount } from "@/lib/offlineStorage";
import { syncAllPending } from "@/lib/syncQueue";
import type { QuestionLogic, SkipLogicRule } from "@shared/schema";
import { InstallBanner } from "@/components/pwa/InstallBanner";

interface QuestionOption {
  text: string;
  imageUrl?: string;
}

function normalizeOption(opt: string | QuestionOption): QuestionOption {
  if (typeof opt === 'string') {
    return { text: opt };
  }
  return opt;
}

function getOptionText(opt: string | QuestionOption): string {
  if (typeof opt === 'string') return opt;
  return opt.text;
}

function getOptionImage(opt: string | QuestionOption): string | undefined {
  if (typeof opt === 'string') return undefined;
  return opt.imageUrl;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function normalizeAnswerForComparison(answer: any): string[] {
  if (answer === undefined || answer === null) return [];
  
  if (Array.isArray(answer)) {
    return answer.map(a => {
      if (typeof a === 'string') return a;
      if (typeof a === 'object' && a.text) return a.text;
      return String(a);
    });
  }
  
  if (typeof answer === 'string') return [answer];
  if (typeof answer === 'object' && answer.text) return [answer.text];
  return [String(answer)];
}

function evaluateSkipLogicRule(rule: SkipLogicRule, answer: any): boolean {
  const { operator, value } = rule.condition;
  
  if (operator === 'any') {
    return answer !== undefined && answer !== null && answer !== '';
  }
  
  const normalizedAnswers = normalizeAnswerForComparison(answer);
  const targetValue = typeof value === 'string' ? value : String(value);
  
  switch (operator) {
    case 'equals':
      return normalizedAnswers.length === 1 && normalizedAnswers[0] === targetValue;
    case 'not_equals':
      return normalizedAnswers.length === 0 || !normalizedAnswers.includes(targetValue);
    case 'contains':
      return normalizedAnswers.includes(targetValue);
    default:
      return false;
  }
}

function getSkipTarget(logic: QuestionLogic | undefined, answer: any): { type: 'skip_to_question' | 'skip_to_end' | 'continue'; targetQuestionId?: number } {
  if (!logic?.rules || logic.rules.length === 0) {
    return { type: 'continue' };
  }
  
  for (const rule of logic.rules) {
    if (evaluateSkipLogicRule(rule, answer)) {
      return {
        type: rule.action.type,
        targetQuestionId: rule.action.targetQuestionId
      };
    }
  }
  
  return { type: 'continue' };
}

interface InterviewSessionProps {
  params: { surveyId: string };
}

type Step = 'permissions' | 'questions' | 'submit' | 'success';

export default function InterviewSession({ params }: InterviewSessionProps) {
  const surveyId = parseInt(params.surveyId);
  const { data: survey, isLoading: surveyLoading } = useSurvey(surveyId);
  const { startRecording, stopRecording, isRecording, audioBlob } = useMediaRecorder();
  const { uploadFile, isUploading: isUploadingAudio } = useUpload();
  const { mutate: submitResponse, isPending: isSubmitting } = useSubmitResponse();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('permissions');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitPhaseLabel, setSubmitPhaseLabel] = useState('Preparando...');
  const autoSubmitRef = useRef(false);
  const [gpsCoords, setGpsCoords] = useState<GeolocationCoordinates | null>(null);
  const [gpsBestSoFar, setGpsBestSoFar] = useState<GeolocationCoordinates | null>(null);
  const [gpsAccuracyOk, setGpsAccuracyOk] = useState(false);
  const [gpsShowAcceptImprecise, setGpsShowAcceptImprecise] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsRawAccuracy, setGpsRawAccuracy] = useState<number | null>(null);
  const [gpsSampleCount, setGpsSampleCount] = useState(0);
  // True when GPS is "ready to use" — either accurate or explicitly accepted by user/auto-timer
  const [gpsAccepted, setGpsAccepted] = useState(false);

  // Accuracy threshold in meters — accept as "good enough" (50 m matches outdoor GPS chip capability)
  const GPS_ACCURACY_THRESHOLD = 50;

  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [startTime] = useState(new Date());
  const [clientId] = useState(() => generateClientId());
  
  const [shuffledQuestions, setShuffledQuestions] = useState<typeof survey extends { questions: infer Q } ? Q : any[]>([]);
  const [shuffledOptionsMap, setShuffledOptionsMap] = useState<Record<number, (string | QuestionOption)[]>>({});
  const [shuffleVersion, setShuffleVersion] = useState(0);
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [skippedGps, setSkippedGps] = useState(false);
  const [gpsTimeoutReached, setGpsTimeoutReached] = useState(false);

  const interviewOrgId = (survey as any)?.organizationId || 0;
  const geofenceEnabled = (survey as any)?.geofenceEnabled ?? false;
  const geofenceBlocking = (survey as any)?.geofenceBlocking ?? false;
  // Geofencing is ONLY active when explicitly enabled by the survey settings.
  const isGeofenceActive = geofenceEnabled;

  // Fetch assigned zone polygons for this survey (when geofenceEnabled).
  // Loaded as soon as survey data is available so zones are ready before questions start.
  const [myZones, setMyZones] = useState<{ neighborhood: string; polygon: [number,number][] | null }[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const zonesLoadedRef = useRef(false);
  const loadMyZones = useCallback(async () => {
    if (!geofenceEnabled || zonesLoadedRef.current || !surveyId) return;
    zonesLoadedRef.current = true;
    try {
      const res = await fetch(`/api/surveys/${surveyId}/my-zones`, { credentials: 'include' });
      if (res.ok) setMyZones(await res.json());
    } catch { /* silent */ }
    setZonesLoaded(true);
  }, [geofenceEnabled, surveyId]);

  // Load zones as soon as survey data is available — NOT when questions start — to prevent race condition
  useEffect(() => {
    if (survey && geofenceEnabled) loadMyZones();
  }, [survey, geofenceEnabled, loadMyZones]);

  // Build polygon list from zone assignments (database-driven, no legacy fallback)
  const activePolygons: [number,number][][] = myZones
    .map(z => z.polygon)
    .filter((p): p is [number,number][] => !!(p && p.length >= 3));
  const activeNeighborhood = myZones.length > 0 ? myZones[0].neighborhood : null;

  // Zone check at the GPS step — computed from already-acquired gpsCoords + loaded zone polygons.
  // True when: geofence blocking is active, zones are loaded, interviewer has assignments, GPS is
  // available, AND the GPS position is OUTSIDE all assigned polygons.
  // Used to block "Iniciar Entrevista" and show a warning BEFORE any question is answered.
  // Default: blocked everywhere. Only allowed when GPS is inside an assigned zone.
  // If no zone is assigned at all, block immediately (no GPS check needed).
  const gpsZoneBlocked: boolean =
    geofenceBlocking &&
    isGeofenceActive &&
    zonesLoaded && (
      myZones.length === 0 ||
      (!!gpsCoords && !activePolygons.some(poly => isPointInsidePolygon(gpsCoords.longitude, gpsCoords.latitude, poly)))
    );
  // Two different block reasons for distinct UI messages
  const noZoneAssigned = geofenceBlocking && isGeofenceActive && zonesLoaded && myZones.length === 0;
  const outsideAssignedZone = geofenceBlocking && isGeofenceActive && zonesLoaded && myZones.length > 0 && !!gpsCoords &&
    !activePolygons.some(poly => isPointInsidePolygon(gpsCoords.longitude, gpsCoords.latitude, poly));

  // Track if we already sent a violation report for this session
  const violationReportedRef = useRef(false);

  // Geofencing - only active during question collection step, only when survey has it enabled.
  // In blocking mode, the hook defaults isInsideZone=false until GPS confirms position inside zone.
  const { isInsideZone, neighborhoodName: geofenceZoneName, hasPosition: geofenceHasPosition } = useGeofencing({
    neighborhoodName: activePolygons.length > 0 ? null : activeNeighborhood,
    polygons: activePolygons.length > 0 ? activePolygons : undefined,
    enabled: step === 'questions' && isGeofenceActive,
    blockingMode: geofenceBlocking,
  });

  // Report geofence violation to server on first confirmed exit (once per session).
  // Only fires after zones AND GPS position are both confirmed — never on the default initial state.
  useEffect(() => {
    if (step !== 'questions' || !isGeofenceActive || isInsideZone || violationReportedRef.current) return;
    if (!zonesLoaded || !geofenceHasPosition) return; // wait for real confirmation
    violationReportedRef.current = true;
    fetch(`/api/surveys/${surveyId}/geofence-violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        neighborhood: activeNeighborhood || myZones.map(z => z.neighborhood).join(', '),
        latitude: null,
        longitude: null,
      }),
    }).catch(() => { /* silent — don't disrupt collection */ });
  }, [step, isGeofenceActive, isInsideZone, surveyId, zonesLoaded, geofenceHasPosition]);

  // Periodic out-of-zone reminder — fires every 30 s while interviewer is outside assigned zone
  // during active question collection only (not submit — submit step does not watch GPS).
  useEffect(() => {
    const activeStep = step === 'questions';
    if (!activeStep || !isGeofenceActive || !geofenceBlocking) return;
    if (!zonesLoaded || myZones.length === 0 || !geofenceHasPosition) return;
    if (isInsideZone) return; // inside zone — no reminder needed

    // Fire immediately so first alert appears right when violation is confirmed
    toast({
      title: "⚠️ Fora do setor",
      description: `Você está fora de ${activeNeighborhood || 'seu setor designado'}. Retorne ao bairro.`,
      variant: "destructive",
      duration: 8000,
    });

    const interval = setInterval(() => {
      toast({
        title: "⚠️ Fora do setor",
        description: `Você está fora de ${activeNeighborhood || 'seu setor designado'}. Retorne ao bairro.`,
        variant: "destructive",
        duration: 8000,
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [step, isGeofenceActive, geofenceBlocking, zonesLoaded, myZones.length, geofenceHasPosition, isInsideZone, activeNeighborhood]);

  // Real-time location tracking for supervisor monitoring
  useLocationTracking({
    orgId: interviewOrgId,
    surveyId: surveyId,
    intervalMs: 30000,
    enabled: !!interviewOrgId && step !== 'success'
  });
  
  // Presence heartbeat for supervisor map visibility
  usePresenceHeartbeat({ 
    orgId: interviewOrgId, 
    enabled: !!interviewOrgId && step !== 'success', 
    intervalMs: 60000 
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    getPendingCount().then(setPendingCount);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // GPS capture — uses GpsEngine (multi-sample smoothing, maximumAge:0) for Waze-grade precision
  const gpsEngineRef = useRef<GpsEngine | null>(null);

  useEffect(() => {
    const requireGps = (survey as any)?.requireGps ?? true;
    if (!requireGps) return;

    if (!navigator.geolocation) {
      setGpsError("Geolocalização não é suportada por este navegador.");
      setGpsTimeoutReached(true);
      return;
    }

    // Timers
    let noSignalTimeoutId: ReturnType<typeof setTimeout> | null = null;   // 5s – no reading at all
    let showImpreciseTimeoutId: ReturnType<typeof setTimeout> | null = null; // 8s – show "accept" button
    let acceptAnywayTimeoutId: ReturnType<typeof setTimeout> | null = null;  // 20s – auto-accept

    const engine = new GpsEngine({
      targetAccuracyMeters: GPS_ACCURACY_THRESHOLD,
      maxSamples: 8,
      sampleAccuracyCutoff: 200,

      onRawAccuracy: (acc) => {
        setGpsRawAccuracy(acc);
        // First raw reading cancels "no signal" timer
        if (noSignalTimeoutId !== null) {
          clearTimeout(noSignalTimeoutId);
          noSignalTimeoutId = null;
          setGpsTimeoutReached(false);
        }
      },

      onPosition: (pos: SmoothedPosition) => {
        // Build a GeolocationCoordinates-compatible object from smoothed data
        const syntheticCoords = {
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        } as unknown as GeolocationCoordinates;

        // Always track best so the UI can show progress
        setGpsBestSoFar(prev => (!prev || pos.accuracy < prev.accuracy) ? syntheticCoords : prev);
        setGpsCoords(syntheticCoords);
        setGpsSampleCount(pos.sampleCount);
        // Clear any previous error — if we're receiving positions, GPS is working
        setGpsError(null);

        if (pos.accuracy <= GPS_ACCURACY_THRESHOLD) {
          // Good enough — mark as accurate and cancel auto-accept timer
          setGpsAccuracyOk(true);
          setGpsAccepted(true);
          if (acceptAnywayTimeoutId !== null) {
            clearTimeout(acceptAnywayTimeoutId);
            acceptAnywayTimeoutId = null;
          }
        }
        // If still imprecise: keep running, timers will decide next steps
      },

      onError: (err) => {
        const msg = 'message' in err ? err.message : 'Erro de GPS';
        console.warn('[GPS] error:', msg);
        setGpsError("Erro ao obter localização. Verifique as permissões do GPS.");
      },
    });

    gpsEngineRef.current = engine;
    engine.start();

    // After 5s with no reading at all, show "Continuar sem GPS" button
    noSignalTimeoutId = setTimeout(() => {
      if (!engine.currentBest) setGpsTimeoutReached(true);
    }, 5000);

    // After 8s with imprecise signal, offer "Usar GPS atual" button
    showImpreciseTimeoutId = setTimeout(() => {
      if (!engine.currentBest || engine.currentBest.accuracy > GPS_ACCURACY_THRESHOLD) {
        setGpsShowAcceptImprecise(true);
      }
    }, 8000);

    // After 20s without a precise fix, auto-accept the best available
    acceptAnywayTimeoutId = setTimeout(() => {
      const best = engine.currentBest;
      if (best) {
        setGpsAccuracyOk(false); // mark as imprecise but accepted
        setGpsAccepted(true);    // unblock the start button
        // gpsCoords is already set via onPosition — nothing else needed
      } else {
        setGpsTimeoutReached(true);
      }
    }, 20000);

    return () => {
      engine.stop();
      gpsEngineRef.current = null;
      if (noSignalTimeoutId !== null) clearTimeout(noSignalTimeoutId);
      if (showImpreciseTimeoutId !== null) clearTimeout(showImpreciseTimeoutId);
      if (acceptAnywayTimeoutId !== null) clearTimeout(acceptAnywayTimeoutId);
    };
  }, [survey]);

  useEffect(() => {
    if (!survey?.questions) return;
    
    // Debug log para verificar shuffleOptions
    console.log('[InterviewSession] Survey questions shuffleOptions:', survey.questions.map(q => ({
      id: q.id,
      text: q.text.substring(0, 30),
      shuffleOptions: (q as any).shuffleOptions,
      optionsCount: Array.isArray(q.options) ? q.options.length : 0
    })));
    
    let questionsToUse = [...survey.questions];
    if ((survey as any).shuffleQuestions) {
      questionsToUse = shuffleArray(questionsToUse);
    }
    setShuffledQuestions(questionsToUse);
    
    const optionsMap: Record<number, (string | QuestionOption)[]> = {};
    for (const q of survey.questions) {
      const shouldShuffle = (q as any).shuffleOptions === true;
      console.log(`[InterviewSession] Question ${q.id}: shuffleOptions=${(q as any).shuffleOptions}, shouldShuffle=${shouldShuffle}`);
      if (shouldShuffle && Array.isArray(q.options)) {
        optionsMap[q.id] = shuffleArray(q.options as (string | QuestionOption)[]);
        console.log(`[InterviewSession] Shuffled options for question ${q.id}:`, optionsMap[q.id].map(o => getOptionText(o)));
      } else if (Array.isArray(q.options)) {
        optionsMap[q.id] = q.options as (string | QuestionOption)[];
      }
    }
    setShuffledOptionsMap(optionsMap);
  }, [survey, shuffleVersion]);

  const handleStartInterview = async () => {
    const requireGps = (survey as any)?.requireGps ?? true;
    const requireAudio = (survey as any)?.requireAudio ?? true;
    
    // Only check GPS if required and not skipped
    if (requireGps && !gpsCoords && !skippedGps) return;

    // Final zone guard — prevents start if GPS confirms interviewer is outside assigned zone
    if (gpsZoneBlocked) {
      toast({
        title: "Coleta bloqueada",
        description: `Você está fora do setor designado (${activeNeighborhood}). Retorne ao bairro para iniciar a entrevista.`,
        variant: "destructive",
      });
      return;
    }
    
    // Only start recording if audio is required
    if (requireAudio) {
      await startRecording();
    }
    setStep('questions');
  };

  const handleSkipGps = () => {
    setSkippedGps(true);
  };

  const handleNewInterview = () => {
    setStep('permissions');
    setAnswers({});
    setCurrentQuestionIndex(0);
    setSubmitError(null);
    setShuffleVersion(v => v + 1);
  };

  const handleNextQuestion = () => {
    if (!survey || shuffledQuestions.length === 0) return;
    
    const currentQuestion = shuffledQuestions[currentQuestionIndex];
    const currentAnswer = answers[currentQuestion.id];
    
    // Validar pergunta obrigatória
    if (currentQuestion.required) {
      const isEmpty = currentAnswer === undefined || 
                      currentAnswer === null || 
                      currentAnswer === '' ||
                      (Array.isArray(currentAnswer) && currentAnswer.length === 0);
      
      if (isEmpty) {
        toast({
          title: "Resposta obrigatória",
          description: "Esta pergunta é obrigatória. Por favor, selecione uma resposta.",
          variant: "destructive"
        });
        return;
      }
    }
    
    // Verificar skip logic
    const skipTarget = getSkipTarget((currentQuestion as any).logic, currentAnswer);
    console.log('[InterviewSession] Skip logic result:', { questionId: currentQuestion.id, answer: currentAnswer, skipTarget });
    
    if (skipTarget.type === 'skip_to_end') {
      stopRecording();
      setStep('submit');
      return;
    }
    
    if (skipTarget.type === 'skip_to_question' && skipTarget.targetQuestionId) {
      // Encontrar o índice da pergunta destino
      const targetIndex = shuffledQuestions.findIndex(q => q.id === skipTarget.targetQuestionId);
      if (targetIndex !== -1 && targetIndex > currentQuestionIndex) {
        setCurrentQuestionIndex(targetIndex);
        return;
      }
    }
    
    // Comportamento padrão: avançar para a próxima pergunta
    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      stopRecording();
      setStep('submit');
    }
  };

  const handleAnswer = (questionId: number, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearCurrentAnswer = () => {
    const question = shuffledQuestions[currentQuestionIndex];
    if (question) {
      setAnswers(prev => {
        const newAnswers = { ...prev };
        delete newAnswers[question.id];
        return newAnswers;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleAbandonInterview = () => {
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }
    // Navigate back to survey selection
    setLocation('/dashboard');
  };

  const saveOffline = async () => {
    const requireGps = (survey as any)?.requireGps ?? true;
    const requireAudio = (survey as any)?.requireAudio ?? true;
    
    // Only check required fields (GPS can be skipped if user chose to continue without it)
    if (requireAudio && !audioBlob) return;
    if (requireGps && !gpsCoords && !skippedGps) return;
    
    setIsSavingOffline(true);
    try {
      const audioBuffer = requireAudio && audioBlob ? await audioBlob.arrayBuffer() : null;
      const endTime = new Date();
      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      
      const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
        questionId: parseInt(qId),
        value: val
      }));

      await savePendingInterview({
        id: generateInterviewId(),
        surveyId,
        clientId,
        createdAt: new Date(),
        status: 'pending',
        retryCount: 0,
        data: {
          response: {
            latitude: gpsCoords?.latitude ?? 0,
            longitude: gpsCoords?.longitude ?? 0,
            accuracy: gpsCoords?.accuracy ?? 0,
            gpsTimestamp: new Date(),
            audioBlob: audioBuffer ?? new ArrayBuffer(0),
            audioMimeType: requireAudio && audioBlob ? 'audio/webm' : 'audio/webm',
            audioFileName: requireAudio && audioBlob ? `entrevista-${Date.now()}.webm` : `no-audio-${Date.now()}.webm`,
            deviceInfo: { userAgent: navigator.userAgent, noGps: skippedGps } as any,
            startTime,
            endTime,
            duration
          },
          answers: formattedAnswers
        }
      });
      
      const newCount = await getPendingCount();
      setPendingCount(newCount);
      
      toast({
        title: "Entrevista salva localmente",
        description: "Será enviada automaticamente quando a conexão for restaurada.",
      });
      
      setStep('success');
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a entrevista localmente.",
        variant: "destructive"
      });
    } finally {
      setIsSavingOffline(false);
    }
  };

  const handleSubmit = async () => {
    const requireGps = (survey as any)?.requireGps ?? true;
    const requireAudio = (survey as any)?.requireAudio ?? true;
    
    // Only check required fields (GPS can be skipped if user chose to continue without it)
    if (requireAudio && !audioBlob) return;
    if (requireGps && !gpsCoords && !skippedGps) return;

    // Geofence is enforced at interview START only (GPS zone check before first question).
    // No zone check at submit time — GPS drifts during a long interview and could falsely
    // block a valid submission from someone who was correctly inside their zone when they began.

    if (!isOnline) {
      await saveOffline();
      return;
    }

    let audioUrl = "";
    let audioHash = "no-audio";
    
    // Only upload audio if required and available
    if (requireAudio && audioBlob) {
      const audioFile = new File([audioBlob], `entrevista-${Date.now()}.webm`, { type: "audio/webm" });
      const uploadRes = await uploadFile(audioFile);

      if (!uploadRes) {
        toast({
          title: "Sem conexão",
          description: "Salvando entrevista localmente para envio posterior...",
        });
        await saveOffline();
        return;
      }
      audioUrl = uploadRes.objectPath;
      audioHash = "synced";
    }

    const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
      questionId: parseInt(qId),
      value: val
    }));

    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    submitResponse({
      surveyId,
      data: {
        clientId,
        response: {
          latitude: gpsCoords?.latitude ?? 0,
          longitude: gpsCoords?.longitude ?? 0,
          accuracy: gpsCoords?.accuracy ?? 0,
          gpsTimestamp: new Date(),
          audioUrl,
          audioHash,
          audioDuration: 0,
          deviceInfo: { userAgent: navigator.userAgent, noGps: skippedGps } as any,
          startTime,
          endTime,
          duration
        },
        answers: formattedAnswers
      }
    }, {
      onSuccess: () => {
        setStep('success');
      },
      onError: async (error: Error) => {
        if (error instanceof ApiError && (
          error.code === "GEOFENCE_OUTSIDE_ZONE" ||
          error.code === "GEOFENCE_NO_GPS" ||
          error.code === "GEOFENCE_NO_ASSIGNMENT"
        )) {
          setSubmitError(error.message);
          toast({
            title: "Coleta bloqueada",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Erro de conexão",
          description: "Salvando entrevista localmente para envio posterior...",
        });
        await saveOffline();
      }
    });
  };
  
  const handleSyncNow = async () => {
    if (!isOnline) {
      toast({
        title: "Sem conexão",
        description: "Aguarde a conexão ser restaurada.",
        variant: "destructive"
      });
      return;
    }
    
    toast({ title: "Sincronizando...", description: "Enviando entrevistas pendentes." });
    
    const result = await syncAllPending();
    const newCount = await getPendingCount();
    setPendingCount(newCount);
    
    if (result.synced > 0) {
      toast({
        title: "Sincronização concluída",
        description: `${result.synced} entrevista(s) enviada(s) com sucesso.`,
      });
    }
    if (result.failed > 0) {
      toast({
        title: "Algumas falhas",
        description: `${result.failed} entrevista(s) não puderam ser enviadas.`,
        variant: "destructive"
      });
    }
  };

  // Auto-trigger submission when entering 'submit' step, once audioBlob is ready
  useEffect(() => {
    if (step !== 'submit') {
      autoSubmitRef.current = false;
      return;
    }
    if (autoSubmitRef.current) return;
    const requireAudio = (survey as any)?.requireAudio ?? true;
    if (requireAudio && !audioBlob) return; // wait for recording to finalize
    autoSubmitRef.current = true;
    handleSubmit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, audioBlob]);

  // Animate progress bar while in 'submit' step
  useEffect(() => {
    if (step !== 'submit') {
      setSubmitProgress(0);
      return;
    }
    setSubmitProgress(5);
    const interval = setInterval(() => {
      setSubmitProgress(prev => {
        if (prev >= 82) { clearInterval(interval); return 82; }
        const increment = prev < 30 ? 4 : prev < 60 ? 2 : 1;
        return Math.min(prev + increment, 82);
      });
    }, 180);
    return () => clearInterval(interval);
  }, [step]);

  // Track submission phase label
  useEffect(() => {
    if (isUploadingAudio) {
      setSubmitPhaseLabel('Enviando áudio...');
      setSubmitProgress(prev => Math.max(prev, 20));
    } else if (isSubmitting) {
      setSubmitPhaseLabel('Registrando dados...');
      setSubmitProgress(prev => Math.max(prev, 55));
    } else if (isSavingOffline) {
      setSubmitPhaseLabel('Salvando localmente...');
    }
  }, [isUploadingAudio, isSubmitting, isSavingOffline]);

  // Jump to 100% when success
  useEffect(() => {
    if (step === 'success') {
      setSubmitProgress(100);
    }
  }, [step]);

  if (surveyLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!survey) {
    const offline = !navigator.onLine;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center gap-4">
        {offline
          ? <WifiOff className="w-14 h-14 text-amber-500" />
          : <AlertTriangle className="w-14 h-14 text-destructive" />
        }
        <h2 className="text-xl font-bold">
          {offline ? 'Dados não disponíveis offline' : 'Pesquisa não encontrada'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {offline
            ? 'Esta pesquisa ainda não foi baixada para uso offline. Conecte-se à internet, abra a página de pesquisas e toque no botão de download (↓) ao lado de "Iniciar Coleta".'
            : 'Esta pesquisa não existe ou você não tem acesso a ela.'}
        </p>
        <Button variant="outline" onClick={() => setLocation('/')}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-primary text-primary-foreground p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display font-bold text-lg truncate flex-1">{survey.title}</h1>
          {pendingCount > 0 && (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => setLocation('/collect/pending')}
              className="shrink-0"
              data-testid="button-sync-pending"
            >
              <Cloud className="w-4 h-4 mr-1" />
              {pendingCount}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs opacity-80 mt-1 flex-wrap">
          {isRecording && <span className="flex items-center gap-1 text-red-300 animate-pulse"><Mic className="w-3 h-3" /> GRAVANDO</span>}
          {gpsCoords && gpsAccuracyOk && <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> GPS {gpsCoords.accuracy.toFixed(0)}m</span>}
          {gpsCoords && !gpsAccuracyOk && <span className="flex items-center gap-1 text-orange-300"><MapPin className="w-3 h-3" /> GPS ~{gpsCoords.accuracy.toFixed(0)}m</span>}
          {!gpsCoords && gpsRawAccuracy && <span className="flex items-center gap-1 text-blue-300"><MapPin className="w-3 h-3" /> GPS {gpsRawAccuracy.toFixed(0)}m…</span>}
          {!gpsCoords && !gpsRawAccuracy && !skippedGps && <span className="flex items-center gap-1 text-blue-300"><MapPin className="w-3 h-3" /> GPS Aguardando</span>}
          {skippedGps && !gpsCoords && <span className="flex items-center gap-1 text-yellow-300"><MapPin className="w-3 h-3" /> Sem GPS</span>}
          {!isOnline && <span className="flex items-center gap-1 text-yellow-300"><WifiOff className="w-3 h-3" /> Modo Offline</span>}
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {step === 'permissions' && (
          <Card className="p-6 space-y-6 text-center">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Verificação Pré-Entrevista</h2>
              <p className="text-muted-foreground text-sm">Permissões necessárias para garantir a integridade da auditoria.</p>
            </div>

            <div className="space-y-3 text-left">
              {((survey as any)?.requireGps ?? true) && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      skippedGps ? 'bg-yellow-100 text-yellow-600'
                      : gpsCoords && gpsAccuracyOk ? 'bg-green-100 text-green-600'
                      : gpsCoords && !gpsAccuracyOk ? 'bg-orange-100 text-orange-600'
                      : gpsBestSoFar ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-400'
                    }`}>
                      {skippedGps ? <MapPin className="w-5 h-5" /> 
                       : gpsCoords && gpsAccuracyOk ? <CheckCircle className="w-5 h-5" />
                       : gpsCoords && !gpsAccuracyOk ? <MapPin className="w-5 h-5" />
                       : gpsBestSoFar ? <Loader2 className="w-5 h-5 animate-spin" />
                       : <Loader2 className="w-5 h-5 animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">Localização GPS</p>
                      <p className="text-xs text-muted-foreground">
                        {skippedGps
                          ? "Entrevista sem GPS"
                          : gpsError
                          ? gpsError
                          : gpsAccuracyOk
                          ? `Precisão: ${gpsCoords?.accuracy.toFixed(0)}m — ${gpsSampleCount} amostras`
                          : gpsCoords
                          ? `Melhorando… ${gpsCoords.accuracy.toFixed(0)}m (${gpsSampleCount} amostras)`
                          : gpsRawAccuracy
                          ? `Aguardando chip GPS… ${gpsRawAccuracy.toFixed(0)}m`
                          : "Aguardando sinal GPS..."}
                      </p>
                      {/* Real-time accuracy progress bar */}
                      {!skippedGps && (gpsRawAccuracy !== null || gpsCoords) && (
                        <div className="mt-2">
                          {(() => {
                            const current = gpsCoords?.accuracy ?? gpsRawAccuracy ?? 999;
                            // Map accuracy to bar: 0m=100%, 50m=100%, 100m=60%, 200m=30%, 500m+=5%
                            const pct = Math.max(5, Math.min(100, Math.round(100 - (Math.log10(Math.max(current, 1)) / Math.log10(500)) * 95)));
                            const color = current <= 50 ? 'bg-green-500' : current <= 100 ? 'bg-yellow-400' : 'bg-orange-400';
                            const label = current <= 20 ? 'Excelente' : current <= 50 ? 'Boa' : current <= 100 ? 'Razoável' : current <= 200 ? 'Fraca' : 'Muito fraca';
                            return (
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>Sinal: <span className={current <= 50 ? 'text-green-600 font-medium' : current <= 100 ? 'text-yellow-600' : 'text-orange-600'}>{label}</span></span>
                                  <span>{current.toFixed(0)}m</span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {/* Help: very weak signal */}
                      {!skippedGps && (gpsRawAccuracy ?? 0) > 200 && !gpsAccuracyOk && (
                        <p className="text-xs text-amber-600 mt-1">
                          💡 Vá para um local a céu aberto e ative "Alta precisão" no GPS do celular.
                        </p>
                      )}
                    </div>
                  </div>
                  {/* No GPS signal at all after 5s — show skip */}
                  {!gpsCoords && !gpsBestSoFar && !skippedGps && gpsTimeoutReached && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                      onClick={handleSkipGps}
                      data-testid="button-skip-gps"
                    >
                      Continuar sem GPS
                    </Button>
                  )}
                  {/* Has signal but imprecise after 8s — show "proceed anyway" */}
                  {!gpsAccuracyOk && gpsCoords && !skippedGps && gpsShowAcceptImprecise && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-orange-400 text-orange-600 hover:bg-orange-50"
                      onClick={() => { setGpsAccuracyOk(false); setGpsAccepted(true); }}
                      data-testid="button-accept-imprecise-gps"
                    >
                      Usar GPS atual ({gpsCoords.accuracy.toFixed(0)}m) e continuar
                    </Button>
                  )}
                </div>
              )}

              {((survey as any)?.requireAudio ?? true) && (
                <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Evidência de Áudio</p>
                    <p className="text-xs text-muted-foreground">Iniciará automaticamente</p>
                  </div>
                </div>
              )}
            </div>

            {/* Waiting for zone data to load — shown when GPS is ready but zones still fetching */}
            {geofenceBlocking && isGeofenceActive && !zonesLoaded && gpsCoords && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600" data-testid="alert-zones-loading">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Verificando setor designado...
              </div>
            )}

            {/* No zone assignment — blocked everywhere */}
            {noZoneAssigned && (
              <div
                className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg"
                data-testid="alert-no-zone-assigned"
              >
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-700 text-sm">Sem setor atribuído</p>
                  <p className="text-red-600 text-xs mt-0.5">
                    Você não possui nenhum setor de coleta para esta pesquisa.
                    Contacte o coordenador para receber uma área designada.
                  </p>
                </div>
              </div>
            )}

            {/* Outside assigned zone warning — GPS confirmed outside polygon */}
            {outsideAssignedZone && (
              <div
                className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg"
                data-testid="alert-zone-blocked"
              >
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-700 text-sm">Fora do setor designado</p>
                  <p className="text-red-600 text-xs mt-0.5">
                    Você está fora de <strong>{activeNeighborhood}</strong>.
                    Retorne ao bairro para poder iniciar a entrevista.
                  </p>
                </div>
              </div>
            )}

            <Button 
              size="lg" 
              className="w-full" 
              onClick={handleStartInterview}
              disabled={
                (((survey as any)?.requireGps ?? true) && !gpsAccepted && !skippedGps) ||
                (geofenceBlocking && isGeofenceActive && !zonesLoaded) ||
                gpsZoneBlocked
              }
              data-testid="button-start-interview"
            >
              Iniciar Entrevista
            </Button>
            
            {skippedGps && (
              <p className="text-xs text-yellow-600 text-center">
                Esta entrevista será marcada como "Sem GPS" no painel do supervisor.
              </p>
            )}

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setLocation('/')}
              data-testid="button-back-home"
            >
              ← Voltar
            </Button>
          </Card>
        )}

        {/* Geofencing: loading overlay
            Shows when:
            a) zones are still fetching (!zonesLoaded), OR
            b) zones are loaded + interviewer has assignments + GPS not yet confirmed
            Does NOT show when zonesLoaded=true but myZones=[] (no assignments → no restriction) */}
        {(step === 'questions' || step === 'submit') && geofenceEnabled && geofenceBlocking &&
          (!zonesLoaded || (myZones.length > 0 && !geofenceHasPosition)) && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-800 text-white p-8 text-center"
            data-testid="overlay-geofence-loading"
          >
            <Loader2 className="w-12 h-12 mb-4 animate-spin opacity-80" />
            <h2 className="text-xl font-bold mb-2">Verificando localização</h2>
            <p className="text-sm opacity-75">
              {!zonesLoaded ? 'Carregando setor designado...' : 'Aguardando sinal GPS para confirmar sua posição...'}
            </p>
          </div>
        )}

        {/* Geofencing: blocking overlay — GPS confirmed user is outside their assigned zone */}
        {(step === 'questions' || step === 'submit') && geofenceEnabled && geofenceBlocking &&
          zonesLoaded && myZones.length > 0 && geofenceHasPosition && !isInsideZone && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-700 text-white p-8 text-center"
            data-testid="overlay-geofence-blocked"
          >
            <AlertTriangle className="w-16 h-16 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold mb-2">Coleta bloqueada</h2>
            <p className="text-base opacity-90 mb-1">Você está fora do setor designado.</p>
            <p className="text-sm opacity-75">Retorne ao bairro <strong>{geofenceZoneName || activeNeighborhood}</strong> para continuar a entrevista.</p>
          </div>
        )}

        {/* Geofencing alert banner - shown when outside designated zone (warn-only mode) */}
        {step === 'questions' && isGeofenceActive && !isInsideZone && !geofenceBlocking && (
          <div
            className="bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-3 shadow-lg animate-pulse"
            data-testid="banner-geofence-alert"
            role="alert"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">Você saiu do setor!</p>
              <p className="text-xs opacity-90">Retorne ao bairro: <strong>{geofenceZoneName}</strong></p>
            </div>
          </div>
        )}

        {step === 'questions' && shuffledQuestions.length > 0 && (
          <div className="space-y-6">
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300" 
                style={{ width: `${((currentQuestionIndex + 1) / shuffledQuestions.length) * 100}%` }}
              />
            </div>
            
            <Card className="p-6 min-h-[300px] flex flex-col">
              <span className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                Pergunta {currentQuestionIndex + 1} de {shuffledQuestions.length}
              </span>
              <h3 className="text-xl font-medium mb-6">{shuffledQuestions[currentQuestionIndex].text}</h3>

              <div className="flex-1" key={shuffledQuestions[currentQuestionIndex].id}>
                {shuffledQuestions[currentQuestionIndex].type === 'text' && (
                  <Input 
                    placeholder="Digite sua resposta..." 
                    value={answers[shuffledQuestions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswer(shuffledQuestions[currentQuestionIndex].id, e.target.value)}
                    className="text-lg py-6"
                  />
                )}
                {shuffledQuestions[currentQuestionIndex].type === 'number' && (
                  <Input 
                    type="number"
                    placeholder="Digite um número..." 
                    value={answers[shuffledQuestions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswer(shuffledQuestions[currentQuestionIndex].id, e.target.value)}
                    className="text-lg py-6"
                  />
                )}
                {shuffledQuestions[currentQuestionIndex].type === 'single_choice' && (
                  <RadioGroup 
                    value={answers[shuffledQuestions[currentQuestionIndex].id] ?? ""}
                    onValueChange={(val) => handleAnswer(shuffledQuestions[currentQuestionIndex].id, val)}
                  >
                    {(shuffledOptionsMap[shuffledQuestions[currentQuestionIndex].id] || []).map((opt, idx) => {
                       const optText = getOptionText(opt);
                       const optImage = getOptionImage(opt);
                       return (
                         <div key={`q${shuffledQuestions[currentQuestionIndex].id}-opt-${idx}`} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                           <RadioGroupItem value={optText} id={`opt-${shuffledQuestions[currentQuestionIndex].id}-${idx}`} />
                           {optImage && (
                             <img 
                               src={optImage} 
                               alt={optText} 
                               className="w-12 h-12 object-cover rounded-md border shrink-0"
                             />
                           )}
                           <Label htmlFor={`opt-${shuffledQuestions[currentQuestionIndex].id}-${idx}`} className="text-base cursor-pointer flex-1">{optText}</Label>
                         </div>
                       );
                    })}
                  </RadioGroup>
                )}
                {shuffledQuestions[currentQuestionIndex].type === 'scale' && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {(shuffledOptionsMap[shuffledQuestions[currentQuestionIndex].id] as string[] || ['1','2','3','4','5','6','7','8','9','10']).map((opt, idx) => (
                       <Button 
                         key={`scale-${idx}`}
                         variant={answers[shuffledQuestions[currentQuestionIndex].id] === opt ? "default" : "outline"}
                         onClick={() => handleAnswer(shuffledQuestions[currentQuestionIndex].id, typeof opt === 'string' ? opt : getOptionText(opt))}
                         className="min-w-[80px]"
                       >
                         {typeof opt === 'string' ? opt : getOptionText(opt)}
                       </Button>
                    ))}
                  </div>
                )}
                {shuffledQuestions[currentQuestionIndex].type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {(shuffledOptionsMap[shuffledQuestions[currentQuestionIndex].id] || []).map((opt, idx) => {
                      const optText = getOptionText(opt);
                      const optImage = getOptionImage(opt);
                      const currentVal = answers[shuffledQuestions[currentQuestionIndex].id] || [];
                      const isSelected = Array.isArray(currentVal) && currentVal.includes(optText);
                      return (
                        <div 
                          key={`${optText}-${idx}`} 
                          className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            const arr = Array.isArray(currentVal) ? [...currentVal] : [];
                            if (isSelected) {
                              handleAnswer(shuffledQuestions[currentQuestionIndex].id, arr.filter(v => v !== optText));
                            } else {
                              handleAnswer(shuffledQuestions[currentQuestionIndex].id, [...arr, optText]);
                            }
                          }}
                        >
                          <div className={`w-5 h-5 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-primary-foreground' : ''}`}>
                            {isSelected && <CheckCircle className="w-4 h-4" />}
                          </div>
                          {optImage && (
                            <img 
                              src={optImage} 
                              alt={optText} 
                              className="w-12 h-12 object-cover rounded-md border shrink-0"
                            />
                          )}
                          <span className="text-base flex-1">{optText}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {shuffledQuestions[currentQuestionIndex].type === 'boolean' && (
                  <div className="flex gap-4 justify-center">
                    <Button 
                      variant={answers[shuffledQuestions[currentQuestionIndex].id] === 'true' ? "default" : "outline"}
                      size="lg"
                      className="flex-1 max-w-32"
                      onClick={() => handleAnswer(shuffledQuestions[currentQuestionIndex].id, 'true')}
                    >
                      Sim
                    </Button>
                    <Button 
                      variant={answers[shuffledQuestions[currentQuestionIndex].id] === 'false' ? "default" : "outline"}
                      size="lg"
                      className="flex-1 max-w-32"
                      onClick={() => handleAnswer(shuffledQuestions[currentQuestionIndex].id, 'false')}
                    >
                      Não
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t flex justify-between gap-3">
                <Button 
                  variant="destructive" 
                  size="lg"
                  onClick={() => setShowAbandonDialog(true)}
                  data-testid="button-abandon-interview"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Abandonar
                </Button>
                <Button onClick={handleNextQuestion} size="lg" className="px-8">
                  {currentQuestionIndex === shuffledQuestions.length - 1 ? "Finalizar" : "Próxima"} <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </Card>

            {/* Floating navigation buttons - only show when answer is selected */}
            {answers[shuffledQuestions[currentQuestionIndex].id] !== undefined && 
             answers[shuffledQuestions[currentQuestionIndex].id] !== null && 
             answers[shuffledQuestions[currentQuestionIndex].id] !== '' &&
             !(Array.isArray(answers[shuffledQuestions[currentQuestionIndex].id]) && answers[shuffledQuestions[currentQuestionIndex].id].length === 0) && (
              <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 z-50 pointer-events-none">
                <Button
                  size="icon"
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg pointer-events-auto"
                  onClick={handleClearCurrentAnswer}
                  title="Desmarcar resposta"
                  data-testid="button-floating-change-answer"
                >
                  <Square className="w-6 h-6" />
                </Button>
                <Button
                  size="icon"
                  className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg pointer-events-auto"
                  onClick={handleNextQuestion}
                  title="Próxima pergunta"
                  data-testid="button-floating-next"
                >
                  <Play className="w-6 h-6" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Abandon interview confirmation dialog */}
        <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Abandonar entrevista?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os dados coletados nesta entrevista serão perdidos. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-500 hover:bg-red-600"
                onClick={handleAbandonInterview}
              >
                Sim, abandonar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {step === 'submit' && (
          <Card className="p-8 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {isOnline ? 'Enviando Entrevista...' : 'Salvando Localmente...'}
              </h2>
              <p className="text-muted-foreground text-sm">{submitPhaseLabel}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-muted-foreground">Progresso</span>
                <span>{submitProgress}%</span>
              </div>
              <Progress value={submitProgress} className="h-3" />
            </div>

            <div className="bg-muted p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Perguntas:</span>
                <span className="font-bold">{Object.keys(answers).length}/{shuffledQuestions.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Conexão:</span>
                <span className={`font-bold ${isOnline ? 'text-green-600' : 'text-yellow-600'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {submitError && (
              <div
                className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg text-left"
                data-testid="alert-submit-geofence-error"
              >
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-700 text-sm">Envio bloqueado</p>
                  <p className="text-red-600 text-xs mt-0.5">{submitError}</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {step === 'success' && (
          <Card className="p-8 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {isOnline ? 'Enviado com Sucesso!' : 'Salvo com Sucesso!'}
              </h2>
              <p className="text-muted-foreground">
                {isOnline
                  ? 'A entrevista foi registrada e os dados estão seguros.'
                  : 'Salvo no dispositivo. Será enviado automaticamente ao reconectar.'}
              </p>
            </div>

            <div className="space-y-2">
              <Progress value={100} className="h-3" />
            </div>

            <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Perguntas Respondidas:</span>
                <span className="font-bold text-green-700">{Object.keys(answers).length}/{shuffledQuestions.length}</span>
              </div>
              {((survey as any)?.requireAudio ?? true) && (
                <div className="flex justify-between">
                  <span>Áudio:</span>
                  <span className="font-bold text-green-700">Confirmado</span>
                </div>
              )}
              {((survey as any)?.requireGps ?? true) && (
                <div className="flex justify-between">
                  <span>GPS:</span>
                  <span className="font-bold text-green-700">Confirmado</span>
                </div>
              )}
            </div>

            <InstallBanner orgId={interviewOrgId} />

            <Button 
              className="w-full h-12 text-lg" 
              onClick={handleNewInterview}
              data-testid="button-new-interview"
            >
              Nova Entrevista
            </Button>
            <Button 
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setLocation('/collect/pending')}
              data-testid="button-exit-after-submit"
            >
              Sair
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

function ShieldCheck(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
