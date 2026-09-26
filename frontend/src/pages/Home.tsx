import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Flame, Star, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import DayRow, { MissedRangeRow, MissedRow, PendingRow } from "@/components/DayRow";
import DayDetailModal from "@/components/DayDetailModal";
import Onboarding from "@/components/Onboarding";
import RemindBanner from "@/components/RemindBanner";
import Sparkline from "@/components/Sparkline";
import {
  dateRangeDesc,
  formatDate,
  formatScore,
  isoDaysAgo,
  todayISO,
  toLocalDateString,
  variation,
  weekdayShort,
} from "@/lib/format";
import { useDayLogs, useGoals, useMe, useStats } from "@/lib/queries";
import type { DayLog, Goal, Stats } from "@/lib/types";

const REMINDER_KEY = (userId: string, date: string) => `dayup:reminder-dismissed:${userId}:${date}`;

type CalendarRow =
  | { kind: "day"; date: string }
  | { kind: "gap"; date: string; oldest: string; count: number };

// UTC aqui representa datas civis, sem variações de duração por horário de verão.
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function calendarRows(storedDates: string[], oldest: string | undefined, today: string, yesterday: string): CalendarRow[] {
  if (!oldest || oldest > today) return [];
  const anchors = [...new Set([today, yesterday, ...storedDates])]
    .filter((date) => date >= oldest && date <= today)
    .sort().reverse();
  const rows: CalendarRow[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const date = anchors[i];
    rows.push({ kind: "day", date });
    const newestGap = shiftDate(date, -1);
    const oldestGap = anchors[i + 1] ? shiftDate(anchors[i + 1], 1) : oldest;
    const count = (Date.parse(`${newestGap}T00:00:00Z`) - Date.parse(`${oldestGap}T00:00:00Z`)) / 86_400_000 + 1;
    if (count >= 3) rows.push({ kind: "gap", date: newestGap, oldest: oldestGap, count });
    else if (count > 0) {
      for (const missing of dateRangeDesc(oldestGap, newestGap)) rows.push({ kind: "day", date: missing });
    }
  }
  return rows;
}

