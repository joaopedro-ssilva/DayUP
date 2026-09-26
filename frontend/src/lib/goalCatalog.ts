import type { Goal, GoalCategory } from "./types";

export type CatalogGoal = {
  id: string; name: string; emoji: string; desc: string;
  category: GoalCategory; weight: 1 | 2 | 3; days: number[];
};

const ALL = [0, 1, 2, 3, 4, 5, 6], WEEKDAYS = [0, 1, 2, 3, 4], WEEKEND = [5, 6], MWF = [0, 2, 4], TT = [1, 3];

export const CATALOG: CatalogGoal[] = [
  { id: "treinar", name: "Treinar", emoji: "💪", desc: "Musculação ou funcional, uns 45 min", category: "health", weight: 3, days: MWF },
  { id: "cardio", name: "Correr ou pedalar", emoji: "🏃", desc: "30 min de cardio", category: "health", weight: 2, days: TT },
  { id: "passos", name: "Caminhar 8 mil passos", emoji: "🚶", desc: "Vale a volta na hora do almoço", category: "health", weight: 2, days: ALL },
  { id: "agua", name: "Beber 2 L de água", emoji: "💧", desc: "Garrafa em cima da mesa ajuda", category: "health", weight: 1, days: ALL },
  { id: "alongar", name: "Alongar 10 min", emoji: "🤸", desc: "Uma pausa entre os blocos de trabalho", category: "health", weight: 1, days: WEEKDAYS },
  { id: "programacao", name: "Estudar programação", emoji: "💻", desc: "1 hora de curso, documentação ou projeto", category: "study", weight: 3, days: WEEKDAYS },
  { id: "faculdade", name: "Estudar para a faculdade", emoji: "🎓", desc: "2 horas com pausa a cada 50 min", category: "study", weight: 3, days: WEEKDAYS },
  { id: "ingles", name: "Praticar inglês", emoji: "🗣️", desc: "20 min de app, podcast ou conversa", category: "study", weight: 2, days: WEEKDAYS },
  { id: "leitura", name: "Ler 20 páginas", emoji: "📖", desc: "Livro, não feed", category: "study", weight: 2, days: ALL },
  { id: "algoritmo", name: "Resolver um exercício de lógica", emoji: "🧩", desc: "LeetCode, Beecrowd ou parecido", category: "study", weight: 2, days: MWF },
  { id: "side-project", name: "Avançar no projeto pessoal", emoji: "🛠️", desc: "1 hora no side project", category: "study", weight: 2, days: WEEKEND },
  { id: "revisar", name: "Revisar o que estudou", emoji: "📝", desc: "15 min de anotações", category: "study", weight: 1, days: WEEKDAYS },
  { id: "foco", name: "2 horas de foco sem celular", emoji: "🎯", desc: "Um bloco de trabalho profundo", category: "wellness", weight: 3, days: WEEKDAYS },
  { id: "meditar", name: "Meditar 10 min", emoji: "🧘", desc: "Respiração e atenção", category: "wellness", weight: 2, days: ALL },
  { id: "redes", name: "No máximo 1 hora de redes sociais", emoji: "📵", desc: "Um timer no celular resolve", category: "wellness", weight: 2, days: ALL },
  { id: "diario", name: "Escrever no diário", emoji: "✍️", desc: "Três linhas sobre o dia", category: "wellness", weight: 1, days: ALL },
  { id: "sol", name: "Sair ao ar livre", emoji: "☀️", desc: "15 min de sol", category: "wellness", weight: 1, days: ALL },
  { id: "contato", name: "Falar com alguém importante", emoji: "💬", desc: "Família ou amigo, por ligação ou ao vivo", category: "wellness", weight: 1, days: WEEKEND },
  { id: "refeicoes", name: "Fazer 3 refeições de verdade", emoji: "🍽️", desc: "Sem pular o almoço", category: "food", weight: 2, days: ALL },
  { id: "vegetais", name: "Comer frutas e legumes", emoji: "🥗", desc: "Pelo menos 3 porções", category: "food", weight: 2, days: ALL },
  { id: "proteina", name: "Bater a meta de proteína", emoji: "🥩", desc: "Quem treina sente a diferença", category: "food", weight: 2, days: ALL },
  { id: "marmita", name: "Sem delivery", emoji: "🍱", desc: "Cozinhar ou levar marmita", category: "food", weight: 1, days: WEEKDAYS },
  { id: "refri", name: "Sem refrigerante", emoji: "🥤", desc: "Água, café ou chá", category: "food", weight: 1, days: ALL },
  { id: "cafe", name: "Café só até as 15h", emoji: "☕", desc: "Para não atrapalhar o sono", category: "food", weight: 1, days: ALL },
  { id: "dormir", name: "Dormir de 7 a 8 horas", emoji: "😴", desc: "Recuperação de verdade", category: "sleep", weight: 3, days: ALL },
  { id: "deitar", name: "Deitar até as 23h", emoji: "🌙", desc: "Horário fixo ajuda o corpo", category: "sleep", weight: 2, days: ALL },
  { id: "sem-tela", name: "Sem tela 30 min antes de dormir", emoji: "📱", desc: "Livro no lugar do feed", category: "sleep", weight: 2, days: ALL },
  { id: "acordar", name: "Acordar no mesmo horário", emoji: "⏰", desc: "Inclusive no fim de semana", category: "sleep", weight: 1, days: ALL },
];

export const CATALOG_BY_ID: Record<string, CatalogGoal> = Object.fromEntries(CATALOG.map((g) => [g.id, g]));

export type GoalPack = { id: string; name: string; emoji: string; desc: string; goalIds: string[] };

export const PACKS: GoalPack[] = [
  { id: "primeiros-passos", name: "Primeiros passos", emoji: "🌱", desc: "Poucas metas fáceis para pegar o ritmo", goalIds: ["agua", "leitura", "passos", "dormir"] },
  { id: "dev", name: "Rotina de dev", emoji: "💻", desc: "Código, inglês e foco sem descuidar do corpo", goalIds: ["programacao", "ingles", "foco", "treinar", "dormir"] },
  { id: "saude", name: "Saúde em dia", emoji: "💪", desc: "Treino, alimentação e sono no lugar", goalIds: ["treinar", "passos", "agua", "proteina", "dormir"] },
  { id: "estudos", name: "Foco nos estudos", emoji: "🎓", desc: "Para semestre, prova ou concurso", goalIds: ["faculdade", "revisar", "leitura", "sem-tela", "dormir"] },
  { id: "mente-leve", name: "Mente leve", emoji: "🧘", desc: "Menos tela, mais pausa", goalIds: ["meditar", "diario", "sol", "redes", "deitar"] },
];

export function catalogToGoalIn(g: CatalogGoal): Omit<Goal, "id" | "archived_at"> {
  return { name: g.name, category: g.category, weight: g.weight, days_of_week: [...g.days] };
}
