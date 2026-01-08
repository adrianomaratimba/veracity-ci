import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { useUpload } from "@/hooks/use-upload";
import { useSubmitResponse } from "@/hooks/use-responses";
import { useSurvey } from "@/hooks/use-surveys";
import { useLocationTracking } from "@/hooks/use-location-tracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MapPin, CheckCircle, AlertTriangle, ChevronRight, Save, XCircle, WifiOff, Cloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { savePendingInterview, generateInterviewId, generateClientId, getPendingCount } from "@/lib/offlineStorage";
import { syncAllPending } from "@/lib/syncQueue";
import type { QuestionLogic, SkipLogicRule } from "@shared/schema";

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
  const [gpsCoords, setGpsCoords] = useState<GeolocationCoordinates | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
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

  // Real-time location tracking for supervisor monitoring
  useLocationTracking({
    orgId: (survey as any)?.organizationId || 0,
    surveyId: surveyId,
    intervalMs: 30000,
    enabled: !!(survey as any)?.organizationId && step !== 'success'
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

  // GPS capture with high accuracy and multiple samples
  useEffect(() => {
    // Check if GPS is required for this survey
    const requireGps = (survey as any)?.requireGps ?? true;
    if (!requireGps) {
      // GPS not required - skip capture
      return;
    }

    if (!navigator.geolocation) {
      setGpsError("Geolocalização não é suportada por este navegador.");
      return;
    }

    let samples: GeolocationCoordinates[] = [];
    let watchId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const selectBestSample = () => {
      if (samples.length === 0) return;
      // Select sample with lowest accuracy (most precise)
      const best = samples.reduce((a, b) => (a.accuracy < b.accuracy ? a : b));
      setGpsCoords(best);
    };

    // Use watchPosition with high accuracy to collect multiple samples
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        samples.push(position.coords);
        // Update with current best reading
        if (samples.length === 1) {
          setGpsCoords(position.coords);
        } else {
          selectBestSample();
        }
      },
      (err) => {
        // Only show error if we have no samples after timeout
        if (samples.length === 0) {
          setGpsError("Erro ao obter localização. Verifique as permissões.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    // Stop collecting after 5 seconds and use best sample
    timeoutId = setTimeout(() => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      selectBestSample();
    }, 5000);

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
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
    
    // Only check GPS if required
    if (requireGps && !gpsCoords) return;
    
    // Only start recording if audio is required
    if (requireAudio) {
      await startRecording();
    }
    setStep('questions');
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

  const saveOffline = async () => {
    const requireGps = (survey as any)?.requireGps ?? true;
    const requireAudio = (survey as any)?.requireAudio ?? true;
    
    // Only check required fields
    if (requireAudio && !audioBlob) return;
    if (requireGps && !gpsCoords) return;
    
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
            deviceInfo: { userAgent: navigator.userAgent },
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
    
    // Only check required fields
    if (requireAudio && !audioBlob) return;
    if (requireGps && !gpsCoords) return;

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
          deviceInfo: { userAgent: navigator.userAgent },
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

  if (surveyLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!survey) return <div>Pesquisa não encontrada</div>;

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
          {gpsCoords && <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> GPS Ativo</span>}
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
                <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${gpsCoords ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {gpsCoords ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Localização GPS</p>
                    <p className="text-xs text-muted-foreground">{gpsError || (gpsCoords ? `Precisão: ${gpsCoords.accuracy.toFixed(0)}m` : "Aguardando sinal...")}</p>
                  </div>
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

            <Button 
              size="lg" 
              className="w-full" 
              onClick={handleStartInterview}
              disabled={((survey as any)?.requireGps ?? true) && !gpsCoords}
            >
              Iniciar Entrevista
            </Button>
          </Card>
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

              <div className="flex-1">
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
                    value={answers[shuffledQuestions[currentQuestionIndex].id]} 
                    onValueChange={(val) => handleAnswer(shuffledQuestions[currentQuestionIndex].id, val)}
                  >
                    {(shuffledOptionsMap[shuffledQuestions[currentQuestionIndex].id] || []).map((opt, idx) => {
                       const optText = getOptionText(opt);
                       const optImage = getOptionImage(opt);
                       return (
                         <div key={`${optText}-${idx}`} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                           <RadioGroupItem value={optText} id={`opt-${currentQuestionIndex}-${idx}`} />
                           {optImage && (
                             <img 
                               src={optImage} 
                               alt={optText} 
                               className="w-12 h-12 object-cover rounded-md border shrink-0"
                             />
                           )}
                           <Label htmlFor={`opt-${currentQuestionIndex}-${idx}`} className="text-base cursor-pointer flex-1">{optText}</Label>
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

              <div className="mt-8 pt-4 border-t flex justify-end">
                <Button onClick={handleNextQuestion} size="lg" className="px-8">
                  {currentQuestionIndex === shuffledQuestions.length - 1 ? "Finalizar" : "Próxima"} <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {step === 'submit' && (
          <Card className="p-8 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Entrevista Concluída</h2>
              <p className="text-muted-foreground">
                {isOnline 
                  ? "Pronto para enviar os dados com segurança."
                  : "Será salva localmente e enviada quando houver conexão."
                }
              </p>
            </div>
            
            {!isOnline && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                <WifiOff className="w-5 h-5 shrink-0" />
                <span className="text-sm">Modo offline ativo. A entrevista será armazenada no dispositivo.</span>
              </div>
            )}
            
            <div className="bg-muted p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Perguntas Respondidas:</span>
                <span className="font-bold">{Object.keys(answers).length}/{shuffledQuestions.length}</span>
              </div>
              {((survey as any)?.requireAudio ?? true) && (
                <div className="flex justify-between">
                  <span>Evidência de Áudio:</span>
                  <span className="font-bold">Pronto</span>
                </div>
              )}
              {((survey as any)?.requireGps ?? true) && (
                <div className="flex justify-between">
                  <span>Precisão do GPS:</span>
                  <span className="font-bold">{gpsCoords?.accuracy.toFixed(0)}m</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Conexão:</span>
                <span className={`font-bold ${isOnline ? 'text-green-600' : 'text-yellow-600'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg" 
              onClick={handleSubmit}
              disabled={isUploadingAudio || isSubmitting || isSavingOffline}
              data-testid="button-submit-interview"
            >
              {(isUploadingAudio || isSubmitting || isSavingOffline) ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {isSavingOffline ? "Salvando Localmente..." : isUploadingAudio ? "Enviando Áudio..." : "Enviando Dados..."}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Enviar Entrevista
                </>
              )}
            </Button>
          </Card>
        )}

        {step === 'success' && (
          <Card className="p-8 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Enviado com Sucesso!</h2>
              <p className="text-muted-foreground">A entrevista foi registrada e os dados estão seguros.</p>
            </div>
            
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Perguntas Respondidas:</span>
                <span className="font-bold text-green-700">{Object.keys(answers).length}/{shuffledQuestions.length}</span>
              </div>
              {((survey as any)?.requireAudio ?? true) && (
                <div className="flex justify-between">
                  <span>Áudio Registrado:</span>
                  <span className="font-bold text-green-700">Confirmado</span>
                </div>
              )}
              {((survey as any)?.requireGps ?? true) && (
                <div className="flex justify-between">
                  <span>GPS Verificado:</span>
                  <span className="font-bold text-green-700">Confirmado</span>
                </div>
              )}
            </div>

            <Button 
              className="w-full h-12 text-lg" 
              onClick={handleNewInterview}
              data-testid="button-new-interview"
            >
              Nova Entrevista
            </Button>
            <Button 
              variant="outline"
              className="w-full" 
              onClick={() => setLocation('/dashboard')}
            >
              Voltar ao Painel
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