export default function Home() {
  const me = useMe();
  const stats = useStats();
  const logs = useDayLogs(14);
  const goals = useGoals({ includeArchived: true });

  const [selected, setSelected] = useState<DayLog | null>(null);

  const goalsById = useMemo(() => {
    const m = new Map<string, Goal>();
    (goals.data ?? []).forEach((g) => m.set(g.id, g));
    return m;
  }, [goals.data]);

  const today = todayISO();
  const yesterday = isoDaysAgo(1);
  const handle = me.data?.name ?? "";

  // Todas as páginas carregadas até agora, e a data mais antiga que já vimos —
  // o histórico só sintetiza dias "sem registro" dentro dessa janela conhecida.
  const allLogs = useMemo(() => (logs.data?.pages ?? []).flat(), [logs.data]);
  const storedByDate = useMemo(() => {
    const m = new Map<string, DayLog>();
    allLogs.forEach((l) => m.set(l.date, l));
    return m;
  }, [allLogs]);
  const oldestLoadedDate = allLogs.length > 0 ? allLogs[allLogs.length - 1].date : undefined;
  const createdLocalDate = me.data ? toLocalDateString(new Date(me.data.created_at)) : undefined;
  // Se ainda há mais páginas pra carregar, só sabemos com certeza que não há
  // lacunas até a data mais antiga já buscada. Se acabou o histórico, dá pra
  // sintetizar até a criação da conta, preservando registros anteriores a ela.
  const oldestBoundary = logs.hasNextPage ? oldestLoadedDate :
    createdLocalDate && oldestLoadedDate ?
      (createdLocalDate < oldestLoadedDate ? createdLocalDate : oldestLoadedDate) :
      (createdLocalDate ?? oldestLoadedDate);
  // Uma lacuna vira um intervalo; não percorremos todos os dias de contas antigas.
  const calendar = useMemo(
    () => calendarRows([...storedByDate.keys()], oldestBoundary, today, yesterday),
    [storedByDate, oldestBoundary, today, yesterday],
  );

  const todayLog = storedByDate.get(today);

  // Onboarding: aparece enquanto a conta não tiver dispensado (onboarding_seen).
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!me.data) return;
    setShowOnboarding(!me.data.onboarding_seen);
  }, [me.data]);

  // Banner de lembrete: após 18h, dia não fechado (nem finalizado nem day off),
  // não dispensado hoje por este usuário.
  const todayClosed = !!todayLog && (todayLog.finalized || todayLog.status === "day_off");
  const userId = me.data?.id;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    setBannerDismissed(localStorage.getItem(REMINDER_KEY(userId, today)) === "1");
  }, [userId, today]);

  function dismissReminder() {
    if (!userId) return;
    localStorage.setItem(REMINDER_KEY(userId, today), "1");
    setBannerDismissed(true);
  }

  const showReminder = !!userId && new Date().getHours() >= 18 && !todayClosed && !bannerDismissed;

  const sparkSeries = allLogs
    .filter((l) => l.score !== null)
    .map((l) => l.score as number)
    .reverse()
    .slice(-8);

  return (
    <div className="px-4 lg:px-7 py-5 lg:py-8 max-w-[1180px] mx-auto">
      {/* Greet */}
      <header className="px-1 pb-3">
        <div className="text-[12px] uppercase tracking-[0.08em] text-muted">
          Olá, {handle}
        </div>
        <h1 className="display text-[28px] sm:text-[32px] lg:text-[38px] mt-1 leading-tight">
          Como foi seu <span className="text-primary">dia</span>?
        </h1>
      </header>

      {/* Lembrete pós-18h pra fechar o dia */}
      {showReminder && <RemindBanner onDismiss={dismissReminder} />}

      {/* KPIs */}
      <Kpis stats={stats.data} sparkSeries={sparkSeries} />

      {/* Section heading */}
      <div className="flex items-baseline justify-between px-1 pt-6 pb-2">
        <h2 className="display text-[22px] leading-none">Histórico</h2>
        <span className="text-xs text-muted">{allLogs.length} registrados</span>
      </div>

      {/* Hoje no topo; lacunas longas ficam recolhidas. */}
      <div className="flex flex-col gap-2">
        {logs.isLoading && <SkeletonRows />}

        {!logs.isLoading && calendar.length === 0 && <Empty />}

        {calendar.map((row) => {
          const { date } = row;
          if (row.kind === "gap") {
            return <MissedRangeRow key={date} oldest={row.oldest} newest={date} count={row.count} />;
          }
          const stored = storedByDate.get(date);
          const isToday = date === today;

          if (stored) {
            return (
              <DayRow
                key={date}
                log={stored}
                goalsById={goalsById}
                isToday={isToday}
                href={isToday ? "/app/check-in" : undefined}
                onSelect={isToday ? undefined : () => setSelected(stored)}
              />
            );
          }
          if (isToday) return <TodayPrompt key={date} />;
          if (date === yesterday) return <PendingRow key={date} date={date} />;
          return <MissedRow key={date} date={date} />;
        })}
      </div>

      {logs.hasNextPage && (
        <button
          type="button"
          onClick={() => logs.fetchNextPage()}
          disabled={logs.isFetchingNextPage}
          className="btn w-full mt-3"
        >
          {logs.isFetchingNextPage ? "Carregando…" : "Carregar dias anteriores"}
        </button>
      )}

      {selected && (
        <DayDetailModal
          log={selected}
          goalsById={goalsById}
          onClose={() => setSelected(null)}
        />
      )}

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

function Kpis({ stats, sparkSeries }: { stats: Stats | undefined; sparkSeries: number[] }) {
  const streak = stats?.streak ?? { current: 0, record: 0 };
  const v = variation(stats?.score_last_14 ?? 0, stats?.score_prev_14 ?? 0);
  const hasPrevWindow = (stats?.scored_days_prev_14 ?? 0) > 0;
  const isRecordBeaten = streak.current > 0 && streak.current > streak.record;
  const isRecordTied = streak.current > 0 && streak.current === streak.record;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        featured
        label="Streak"
        glyph={<Flame size={14} />}
        value={
          <>
            {streak.current}
            <span className="display-unit">dias</span>
          </>
        }
        sub={
          isRecordBeaten ? (
            <span className="text-primary font-semibold">Novo recorde</span>
          ) : isRecordTied ? (
            <span className="text-primary font-semibold">Empate de recorde</span>
          ) : (
            <span>Recorde {streak.record}d</span>
          )
        }
      />
      <Kpi
        label="Consistência"
        glyph={<CalendarDays size={14} />}
        value={
          <>
            {(stats?.consistency ?? 0).toFixed(0)}
            <span className="display-unit">%</span>
          </>
        }
        sub={<span>Desde o início</span>}
      />
      <Kpi
        label="Score médio"
        glyph={<Star size={14} />}
        value={<>{formatScore(stats?.average_score ?? 0)}</>}
        sub={<span>Geral</span>}
        spark={sparkSeries.length >= 2 ? <Sparkline data={sparkSeries} color="#6aa7e8" /> : null}
      />
      <Kpi
        label="Score 14d"
        glyph={<TrendingUp size={14} />}
        value={<>{formatScore(stats?.score_last_14 ?? 0)}</>}
        sub={
          !hasPrevWindow ? (
            <span>—</span>
          ) : (
            <span className={v.delta > 0 ? "text-good" : v.delta < 0 ? "text-rough" : "text-muted"}>
              {v.symbol} {Math.abs(v.delta).toFixed(1)} vs anterior
            </span>
          )
        }
        spark={sparkSeries.length >= 2 ? <Sparkline data={sparkSeries} color="#f0a868" /> : null}
      />
    </div>
  );
}

