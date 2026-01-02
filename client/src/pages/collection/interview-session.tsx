import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { useUpload } from "@/hooks/use-upload";
import { useSubmitResponse } from "@/hooks/use-responses";
import { useSurvey } from "@/hooks/use-surveys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MapPin, CheckCircle, AlertTriangle, ChevronRight, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

interface InterviewSessionProps {
  params: { surveyId: string };
}

type Step = 'permissions' | 'questions' | 'submit';

export default function InterviewSession({ params }: InterviewSessionProps) {
  const surveyId = parseInt(params.surveyId);
  const { data: survey, isLoading: surveyLoading } = useSurvey(surveyId);
  const { startRecording, stopRecording, isRecording, audioBlob } = useMediaRecorder();
  const { uploadFile, isUploading: isUploadingAudio } = useUpload();
  const { mutate: submitResponse, isPending: isSubmitting } = useSubmitResponse();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>('permissions');
  const [gpsCoords, setGpsCoords] = useState<GeolocationCoordinates | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setGpsCoords(position.coords),
        (err) => setGpsError("Acesso à localização é obrigatório.")
      );
    } else {
      setGpsError("Geolocalização não é suportada por este navegador.");
    }
  }, []);

  const handleStartInterview = async () => {
    if (!gpsCoords) return;
    await startRecording();
    setStep('questions');
  };

  const handleNextQuestion = () => {
    if (!survey) return;
    if (currentQuestionIndex < survey.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      stopRecording();
      setStep('submit');
    }
  };

  const handleAnswer = (questionId: number, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!audioBlob || !gpsCoords) return;

    const audioFile = new File([audioBlob], `entrevista-${Date.now()}.webm`, { type: "audio/webm" });
    const uploadRes = await uploadFile(audioFile);

    if (!uploadRes) {
      alert("Falha ao enviar evidência de áudio.");
      return;
    }

    const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
      questionId: parseInt(qId),
      value: val
    }));

    const duration = 120;

    submitResponse({
      surveyId,
      data: {
        response: {
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
          accuracy: gpsCoords.accuracy,
          gpsTimestamp: new Date(),
          audioUrl: uploadRes.objectPath,
          audioHash: "mock-hash",
          audioDuration: 0,
          deviceInfo: { userAgent: navigator.userAgent },
          startTime: new Date(),
          endTime: new Date(),
          duration: duration
        },
        answers: formattedAnswers
      }
    }, {
      onSuccess: () => {
        alert("Entrevista enviada com sucesso!");
        setLocation("/");
      }
    });
  };

  if (surveyLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!survey) return <div>Pesquisa não encontrada</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-primary text-primary-foreground p-4 sticky top-0 z-10 shadow-md">
        <h1 className="font-display font-bold text-lg truncate">{survey.title}</h1>
        <div className="flex items-center gap-2 text-xs opacity-80 mt-1">
          {isRecording && <span className="flex items-center gap-1 text-red-300 animate-pulse"><Mic className="w-3 h-3" /> GRAVANDO</span>}
          {gpsCoords && <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> GPS Ativo</span>}
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
              <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${gpsCoords ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {gpsCoords ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Localização GPS</p>
                  <p className="text-xs text-muted-foreground">{gpsError || (gpsCoords ? `Precisão: ${gpsCoords.accuracy.toFixed(0)}m` : "Aguardando sinal...")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Evidência de Áudio</p>
                  <p className="text-xs text-muted-foreground">Iniciará automaticamente</p>
                </div>
              </div>
            </div>

            <Button 
              size="lg" 
              className="w-full" 
              onClick={handleStartInterview}
              disabled={!gpsCoords}
            >
              Iniciar Entrevista
            </Button>
          </Card>
        )}

        {step === 'questions' && (
          <div className="space-y-6">
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300" 
                style={{ width: `${((currentQuestionIndex + 1) / survey.questions.length) * 100}%` }}
              />
            </div>
            
            <Card className="p-6 min-h-[300px] flex flex-col">
              <span className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                Pergunta {currentQuestionIndex + 1} de {survey.questions.length}
              </span>
              <h3 className="text-xl font-medium mb-6">{survey.questions[currentQuestionIndex].text}</h3>

              <div className="flex-1">
                {(survey.questions[currentQuestionIndex].type === 'text' || survey.questions[currentQuestionIndex].type === 'texto') && (
                  <Input 
                    placeholder="Digite sua resposta..." 
                    value={answers[survey.questions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswer(survey.questions[currentQuestionIndex].id, e.target.value)}
                    className="text-lg py-6"
                  />
                )}
                {(survey.questions[currentQuestionIndex].type === 'number' || survey.questions[currentQuestionIndex].type === 'numero') && (
                  <Input 
                    type="number"
                    placeholder="Digite um número..." 
                    value={answers[survey.questions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswer(survey.questions[currentQuestionIndex].id, e.target.value)}
                    className="text-lg py-6"
                  />
                )}
                {(survey.questions[currentQuestionIndex].type === 'single_choice' || survey.questions[currentQuestionIndex].type === 'escolha_unica') && (
                  <RadioGroup 
                    value={answers[survey.questions[currentQuestionIndex].id]} 
                    onValueChange={(val) => handleAnswer(survey.questions[currentQuestionIndex].id, val)}
                  >
                    {(survey.questions[currentQuestionIndex].options as string[]).map((opt, idx) => (
                       <div key={`${opt}-${idx}`} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                         <RadioGroupItem value={opt} id={`opt-${currentQuestionIndex}-${idx}`} />
                         <Label htmlFor={`opt-${currentQuestionIndex}-${idx}`} className="text-base cursor-pointer flex-1">{opt}</Label>
                       </div>
                    ))}
                  </RadioGroup>
                )}
                {(survey.questions[currentQuestionIndex].type === 'scale' || survey.questions[currentQuestionIndex].type === 'escala') && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {(survey.questions[currentQuestionIndex].options as string[] || ['1','2','3','4','5','6','7','8','9','10']).map((opt, idx) => (
                       <Button 
                         key={`scale-${idx}`}
                         variant={answers[survey.questions[currentQuestionIndex].id] === opt ? "default" : "outline"}
                         onClick={() => handleAnswer(survey.questions[currentQuestionIndex].id, opt)}
                         className="min-w-[80px]"
                       >
                         {opt}
                       </Button>
                    ))}
                  </div>
                )}
                {(survey.questions[currentQuestionIndex].type === 'multiple_choice' || survey.questions[currentQuestionIndex].type === 'multipla_escolha') && (
                  <div className="space-y-2">
                    {(survey.questions[currentQuestionIndex].options as string[]).map((opt, idx) => {
                      const currentVal = answers[survey.questions[currentQuestionIndex].id] || [];
                      const isSelected = Array.isArray(currentVal) && currentVal.includes(opt);
                      return (
                        <div 
                          key={`${opt}-${idx}`} 
                          className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            const arr = Array.isArray(currentVal) ? [...currentVal] : [];
                            if (isSelected) {
                              handleAnswer(survey.questions[currentQuestionIndex].id, arr.filter(v => v !== opt));
                            } else {
                              handleAnswer(survey.questions[currentQuestionIndex].id, [...arr, opt]);
                            }
                          }}
                        >
                          <div className={`w-5 h-5 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-primary-foreground' : ''}`}>
                            {isSelected && <CheckCircle className="w-4 h-4" />}
                          </div>
                          <span className="text-base flex-1">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {survey.questions[currentQuestionIndex].type === 'booleano' && (
                  <div className="flex gap-4 justify-center">
                    <Button 
                      variant={answers[survey.questions[currentQuestionIndex].id] === 'true' ? "default" : "outline"}
                      size="lg"
                      className="flex-1 max-w-32"
                      onClick={() => handleAnswer(survey.questions[currentQuestionIndex].id, 'true')}
                    >
                      Sim
                    </Button>
                    <Button 
                      variant={answers[survey.questions[currentQuestionIndex].id] === 'false' ? "default" : "outline"}
                      size="lg"
                      className="flex-1 max-w-32"
                      onClick={() => handleAnswer(survey.questions[currentQuestionIndex].id, 'false')}
                    >
                      Não
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t flex justify-end">
                <Button onClick={handleNextQuestion} size="lg" className="px-8">
                  {currentQuestionIndex === survey.questions.length - 1 ? "Finalizar" : "Próxima"} <ChevronRight className="ml-2 w-4 h-4" />
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
              <p className="text-muted-foreground">Pronto para enviar os dados com segurança.</p>
            </div>
            
            <div className="bg-muted p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Perguntas Respondidas:</span>
                <span className="font-bold">{Object.keys(answers).length}/{survey.questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Evidência de Áudio:</span>
                <span className="font-bold">Pronto</span>
              </div>
              <div className="flex justify-between">
                <span>Precisão do GPS:</span>
                <span className="font-bold">{gpsCoords?.accuracy.toFixed(0)}m</span>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg" 
              onClick={handleSubmit}
              disabled={isUploadingAudio || isSubmitting}
            >
              {(isUploadingAudio || isSubmitting) ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {isUploadingAudio ? "Enviando Áudio..." : "Enviando Dados..."}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" /> Enviar Entrevista
                </>
              )}
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
