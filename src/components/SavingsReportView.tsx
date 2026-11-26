import React, {useMemo} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Download, TrendingUp} from 'lucide-react';
import type {AlertNotification, MonthlySavingsEntry} from '../types.ts';
import {formatBRL, formatDateTime} from '../utils/format.ts';

interface SavingsReportViewProps {
  monthlySavings: MonthlySavingsEntry[];
  alerts: AlertNotification[];
}

export const SavingsReportView: React.FC<SavingsReportViewProps> = ({
  monthlySavings,
  alerts,
}) => {
  const totals = useMemo(() => {
    const totalSaved = monthlySavings.reduce((s, m) => s + m.savedTotal, 0);
    const totalDeals = monthlySavings.reduce((s, m) => s + m.dealsPurchased, 0);
    const totalAlerts = monthlySavings.reduce((s, m) => s + m.alertsTriggered, 0);
    const avgDiscount =
      monthlySavings.length > 0
        ? monthlySavings.reduce((s, m) => s + m.avgDiscount, 0) / monthlySavings.length
        : 0;
    const latestMonth = monthlySavings[monthlySavings.length - 1];
    return {totalSaved, totalDeals, totalAlerts, avgDiscount, latestMonth};
  }, [monthlySavings]);

  const purchasedAlerts = useMemo(() => alerts.filter((a) => a.purchased), [alerts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Relatórios Mensais de Economia
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Acompanhe quanto você economizou comprando abaixo da média histórica através dos alertas do Mega Achados 027.
          </p>
        </div>

        <a
          href="/api/savings/export"
          download="mega-achados-027-economia-mensal.csv"
          className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Baixar Relatório CSV</span>
        </a>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Economia Acumulada (6 meses)</p>
          <p className="mt-1.5 text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
            {formatBRL(totals.totalSaved)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Mês Atual ({totals.latestMonth?.label || '—'})
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
            {formatBRL(totals.latestMonth?.savedTotal || 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ofertas Aproveitadas</p>
          <p className="mt-1.5 text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
            {totals.totalDeals}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
            em {totals.totalAlerts} alertas disparados
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Desconto Médio Obtido</p>
          <p className="mt-1.5 text-2xl font-bold font-mono-num text-red-600 dark:text-red-400">
            {totals.avgDiscount.toFixed(1).replace('.', ',')}%
          </p>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              Evolução Mensal da Economia Gerada (R$)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Diferença entre preço médio de mercado e valor efetivamente pago nas ofertas
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-amber-600 dark:text-yellow-400 shrink-0" />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlySavings} margin={{top: 8, right: 12, left: 4, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.16)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{fontSize: 12, fill: '#71717A'}}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{fontSize: 11, fill: '#71717A'}}
                axisLine={false}
                tickLine={false}
                width={68}
                tickFormatter={(v: number) => `R$ ${v}`}
              />
              <Tooltip
                cursor={{fill: 'rgba(250, 204, 21, 0.08)'}}
                content={({active, payload}) => {
                  if (!active || !payload || !payload[0]) return null;
                  const entry = payload[0].payload as MonthlySavingsEntry;
                  return (
                    <div className="rounded-xl bg-[#07070A] text-white px-3.5 py-2.5 shadow-xl border border-zinc-800 text-xs">
                      <p className="font-semibold text-zinc-200">
                        {entry.label} ({entry.monthKey})
                      </p>
                      <p className="mt-1 text-base font-bold font-mono-num text-yellow-400">
                        {formatBRL(entry.savedTotal)}
                      </p>
                      <p className="mt-1 text-zinc-400">
                        {entry.dealsPurchased} compras · {entry.avgDiscount.toFixed(1).replace('.', ',')}% desc. médio
                      </p>
                      <p className="text-zinc-400">Melhor loja: {entry.topStore}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="savedTotal" fill="#FACC15" radius={[8, 8, 0, 0]} maxBarSize={52} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Table + Realized Purchases */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              Detalhamento Mensal
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0B0C10] text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  <th className="py-3 pl-5 pr-3">Mês</th>
                  <th className="py-3 px-3 text-right">Economia</th>
                  <th className="py-3 px-3 text-right">Compras</th>
                  <th className="py-3 px-3 text-right">Alertas</th>
                  <th className="py-3 px-3 text-right">Desc. Médio</th>
                  <th className="py-3 pl-3 pr-5">Destaque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {[...monthlySavings].reverse().map((m) => (
                  <tr key={m.monthKey} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="py-3 pl-5 pr-3 font-medium text-zinc-950 dark:text-white">
                      {m.label} · {m.monthKey}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num font-semibold text-amber-700 dark:text-yellow-400">
                      {formatBRL(m.savedTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num text-zinc-700 dark:text-zinc-300">
                      {m.dealsPurchased}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num text-zinc-500 dark:text-zinc-400">
                      {m.alertsTriggered}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num text-zinc-700 dark:text-zinc-300">
                      {m.avgDiscount.toFixed(1).replace('.', ',')}%
                    </td>
                    <td className="py-3 pl-3 pr-5 text-zinc-600 dark:text-zinc-300">
                      {m.topStore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              Compras Recentes Registradas
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Marque ofertas como compradas na aba Alertas para atualizar estes valores.
            </p>
          </div>
          {purchasedAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Nenhuma compra marcada nesta sessão ainda.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {purchasedAlerts.map((item) => (
                <div key={item.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-950 dark:text-white truncate">
                      {item.productName}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {item.storeName} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                      +{formatBRL(item.savedAmount)}
                    </p>
                    <p className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400">
                      Pago {formatBRL(item.newPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