function TodayPrompt() {
  const today = todayISO();
  return (
    <Link
      to="/app/check-in"
      className="relative grid grid-cols-[6px_1fr_auto] rounded-card overflow-hidden border transition-all hover:-translate-y-px"
      style={{
        background:
          "radial-gradient(120% 200% at 0% 0%, rgba(245,181,40,0.18), transparent 60%), linear-gradient(180deg, #1e170e, #16110a)",
        borderColor: "rgba(245,181,40,0.4)",
        boxShadow: "0 8px 24px -10px rgba(245,181,40,0.4)",
      }}
    >
      <span style={{ background: "#f5b528" }} />
      <div className="p-3.5 flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <div className="display text-base lg:text-[16px] uppercase leading-none text-primary">
            Registrar hoje
          </div>
          <span className="chip-today">HOJE</span>
        </div>
        <div className="text-xs text-text-2">
          {formatDate(today)} <span className="text-muted">· {weekdayShort(today)}</span>
        </div>
        <div className="text-[11px] text-muted">
          Marque o nível de cada meta — leva menos de 30s.
        </div>
      </div>
      <div className="flex items-center pr-4">
        <span
          className="grid place-items-center w-11 h-11 rounded-full text-ink"
          style={{
            background: "#f5b528",
            boxShadow: "0 8px 24px -10px rgba(245,181,40,0.6)",
          }}
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

type KpiProps = {
  featured?: boolean;
  label: string;
  glyph: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  spark?: ReactNode;
};

function Kpi({ featured, label, glyph, value, sub, spark }: KpiProps) {
  return (
    <div
      className="relative overflow-hidden rounded-card border p-4"
      style={{
        background: featured
          ? "radial-gradient(80% 120% at 100% 0%, rgba(245,181,40,0.16), transparent 60%), linear-gradient(180deg, #1e170e, #16110a)"
          : "linear-gradient(180deg, #1e170e, #16110a)",
        borderColor: featured ? "rgba(245,181,40,0.35)" : "#2a1f12",
      }}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
        <span>{label}</span>
        <span className="text-muted">{glyph}</span>
      </div>
      <div className="display text-[32px] lg:text-[36px] leading-none mt-2.5 flex items-baseline gap-1.5 nums">
        {value}
      </div>
      <div className="text-[11px] text-text-2 mt-1.5 flex justify-between nums">{sub}</div>
      {spark && <div className="h-7 mt-2">{spark}</div>}
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="surface-raised rounded-card h-20 animate-pulse" />
      ))}
    </>
  );
}

function Empty() {
  return (
    <div className="surface rounded-card p-8 text-center">
      <p className="display text-lg">Nada por aqui ainda.</p>
      <p className="text-text-2 text-sm mt-1">
        Registre seu primeiro dia para começar a construir histórico.
      </p>
    </div>
  );
}
