import React, { useState } from 'react';
import { ArrowRight, Download, TrendingDown, TrendingUp } from 'lucide-react';
import type { CocoaGrade, DashboardSummary } from '../types';
import { downloadCsv, formatDateThai, formatKg, formatThb } from '../lib/format';
import type { NavTab } from './Layout';

interface DashboardViewProps {
  summary: DashboardSummary;
  onNavigate: (tab: NavTab) => void;
}

export function DashboardView({ summary, onNavigate }: DashboardViewProps) {
  const [batchFilter, setBatchFilter] = useState<'all' | 'completed' | 'fermenting'>('all');

  const filteredBatches = summary.batch_analytics.filter((b) => {
    if (batchFilter === 'all') return true;
    return b.status === batchFilter;
  });

  const netProfit = summary.totals.net_operating_profit;
  const isProfit = netProfit >= 0;

  const totalInventoryValue =
    summary.fresh_stock_value +
    summary.wet_stock_value +
    summary.fermenting_cost_value +
    summary.total_dried_stock_value;

  const abcDriedKg =
    summary.grade_stocks.A.remaining_kg +
    summary.grade_stocks.B.remaining_kg +
    summary.grade_stocks.C.remaining_kg;
  const abcDriedVal =
    summary.grade_stocks.A.stock_value +
    summary.grade_stocks.B.stock_value +
    summary.grade_stocks.C.stock_value;

  const handleExportBatchReport = () => {
    downloadCsv(
      'cacaoflow-batch-pnl-report.csv',
      [
        'รหัสรอบ',
        'วันที่เริ่ม',
        'วันที่เสร็จ',
        'สถานะ',
        'ผลสดที่ใช้ (กก.)',
        'เมล็ดสดรับซื้อที่ใช้ (กก.)',
        'เมล็ดหมักรวม (กก.)',
        'เกรด A (กก.)',
        'เกรด B (กก.)',
        'เกรด C (กก.)',
        'เกรด Bulk (กก.)',
        'แห้งรวมทั้งหมด (กก.)',
        'Yield (%)',
        'ต้นทุนรวมรอบ (บาท)',
        'ขายได้แล้ว (กก.)',
        'รายรับจากการขาย (บาท)',
        'กำไร/ขาดทุนจริง (บาท)',
      ],
      summary.batch_analytics.map((b) => [
        b.batch_code,
        b.started_date,
        b.completed_date ?? '-',
        b.status === 'completed' ? 'เสร็จสิ้น' : 'กำลังหมัก',
        b.fresh_used_kg,
        b.wet_purchased_used_kg,
        b.wet_bean_kg,
        b.grade_a_kg,
        b.grade_b_kg,
        b.grade_c_kg,
        b.bulk_loss_kg,
        b.dried_total_kg,
        b.yield_percent,
        b.total_cost,
        b.sold_kg,
        b.realized_revenue,
        b.realized_pnl,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Row: Financial & Inventory Snapshot */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#57534E]">กำไร/ขาดทุนสุทธิ (หักต้นทุน Bulk ค้างคลัง)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                isProfit ? 'text-[#15803D]' : 'text-[#DC2626]'
              }`}
            >
              {formatThb(netProfit, true)}
            </span>
            {isProfit ? (
              <TrendingUp className="w-4 h-4 text-[#15803D] shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-[#DC2626] shrink-0" />
            )}
          </div>
          <div className="mt-2 text-xs text-[#78716C] tabular-nums">
            กำไรขั้นต้นจากการขาย {formatThb(summary.totals.total_gross_profit)} · ทุน Bulk ค้าง{' '}
            {formatThb(summary.totals.unsold_bulk_value)}
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#57534E]">ยอดขายรวม (จ่ายสินค้าออก)</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#1C1917]">
            {formatThb(summary.totals.total_sales_revenue)}
          </div>
          <div className="mt-2 text-xs text-[#78716C] tabular-nums">
            จำหน่ายแล้ว {formatKg(summary.totals.total_sales_kg)} · ต้นทุนขาย{' '}
            {formatThb(summary.totals.total_cogs)}
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#57534E]">มูลค่าสต๊อกคงเหลือทั้งหมด</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#1C1917]">
            {formatThb(totalInventoryValue)}
          </div>
          <div className="mt-2 text-xs text-[#78716C] tabular-nums">
            ผลสด {formatKg(summary.fresh_stock_kg, 0)} · เมล็ดสด {formatKg(summary.wet_stock_kg, 0)} · แห้ง{' '}
            {formatKg(summary.total_dried_stock_kg, 0)}
          </div>
        </div>

        <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#57534E]">สต๊อกเกรด Bulk (ตกเกรดหลังตากแห้ง)</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#DC2626]">
            {formatKg(summary.grade_stocks.BULK.remaining_kg)}
          </div>
          <div className="mt-2 text-xs text-[#78716C] tabular-nums">
            ต้นทุนจมใน Bulk ค้างคลัง {formatThb(summary.grade_stocks.BULK.stock_value)}
          </div>
        </div>
      </section>

      {/* Real-time Production Pipeline Flow */}
      <section className="bg-white border border-[#E5E5E0] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#E5E5E0]">
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">สายพานสต๊อกโรงงานแบบเรียลไทม์</h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              รับเข้าผลสด & เมล็ดสด · เบิกตัดยอดเข้าหมัก · ตากแห้งและคัดเกรดเข้าสต๊อก (เกรด A, B, C และ Bulk)
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-stretch">
          <button
            type="button"
            onClick={() => onNavigate('purchases')}
            className="text-left p-4 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] hover:border-[#9A4A18]/50 transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs text-[#57534E]">
              <span>1. วัตถุดิบสด (ผลสด / เมล็ดสด)</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#78716C]" />
            </div>
            <div className="mt-2 space-y-0.5">
              <div className="text-lg font-bold font-mono tabular-nums text-[#1C1917]">
                ผล {formatKg(summary.fresh_stock_kg, 0)} · เมล็ด {formatKg(summary.wet_stock_kg, 0)}
              </div>
            </div>
            <div className="mt-1 text-xs text-[#78716C] font-mono tabular-nums">
              มูลค่ารวม {formatThb(summary.fresh_stock_value + summary.wet_stock_value)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('processing')}
            className="text-left p-4 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] hover:border-[#9A4A18]/50 transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs text-[#57534E]">
              <span>2. กำลังหมัก / เตรียมตาก</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#78716C]" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-[#B45309]">
              {formatKg(summary.fermenting_wet_kg)}
            </div>
            <div className="mt-1 text-xs text-[#78716C] font-mono tabular-nums">
              {summary.fermenting_batch_count} รอบกำลังหมัก · ทุน {formatThb(summary.fermenting_cost_value)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="text-left p-4 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] hover:border-[#9A4A18]/50 transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs text-[#57534E]">
              <span>3. โกโก้แห้งคัดเกรด (A/B/C)</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#78716C]" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-[#15803D]">
              {formatKg(abcDriedKg)}
            </div>
            <div className="mt-1 text-xs text-[#78716C] font-mono tabular-nums">
              มูลค่าทุนคงคลัง {formatThb(abcDriedVal)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="text-left p-4 rounded-lg bg-[#FEF2F2]/60 border border-[#FECACA] hover:border-[#DC2626] transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs font-medium text-[#991B1B]">
              <span>4. สต๊อกเกรด Bulk (ตากแห้งแล้ว)</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#DC2626]" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono tabular-nums text-[#DC2626]">
              {formatKg(summary.grade_stocks.BULK.remaining_kg)}
            </div>
            <div className="mt-1 text-xs text-[#991B1B] font-mono tabular-nums">
              ผลิตสะสม {formatKg(summary.totals.total_bulk_loss_kg)} · ทุนค้าง {formatThb(summary.grade_stocks.BULK.stock_value)}
            </div>
          </button>
        </div>
      </section>

      {/* Dried Stock Breakdown by Grade A / B / C / BULK */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['A', 'B', 'C', 'BULK'] as CocoaGrade[]).map((grade) => {
          const g = summary.grade_stocks[grade];
          const gradeMeta: Record<CocoaGrade, { title: string; badge: string; desc: string; accent: string; cardCls: string }> = {
            A: {
              title: 'โกโก้แห้ง เกรด A',
              badge: 'เกรด A',
              desc: 'เมล็ดสมบูรณ์ กลิ่นหมักดีเยี่ยม พรีเมียม',
              accent: 'text-[#15803D]',
              cardCls: 'bg-white border-[#E5E5E0]',
            },
            B: {
              title: 'โกโก้แห้ง เกรด B',
              badge: 'เกรด B',
              desc: 'เมล็ดมาตรฐาน คัดแยกหลังตากแห้ง',
              accent: 'text-[#B45309]',
              cardCls: 'bg-white border-[#E5E5E0]',
            },
            C: {
              title: 'โกโก้แห้ง เกรด C',
              badge: 'เกรด C',
              desc: 'เมล็ดเล็กหรือแตกหัก เหมาะแปรรูปต่อ',
              accent: 'text-[#475569]',
              cardCls: 'bg-white border-[#E5E5E0]',
            },
            BULK: {
              title: 'โกโก้แห้ง เกรด Bulk',
              badge: 'เกรด Bulk',
              desc: 'ปัดจากเมล็ดหมักตกเกรด (พร้อมตัดขาย/ตัดทิ้ง)',
              accent: 'text-[#DC2626]',
              cardCls: 'bg-[#FEF2F2]/40 border-[#FECACA]',
            },
          };
          const m = gradeMeta[grade];
          return (
            <div key={grade} className={`border rounded-xl p-5 ${m.cardCls}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1C1917]">{m.title}</h3>
                <span className={`font-mono text-xs font-semibold ${m.accent}`}>{m.badge}</span>
              </div>
              <p className="text-xs text-[#78716C] mt-1">{m.desc}</p>
              <div className="mt-4 pt-3 border-t border-[#E5E5E0] flex items-end justify-between">
                <div>
                  <div className="text-xs text-[#57534E]">คงเหลือในคลัง</div>
                  <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${m.accent}`}>
                    {formatKg(g.remaining_kg)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#57534E]">ต้นทุนเฉลี่ย</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#1C1917] mt-0.5">
                    {formatThb(g.avg_cost_per_kg)}/กก.
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Batch-by-Batch Cost vs Profit & Loss Table */}
      <section className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#E5E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">
              รายงานต้นทุนเทียบกำไร-ขาดทุนในแต่ละรอบแปรรูป
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              แสดงผลสดที่ใช้ · ผลผลิตแห้งแยกเกรด A / B / C / Bulk · ต้นทุนรวม · รายรับขายจริง และกำไร/ขาดทุนสุทธิ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#F3F3EE] rounded-lg">
              {(
                [
                  { id: 'all', label: 'ทุกรอบ' },
                  { id: 'completed', label: 'คัดเกรดแล้ว' },
                  { id: 'fermenting', label: 'กำลังหมัก' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBatchFilter(tab.id)}
                  className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    batchFilter === tab.id
                      ? 'bg-white text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportBatchReport}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#E5E5E0] bg-white hover:bg-[#F3F3EE] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ส่งออก CSV</span>
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3F3EE] border-b border-[#E5E5E0] text-xs font-semibold text-[#57534E]">
                <th className="py-3 px-4">รหัสรอบ / วันที่</th>
                <th className="py-3 px-4 text-right">ผลสดใช้</th>
                <th className="py-3 px-4 text-right">ผลผลิตแห้ง (A / B / C)</th>
                <th className="py-3 px-4 text-right">เกรด Bulk</th>
                <th className="py-3 px-4 text-right">ต้นทุนรวมรอบ</th>
                <th className="py-3 px-4 text-right">รายรับขายแล้ว</th>
                <th className="py-3 px-4 text-right">คงเหลือในคลัง</th>
                <th className="py-3 px-4 text-right">กำไร/ขาดทุนสุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0] text-sm">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-[#78716C]">
                    ยังไม่มีข้อมูลรอบการผลิตในหมวดหมู่นี้
                  </td>
                </tr>
              ) : (
                filteredBatches.map((b) => {
                  const remTotal =
                    b.remaining_a_kg + b.remaining_b_kg + b.remaining_c_kg + b.remaining_bulk_kg;
                  return (
                    <tr key={b.id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-semibold text-xs text-[#1C1917]">
                          {b.batch_code}
                        </div>
                        <div className="text-xs text-[#78716C] mt-0.5">
                          {formatDateThai(b.started_date)} ·{' '}
                          <span
                            className={
                              b.status === 'completed' ? 'text-[#15803D] font-medium' : 'text-[#B45309] font-medium'
                            }
                          >
                            {b.status === 'completed' ? 'ตากแห้งแล้ว' : 'กำลังหมัก'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div>{formatKg(b.fresh_used_kg, 0)}</div>
                        <div className="text-xs text-[#78716C]">เมล็ดหมัก {formatKg(b.wet_bean_kg, 0)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {b.status === 'completed' ? (
                          <>
                            <div className="font-semibold text-[#1C1917]">
                              {formatKg(b.grade_a_kg + b.grade_b_kg + b.grade_c_kg)} ({b.yield_percent}%)
                            </div>
                            <div className="text-xs text-[#57534E]">
                              A:{b.grade_a_kg} / B:{b.grade_b_kg} / C:{b.grade_c_kg}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-[#78716C]">รอคัดเกรด</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {b.bulk_loss_kg > 0 ? (
                          <>
                            <div className="text-[#DC2626] font-medium">{formatKg(b.bulk_loss_kg)}</div>
                            <div className="text-xs text-[#78716C]">ค้าง {b.remaining_bulk_kg} กก.</div>
                          </>
                        ) : (
                          <span className="text-xs text-[#78716C]">0 กก.</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#1C1917]">
                        {formatThb(b.total_cost)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="text-[#1C1917] font-medium">{formatThb(b.realized_revenue)}</div>
                        <div className="text-xs text-[#78716C]">ขายแล้ว {formatKg(b.sold_kg, 0)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {b.status === 'completed' ? (
                          <>
                            <div>{formatKg(remTotal)}</div>
                            <div className="text-xs text-[#78716C]">ทุน {formatThb(b.remaining_stock_value)}</div>
                          </>
                        ) : (
                          <span className="text-xs text-[#B45309]">กำลังหมัก</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                        <span
                          className={
                            b.realized_pnl > 0
                              ? 'text-[#15803D]'
                              : b.realized_pnl < 0
                              ? 'text-[#DC2626]'
                              : 'text-[#57534E]'
                          }
                        >
                          {formatThb(b.realized_pnl, true)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Batch Cards */}
        <div className="md:hidden divide-y divide-[#E5E5E0]">
          {filteredBatches.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#78716C]">ยังไม่มีข้อมูลรอบการผลิต</div>
          ) : (
            filteredBatches.map((b) => (
              <div key={b.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-sm text-[#1C1917]">{b.batch_code}</div>
                    <div className="text-xs text-[#78716C]">
                      {formatDateThai(b.started_date)} ·{' '}
                      <span className={b.status === 'completed' ? 'text-[#15803D]' : 'text-[#B45309]'}>
                        {b.status === 'completed' ? 'ตากแห้งแล้ว' : 'กำลังหมัก'}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`font-mono font-bold text-sm tabular-nums ${
                      b.realized_pnl > 0
                        ? 'text-[#15803D]'
                        : b.realized_pnl < 0
                        ? 'text-[#DC2626]'
                        : 'text-[#57534E]'
                    }`}
                  >
                    {formatThb(b.realized_pnl, true)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F3F3EE] text-xs">
                  <div>
                    <div className="text-[#78716C]">ผลสด / แห้ง</div>
                    <div className="font-mono tabular-nums font-medium text-[#1C1917]">
                      {b.fresh_used_kg} / {b.dried_total_kg} กก.
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78716C]">เกรด Bulk</div>
                    <div className="font-mono tabular-nums font-medium text-[#DC2626]">
                      {b.bulk_loss_kg} กก.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#78716C]">ต้นทุน / ขายได้</div>
                    <div className="font-mono tabular-nums font-medium text-[#1C1917]">
                      {formatThb(b.total_cost)} / {formatThb(b.realized_revenue)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
