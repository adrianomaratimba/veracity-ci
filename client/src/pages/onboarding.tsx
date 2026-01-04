import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertOrganizationSchema } from "@shared/schema";
import { z } from "zod";
import { useLocation } from "wouter";
import { Loader2, Building2, ClipboardList, Users, CheckCircle2, ArrowRight, ArrowLeft, Plus, X, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const steps = [
  { id: 1, title: "Organização", icon: Building2 },
  { id: 2, title: "Primeira Pesquisa", icon: ClipboardList },
  { id: 3, title: "Equipe", icon: Users },
  { id: 4, title: "Conclusão", icon: CheckCircle2 },
];

const surveyTypes = [
  { value: "electoral", label: "Pesquisa Eleitoral", description: "Intenção de voto, rejeição, avaliação de governo" },
  { value: "opinion", label: "Pesquisa de Opinião", description: "Opinião pública sobre temas diversos" },
  { value: "market", label: "Pesquisa de Mercado", description: "Comportamento do consumidor, preferências" },
  { value: "census", label: "Censo/Levantamento", description: "Coleta de dados demográficos" },
];

const orgFormSchema = insertOrganizationSchema.extend({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
});

const surveyFormSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  type: z.enum(["electoral", "opinion", "market", "census"]),
  description: z.string().optional(),
  targetSample: z.union([z.number().min(1), z.nan()]).optional().transform(v => (Number.isNaN(v) ? undefined : v)),
});

