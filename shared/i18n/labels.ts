export const statusLabels = {
  survey: {
    draft: 'Rascunho',
    active: 'Ativa',
    paused: 'Pausada',
    completed: 'Concluída',
    archived: 'Arquivada',
  },
  response: {
    valid: 'Válida',
    suspicious: 'Suspeita',
    invalid: 'Inválida',
  },
} as const;

export const planLabels = {
  basic: 'Básico',
  pro: 'Profissional',
  enterprise: 'Empresarial',
} as const;

export const roleLabels = {
  owner: 'Proprietário',
  admin: 'Administrador',
  coordinator: 'Coordenador',
  interviewer: 'Entrevistador',
  viewer: 'Visualizador',
} as const;

export const surveyTypeLabels = {
  electoral: 'Eleitoral',
  opinion: 'Opinião',
  market: 'Mercado',
  census: 'Censo',
} as const;

export const questionTypeLabels = {
  single_choice: 'Escolha Única',
  multiple_choice: 'Múltipla Escolha',
  text: 'Texto',
  number: 'Número',
  scale: 'Escala',
  date: 'Data',
  boolean: 'Sim/Não',
} as const;

export function getSurveyStatusLabel(status: string): string {
  return statusLabels.survey[status as keyof typeof statusLabels.survey] || status;
}

export function getResponseStatusLabel(status: string): string {
  return statusLabels.response[status as keyof typeof statusLabels.response] || status;
}

export function getPlanLabel(plan: string): string {
  return planLabels[plan as keyof typeof planLabels] || plan;
}

export function getRoleLabel(role: string): string {
  return roleLabels[role as keyof typeof roleLabels] || role;
}

export function getSurveyTypeLabel(type: string): string {
  return surveyTypeLabels[type as keyof typeof surveyTypeLabels] || type;
}

export function getQuestionTypeLabel(type: string): string {
  return questionTypeLabels[type as keyof typeof questionTypeLabels] || type;
}

export const surveyStatusOptions = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'completed', label: 'Concluída' },
  { value: 'archived', label: 'Arquivada' },
];

export const surveyTypeOptions = [
  { value: 'electoral', label: 'Eleitoral' },
  { value: 'opinion', label: 'Opinião' },
  { value: 'market', label: 'Mercado' },
  { value: 'census', label: 'Censo' },
];

export const questionTypeOptions = [
  { value: 'single_choice', label: 'Escolha Única' },
  { value: 'multiple_choice', label: 'Múltipla Escolha' },
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'scale', label: 'Escala' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
];

export const roleOptions = [
  { value: 'owner', label: 'Proprietário' },
  { value: 'admin', label: 'Administrador' },
  { value: 'coordinator', label: 'Coordenador' },
  { value: 'interviewer', label: 'Entrevistador' },
  { value: 'viewer', label: 'Visualizador' },
];
