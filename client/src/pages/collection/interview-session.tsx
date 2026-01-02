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

  // 1. GPS Check
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setGpsCoords(position.coords),
        (err) => setGpsError("Location access is required.")
      );
    } else {
      setGpsError("Geolocation is not supported by this browser.");
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

    // 1. Upload Audio
    const audioFile = new File([audioBlob], `interview-${Date.now()}.webm`, { type: "audio/webm" });
    const uploadRes = await uploadFile(audioFile);

    if (!uploadRes) {
      alert("Failed to upload audio evidence.");
      return;
    }

    // 2. Submit Data
    const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
      questionId: parseInt(qId),
      value: val
    }));

    // Calculate duration (mock for now, ideally track start/end time)
    const duration = 120; // seconds

    submitResponse({
      surveyId,
      data: {
        response: {
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
          accuracy: gpsCoords.accuracy,
          gpsTimestamp: new Date(gpsCoords.timestamp || Date.now()),
          audioUrl: uploadRes.objectPath,
          audioHash: "mock-hash", // Backend can calc this if needed or just mock for now
          audioDuration: 0, // Should calc from blob
          deviceInfo: { userAgent: navigator.userAgent },
          startTime: new Date(), // Should be captured at start
          endTime: new Date(),
          duration: duration
        },
        answers: formattedAnswers
      }
    }, {
      onSuccess: () => {
        alert("Interview submitted successfully!");
        setLocation("/"); // Or back to list
      }
    });
  };

  if (surveyLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!survey) return <div>Survey not found</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 sticky top-0 z-10 shadow-md">
        <h1 className="font-display font-bold text-lg truncate">{survey.title}</h1>
        <div className="flex items-center gap-2 text-xs opacity-80 mt-1">
          {isRecording && <span className="flex items-center gap-1 text-red-300 animate-pulse"><Mic className="w-3 h-3" /> REC</span>}
          {gpsCoords && <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> GPS Locked</span>}
        </div>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {step === 'permissions' && (
          <Card className="p-6 space-y-6 text-center">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Pre-Interview Check</h2>
              <p className="text-muted-foreground text-sm">Required permissions to ensure audit integrity.</p>
            </div>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${gpsCoords ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {gpsCoords ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">GPS Location</p>
                  <p className="text-xs text-muted-foreground">{gpsError || (gpsCoords ? `Accuracy: ${gpsCoords.accuracy.toFixed(0)}m` : "Waiting for signal...")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Audio Evidence</p>
                  <p className="text-xs text-muted-foreground">Will start automatically</p>
                </div>
              </div>
            </div>

            <Button 
              size="lg" 
              className="w-full" 
              onClick={handleStartInterview}
              disabled={!gpsCoords}
            >
              Start Interview
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
                Question {currentQuestionIndex + 1} of {survey.questions.length}
              </span>
              <h3 className="text-xl font-medium mb-6">{survey.questions[currentQuestionIndex].text}</h3>

              <div className="flex-1">
                {/* Render Question Input based on type */}
                {survey.questions[currentQuestionIndex].type === 'text' && (
                  <Input 
                    placeholder="Type answer..." 
                    value={answers[survey.questions[currentQuestionIndex].id] || ''}
                    onChange={(e) => handleAnswer(survey.questions[currentQuestionIndex].id, e.target.value)}
                    className="text-lg py-6"
                  />
                )}
                {/* Add other types (single_choice, etc.) here */}
                {survey.questions[currentQuestionIndex].type === 'single_choice' && (
                  <RadioGroup 
                    value={answers[survey.questions[currentQuestionIndex].id]} 
                    onValueChange={(val) => handleAnswer(survey.questions[currentQuestionIndex].id, val)}
                  >
                    {(survey.questions[currentQuestionIndex].options as string[]).map((opt) => (
                       <div key={opt} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                         <RadioGroupItem value={opt} id={opt} />
                         <Label htmlFor={opt} className="text-base cursor-pointer flex-1">{opt}</Label>
                       </div>
                    ))}
                  </RadioGroup>
                )}
              </div>

              <div className="mt-8 pt-4 border-t flex justify-end">
                <Button onClick={handleNextQuestion} size="lg" className="px-8">
                  {currentQuestionIndex === survey.questions.length - 1 ? "Finish" : "Next"} <ChevronRight className="ml-2 w-4 h-4" />
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
              <h2 className="text-2xl font-bold mb-2">Interview Complete</h2>
              <p className="text-muted-foreground">Ready to submit data securely.</p>
            </div>
            
            <div className="bg-muted p-4 rounded-lg text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span>Questions Answered:</span>
                <span className="font-bold">{Object.keys(answers).length}/{survey.questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Audio Evidence:</span>
                <span className="font-bold">Ready</span>
              </div>
              <div className="flex justify-between">
                <span>GPS Accuracy:</span>
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
                  {isUploadingAudio ? "Uploading Audio..." : "Submitting Data..."}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" /> Submit Interview
                </>
              )}
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

// Icon for step 1
function ShieldCheck(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