type OrgFormData = z.infer<typeof orgFormSchema>;
type SurveyFormData = z.infer<typeof surveyFormSchema>;

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [orgData, setOrgData] = useState<{ id: number; name: string; slug: string } | null>(null);
  const [surveyData, setSurveyData] = useState<{ id: number; title: string; type: string } | null>(null);
  const [teamEmails, setTeamEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [, setLocation] = useLocation();

  const orgForm = useForm<OrgFormData>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: { name: "", slug: "", plan: "basic" },
  });

  const surveyForm = useForm<SurveyFormData>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: { title: "", type: "electoral", description: "", targetSample: 400 },
  });

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleOrgSubmit = async (data: OrgFormData) => {
    setIsCreatingOrg(true);
    try {
      const slug = data.slug || generateSlug(data.name);
      const response = await apiRequest("POST", "/api/organizations", { ...data, slug });
      const org = await response.json();
      setOrgData({ id: org.id, name: org.name, slug: org.slug });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setCurrentStep(2);
    } catch (error) {
      console.error("Error creating organization:", error);
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleSurveySubmit = async (data: SurveyFormData) => {
    if (!orgData) return;
    setIsCreatingSurvey(true);
    try {
      const response = await apiRequest("POST", `/api/organizations/${orgData.id}/surveys`, {
        ...data,
        organizationId: orgData.id,
        status: "draft",
      });
      const survey = await response.json();
      setSurveyData({ id: survey.id, title: survey.title, type: survey.type });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgData.id, "surveys"] });
      setCurrentStep(3);
    } catch (error) {
      console.error("Error creating survey:", error);
    } finally {
      setIsCreatingSurvey(false);
    }
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !teamEmails.includes(email)) {
      setTeamEmails([...teamEmails, email]);
      setEmailInput("");
    }
  };

  const removeEmail = (email: string) => {
    setTeamEmails(teamEmails.filter(e => e !== email));
  };

  const handleInviteTeam = async () => {
    if (!orgData || teamEmails.length === 0) {
      setCurrentStep(4);
      return;
    }
    setIsInviting(true);
    try {
      for (const email of teamEmails) {
        await apiRequest("POST", `/api/organizations/${orgData.id}/invitations`, {
          email,
          role: "interviewer",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgData.id, "invitations"] });
      setCurrentStep(4);
    } catch (error) {
      console.error("Error inviting team:", error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleFinish = () => {
    if (orgData) {
      setLocation(`/org/${orgData.id}/dashboard`);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = currentStep === step.id;
        const isCompleted = currentStep > step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              isActive ? "bg-primary text-primary-foreground" :
              isCompleted ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <StepIcon className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">{step.title}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${currentStep > step.id ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-display flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Criar Organização
        </CardTitle>
        <CardDescription>
          Configure seu instituto ou empresa de pesquisa para começar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={orgForm.handleSubmit(handleOrgSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome da Organização</label>
            <Input
              data-testid="input-org-name"
              placeholder="Ex: Instituto de Pesquisas ABC"
              {...orgForm.register("name", {
                onChange: (e) => {
                  const slug = generateSlug(e.target.value);
                  orgForm.setValue("slug", slug);
                }
              })}
            />
            {orgForm.formState.errors.name && (
              <p className="text-xs text-destructive">{orgForm.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Identificador URL</label>
            <div className="flex items-center">
              <span className="bg-muted px-3 py-2 border border-r-0 rounded-l-md text-muted-foreground text-sm">
                veracity.app/
              </span>
              <Input
                data-testid="input-org-slug"
                placeholder="instituto-abc"
                {...orgForm.register("slug")}
                className="rounded-l-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Este será o endereço único da sua organização
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isCreatingOrg}
            data-testid="button-create-org"
          >
            {isCreatingOrg ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                Continuar
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-display flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Primeira Pesquisa
        </CardTitle>
        <CardDescription>
          Configure sua primeira pesquisa. Você poderá editá-la depois.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={surveyForm.handleSubmit(handleSurveySubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título da Pesquisa</label>
            <Input
              data-testid="input-survey-title"
              placeholder="Ex: Eleições Municipais 2026 - Cidade XYZ"
              {...surveyForm.register("title")}
            />
            {surveyForm.formState.errors.title && (
              <p className="text-xs text-destructive">{surveyForm.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de Pesquisa</label>
            <Select
              value={surveyForm.watch("type")}
              onValueChange={(value: any) => surveyForm.setValue("type", value)}
            >
              <SelectTrigger data-testid="select-survey-type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {surveyTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {surveyTypes.find(t => t.value === surveyForm.watch("type"))?.description}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Descrição (opcional)</label>
            <Textarea
              data-testid="input-survey-description"
              placeholder="Descreva o objetivo da pesquisa..."
              {...surveyForm.register("description")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amostra Alvo</label>
            <Input
              data-testid="input-survey-sample"
              type="number"
              placeholder="400"
              {...surveyForm.register("targetSample", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              Número de entrevistas planejadas
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(1)}
              className="flex-1"
              data-testid="button-step2-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isCreatingSurvey}
              data-testid="button-create-survey"
            >
              {isCreatingSurvey ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-display flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Convidar Equipe
        </CardTitle>
        <CardDescription>
          Convide entrevistadores e coordenadores. Você pode pular esta etapa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">E-mails dos membros</label>
          <div className="flex gap-2">
            <Input
              data-testid="input-team-email"
              type="email"
              placeholder="email@exemplo.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addEmail}
              data-testid="button-add-email"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {teamEmails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {teamEmails.map((email) => (
              <Badge key={email} variant="secondary" className="gap-1 pr-1">
                <Mail className="w-3 h-3" />
                {email}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1"
                  onClick={() => removeEmail(email)}
                  data-testid={`button-remove-email-${email.replace(/[^a-z0-9]/gi, '-')}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Os convites serão enviados como entrevistadores. Você pode alterar os papéis depois.
        </p>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCurrentStep(2)}
          className="flex-1"
          data-testid="button-step3-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button
          type="button"
          variant={teamEmails.length === 0 ? "outline" : "default"}
          onClick={handleInviteTeam}
          className="flex-1"
          disabled={isInviting}
          data-testid="button-invite-team"
        >
          {isInviting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : teamEmails.length === 0 ? (
            "Pular"
          ) : (
            <>
              Convidar {teamEmails.length} pessoa{teamEmails.length > 1 ? "s" : ""}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );

  const renderStep4 = () => (
    <Card className="max-w-lg w-full">
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl font-display">Tudo Pronto!</CardTitle>
        <CardDescription>
          Sua organização está configurada e pronta para uso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Organização</span>
            <span className="text-sm font-medium">{orgData?.name}</span>
          </div>
          {surveyData && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pesquisa criada</span>
              <span className="text-sm font-medium">{surveyData.title}</span>
            </div>
          )}
          {teamEmails.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Convites enviados</span>
              <span className="text-sm font-medium">{teamEmails.length} pessoa{teamEmails.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Próximos passos:</p>
          <ul className="mt-2 space-y-1">
            <li>1. Adicione perguntas à sua pesquisa</li>
            <li>2. Configure cotas e regiões</li>
            <li>3. Ative a pesquisa para coleta</li>
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleFinish}
          className="w-full"
          data-testid="button-finish-onboarding"
        >
          Ir para o Dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-4">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-display font-bold text-primary">Veracity</h1>
        <p className="text-muted-foreground mt-1">Configure sua plataforma de pesquisas</p>
      </div>

      {renderStepIndicator()}

      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}
    </div>
  );
}
