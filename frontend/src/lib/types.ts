export type GoalCategory = "health" | "study" | "wellness" | "food" | "sleep";
export type DayStatus = "registered" | "day_off" | "missed";
export type GoalLevel = 0 | 0.4 | 0.7 | 1;

export interface User {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  onboarding_seen: boolean;
  created_at: string;
}

export interface Goal {
  id: string;
  name: string;
  category: GoalCategory;
  weight: 1 | 2 | 3;
  days_of_week: number[];
  archived_at: string | null;
}

export interface GoalEntry {
  goal_id: string;
  weight: number;
  level: number;
  done_at: string | null; // "HH:MM:SS"
}

export interface DayLog {
  id: string | null;
  date: string; // YYYY-MM-DD
  status: DayStatus;
  score: number | null;
  mood: string | null;
  note: string | null;
  finalized: boolean;
  entries: GoalEntry[];
}

export interface Stats {
  streak: { current: number; record: number };
  consistency: number;
  average_score: number;
  score_last_14: number;
  score_prev_14: number;
  scored_days_last_14: number;
  scored_days_prev_14: number;
}

export interface ExportData {
  exported_at: string;
  user: { id: string; email: string; name: string; created_at: string };
  goals: Goal[];
  day_logs: DayLog[];
}

// ── Category visual mapping ──────────────────────────
export const CATEGORY_META: Record<
  GoalCategory,
  { label: string; emoji: string; color: string }
> = {
  health: { label: "Saúde", emoji: "🍎", color: "#8ad36b" },
  study: { label: "Estudo", emoji: "📚", color: "#6aa7e8" },
  wellness: { label: "Bem-estar", emoji: "🧘", color: "#c084e8" },
  food: { label: "Alimentação", emoji: "🥗", color: "#f0a868" },
  sleep: { label: "Sono", emoji: "💤", color: "#8aa3e8" },
};

export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ── Mood (seletor da tela Hoje) ──────────────────────
export const MOODS = ["😄", "🙂", "😐", "😞", "😫"] as const;

// ── Effort levels (gesto principal do check-in) ──────
export type EffortTone = "miss" | "weak" | "mid" | "perfect";

export const LEVEL_OPTIONS: {
  value: GoalLevel;
  label: string;
  hint: string;
  emoji: string;
  tone: EffortTone;
  color: string;
}[] = [
  { value: 0, label: "Não feito", hint: "0%", emoji: "❌", tone: "miss", color: "#9c8a6e" },
  { value: 0.4, label: "Fraca", hint: "40%", emoji: "🟡", tone: "weak", color: "#c68410" },
  { value: 0.7, label: "Média", hint: "70%", emoji: "🟠", tone: "mid", color: "#f5b528" },
  { value: 1, label: "Perfeito", hint: "100%", emoji: "🟢", tone: "perfect", color: "#8ad36b" },
];

// ── Peso da meta (pílula) ────────────────────────────
export const WEIGHT_META: Record<1 | 2 | 3, { label: string; pips: number }> = {
  3: { label: "Alta", pips: 3 },
  2: { label: "Média", pips: 2 },
  1: { label: "Baixa", pips: 1 },
};

// ── Tier helpers (match-history style) ───────────────
export type Tier = "perfect" | "great" | "good" | "okay" | "rough";

export function tierFromScore(score: number | null): Tier | null {
  if (score === null) return null;
  if (score >= 100) return "perfect";
  if (score >= 85) return "great";
  if (score >= 65) return "good";
  if (score >= 45) return "okay";
  return "rough";
}

export const TIER_META: Record<Tier, { label: string; color: string; bgSoft: string }> = {
  perfect: { label: "Perfeito",  color: "#f5b528", bgSoft: "rgba(245,181,40,0.14)" },
  great:   { label: "Excelente", color: "#f5b528", bgSoft: "rgba(245,181,40,0.12)" },
  good:    { label: "Bom dia",   color: "#8ad36b", bgSoft: "rgba(138,211,107,0.10)" },
  okay:    { label: "Regular",   color: "#6aa7e8", bgSoft: "rgba(106,167,232,0.10)" },
  rough:   { label: "Difícil",   color: "#e87a6a", bgSoft: "rgba(232,122,106,0.10)" },
};

// ── Preset library (frontend-only seeds) ─────────────
export type Preset = { name: string; emoji: string; desc: string; category: GoalCategory };
export const PRESETS: Preset[] = [
  // Saúde
  { name: "Beber 2L de água", emoji: "💧", desc: "A base de tudo", category: "health" },
  { name: "Comer 3 frutas", emoji: "🍎", desc: "Vitamina natural", category: "health" },
  { name: "Tomar vitaminas", emoji: "💊", desc: "Suplementação diária", category: "health" },
  { name: "Sem refrigerante", emoji: "🚫", desc: "Adeus açúcar", category: "health" },
  // Estudo
  { name: "Ler 30 minutos", emoji: "📖", desc: "Livro físico de preferência", category: "study" },
  { name: "Curso online", emoji: "🎓", desc: "1 aula por dia", category: "study" },
  { name: "Estudar idioma", emoji: "🗣", desc: "20 min de prática", category: "study" },
  // Bem-estar
  { name: "Meditar 10min", emoji: "🧘", desc: "Foco e respiração", category: "wellness" },
  { name: "Diário do dia", emoji: "✍", desc: "3 frases bastam", category: "wellness" },
  { name: "3 gratidões", emoji: "🙏", desc: "Antes de dormir", category: "wellness" },
  { name: "Treino 45min", emoji: "🏋", desc: "Cardio + força", category: "wellness" },
  // Alimentação
  { name: "Comer 5 porções de vegetais", emoji: "🥗", desc: "Variedade colorida", category: "food" },
  { name: "Sem ultra-processados", emoji: "🍔", desc: "Comida de verdade", category: "food" },
  // Sono
  { name: "Dormir 8 horas", emoji: "🌙", desc: "Recuperação total", category: "sleep" },
  { name: "Sem celular no quarto", emoji: "🛌", desc: "Dormir melhor", category: "sleep" },
];
