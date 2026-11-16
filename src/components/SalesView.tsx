import React, { useMemo, useState } from 'react';
import { Trash2, Truck } from 'lucide-react';
import type { BatchGradeLot, CocoaGrade, DashboardSummary, SalesDispatch } from '../types';
import { formatDateThai, formatKg, formatThb, todayIso } from '../lib/format';

interface SalesViewProps {
  sales: SalesDispatch[];
  gradeLots: BatchGradeLot[];
  summary: DashboardSummary;
  onCreateSale: (data: {
    dispatchDate: string;
    customerName: string;
    grade: CocoaGrade;
    weightKg: number;
    pricePerKg: number;
    preferredBatchId?: number;
    notes: string;
  }) => Promise<void>;
  onDeleteSale: (id: number) => Promise<void>;
}

export function SalesView({ sales, gradeLots, summary, onCreateSale, onDeleteSale }: SalesViewProps) {
  const [dispatchDate, setDispatchDate] = useState(todayIso());
  const [customerName, setCustomerName] = useState('');
  const [grade, setGrade] = useState<CocoaGrade>('A');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('FIFO');
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('295');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lotsForGrade = useMemo(
    () => gradeLots.filter((l) => l.grade === grade && l.remaining_kg > 0.001),
    [gradeLots, grade]
  );

  const activeLot =
    selectedBatchId !== 'FIFO'
      ? lotsForGrade.find((l) => String(l.batch_id) === selectedBatchId)
      : undefined;

  const selectedGradeStock = summary.grade_stocks[grade];
  const availableKg = activeLot ? activeLot.remaining_kg : selectedGradeStock.remaining_kg;
  const unitCostEstimate = activeLot ? activeLot.cost_per_kg : selectedGradeStock.avg_cost_per_kg;

  const reqWeight = Number(weightKg) || 0;
  const reqPrice = Number(pricePerKg) || 0;
  const insufficient = reqWeight > availableKg + 0.001;
  const estRevenue = reqWeight * reqPrice;
  const estCogs = reqWeight * unitCostEstimate;
  const estProfit = estRevenue - estCogs;

  const handleGradeSelect = (g: CocoaGrade) => {
    setGrade(g);
    setSelectedBatchId('FIFO');
    const defaultPrices: Record<CocoaGrade, string> = { A: '295', B: '215', C: '140', BULK: '0' };
    setPricePerKg(defaultPrices[g]);
    if (g === 'BULK' && !customerName) {
      setCustomerName('ตัดจำหน่าย / เคลียร์สต๊อก Bulk');
    } else if (g !== 'BULK' && customerName === 'ตัดจำหน่าย / เคลียร์สต๊อก Bulk') {
      setCustomerName('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (insufficient) return;
    setSubmitting(true);
    try {
      await onCreateSale({
        dispatchDate,
        customerName,
        grade,
        weightKg: reqWeight,
        pricePerKg: reqPrice,
        preferredBatchId: selectedBatchId !== 'FIFO' ? Number(selectedBatchId) : undefined,
        notes,
      });
      setWeightKg('');
      setNotes('');
      setSelectedBatchId('FIFO');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4 Grade Selector Cards (A, B, C, BULK) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['A', 'B', 'C', 'BULK'] as CocoaGrade[]).map((g) => {
          const st = summary.grade_stocks[g];
          const active = grade === g;
          const label = g === 'BULK' ? 'เกรด Bulk' : `เกรด ${g}`;
          return (
            <button
              key={g}
              type="button"
              onClick={() => handleGradeSelect(g)}
              className={`text-left p-3.5 sm:p-4 rounded-xl border transition-colors ${
                active
                  ? g === 'BULK'
                    ? 'bg-[#991B1B] text-white border-[#991B1B]'
                    : 'bg-[#291D16] text-white border-[#291D16]'
                  : g === 'BULK'
                  ? 'bg-[#FEF2F2]/50 text-[#1C1917] border-[#FECACA] hover:border-[#DC2626]'
                  : 'bg-white text-[#1C1917] border-[#E5E5E0] hover:border-[#9A4A18]/50'
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  active ? 'text-white/80' : g === 'BULK' ? 'text-[#991B1B]' : 'text-[#57534E]'
                }`}
              >
                สต๊อก{label}
              </div>
              <div className="text-base sm:text-xl font-bold font-mono tabular-nums mt-1">
                {formatKg(st.remaining_kg)}
              </div>
              <div
                className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                  active ? 'text-[#FDE68A]' : 'text-[#78716C]'
                }`}
              >
                ทุนเฉลี่ย {formatThb(st.avg_cost_per_kg)}/กก.
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Split: Dispatch Form + Sales History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-4 bg-white border border-[#E5E5E0] rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">
              จ่ายสินค้าออก ({grade === 'BULK' ? 'เกรด Bulk' : `เกรด ${grade}`})
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              ตัดสต๊อกตามเกรดที่คัดแยกไว้หลังตากแห้ง (เลือกล็อตเฉพาะรอบหรือตัด FIFO)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              เลือกล็อต/รอบผลิตที่จะตัดสต๊อก (เกรด {grade === 'BULK' ? 'Bulk' : grade})
            </label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs sm:text-sm font-mono"
            >
              <option value="FIFO">
                ตัดอัตโนมัติทุกรอบเรียงเก่าก่อน (FIFO · รวม {formatKg(selectedGradeStock.remaining_kg)})
              </option>
              {lotsForGrade.map((lot) => (
                <option key={lot.id} value={String(lot.batch_id)}>
                  {lot.batch_code} · คงเหลือ {lot.remaining_kg} กก. (ทุน {formatThb(lot.cost_per_kg)}/กก.)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">วันที่ส่งออก / ตัดจ่าย</label>
            <input
              type="date"
              required
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              {grade === 'BULK' ? 'ผู้รับซื้อ / เหตุผลการตัดจ่าย Bulk' : 'ชื่อลูกค้า / โรงคั่วผู้รับซื้อ'}
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={grade === 'BULK' ? 'เช่น คัดทิ้งทำปุ๋ย หรือ ขายเหมา' : 'เช่น บจก. คราฟท์ช็อกโกแลต'}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                น้ำหนักจ่ายออก (กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder={`ไม่เกิน ${availableKg}`}
                className={`w-full min-h-[44px] px-3 rounded-lg border bg-[#FAFAF8] text-sm font-mono tabular-nums ${
                  insufficient ? 'border-[#DC2626] text-[#DC2626]' : 'border-[#E5E5E0]'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                ราคาขาย (บาท/กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                inputMode="decimal"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          {grade === 'BULK' && availableKg > 0 && (
            <button
              type="button"
              onClick={() => {
                setWeightKg(String(availableKg));
                setPricePerKg('0');
                setCustomerName('ตัดทิ้งสูญเสีย (เกรด Bulk ขายไม่ได้)');
              }}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-medium text-[#991B1B] hover:bg-[#FEE2E2]"
            >
              กรอกด่วน: ตัดทิ้ง Bulk ทั้งล็อตที่เลือก (0 บาท = บันทึกขาดทุน)
            </button>
          )}

          {insufficient && (
            <p className="text-xs font-medium text-[#DC2626]">
              สต๊อก{activeLot ? `รอบ ${activeLot.batch_code}` : `เกรด ${grade}`} ไม่พอจ่าย (คงเหลือ{' '}
              {formatKg(availableKg)})
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">หมายเหตุการจัดส่ง</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น เลขพัสดุ / วิธีชำระเงิน"
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#57534E]">ยอดขายรวม</span>
              <span className="font-mono tabular-nums font-bold text-sm text-[#1C1917]">
                {formatThb(estRevenue)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#57534E]">ต้นทุนล็อตที่ตัด ({formatThb(unitCostEstimate)}/กก.)</span>
              <span className="font-mono tabular-nums text-[#57534E]">{formatThb(estCogs)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[#E5E5E0]">
              <span className="text-[#57534E]">กำไร / ขาดทุนรอบบิลนี้</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  estProfit >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
                }`}
              >
                {formatThb(estProfit, true)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || insufficient || availableKg <= 0}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-[#9A4A18] hover:bg-[#7C360D] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Truck className="w-4 h-4" />
            <span>
              {submitting
                ? 'กำลังตัดสต๊อก...'
                : `ยืนยันตัดจ่าย ${grade === 'BULK' ? 'เกรด Bulk' : `เกรด ${grade}`}`}
            </span>
          </button>
        </form>

        {/* Sales History List */}
        <div className="lg:col-span-8 space-y-4">
          {/* Available Graded Lots Overview */}
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[#1C1917]">
              สต๊อกคงเหลือแยกตามล็อตหลังตากแห้ง (เกรด {grade === 'BULK' ? 'Bulk' : grade})
            </h3>
            {lotsForGrade.length === 0 ? (
              <p className="text-xs text-[#78716C] mt-2">
                ไม่มีสต๊อกคงเหลือสำหรับเกรด {grade === 'BULK' ? 'Bulk' : grade}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {lotsForGrade.map((lot) => (
                  <button
                    key={lot.id}
                    type="button"
                    onClick={() => setSelectedBatchId(String(lot.batch_id))}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selectedBatchId === String(lot.batch_id)
                        ? 'border-[#9A4A18] bg-[#FFFBEB]/50'
                        : 'border-[#E5E5E0] bg-[#FAFAF8] hover:border-[#9A4A18]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#1C1917]">{lot.batch_code}</span>
                      <span className="font-mono text-xs font-semibold text-[#15803D]">
                        {formatKg(lot.remaining_kg)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#78716C] mt-1 font-mono">
                      เสร็จ {formatDateThai(lot.completed_date)} · ทุน {formatThb(lot.cost_per_kg)}/กก.
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#E5E5E0]">
              <h2 className="text-base font-semibold text-[#1C1917]">รายการจ่ายสินค้าออกล่าสุด</h2>
              <p className="text-xs text-[#57534E] mt-0.5 font-mono tabular-nums">
                ทั้งหมด {sales.length} รายการ · ยอดขายสะสม {formatThb(summary.totals.total_sales_revenue)}
              </p>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F3EE] border-b border-[#E5E5E0] text-xs font-semibold text-[#57534E]">
                    <th className="py-3 px-4">วันที่ / เลขที่</th>
                    <th className="py-3 px-4">ลูกค้า / ล็อตที่ตัดสต๊อก</th>
                    <th className="py-3 px-4 text-right">เกรด · น้ำหนัก</th>
                    <th className="py-3 px-4 text-right">ยอดขาย</th>
                    <th className="py-3 px-4 text-right">กำไร/ขาดทุน</th>
                    <th className="py-3 px-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E0] text-sm">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-[#78716C]">
                        ยังไม่มีประวัติการจ่ายสินค้าออกจำหน่าย
                      </td>
                    </tr>
                  ) : (
                    sales.map((s) => (
                      <tr key={s.id} className="hover:bg-[#FAFAF8]">
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{formatDateThai(s.dispatch_date)}</div>
                          <div className="text-xs font-mono text-[#78716C]">{s.dispatch_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{s.customer_name}</div>
                          <div className="text-xs text-[#78716C] font-mono">
                            ตัดจาก:{' '}
                            {s.batch_allocations.map((a) => `${a.batch_code} (${a.kg} กก.)`).join(', ')}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <div
                            className={`font-semibold ${
                              s.grade === 'BULK' ? 'text-[#DC2626]' : 'text-[#1C1917]'
                            }`}
                          >
                            เกรด {s.grade === 'BULK' ? 'Bulk' : s.grade} · {formatKg(s.weight_kg)}
                          </div>
                          <div className="text-xs text-[#78716C]">{formatThb(s.price_per_kg)}/กก.</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#1C1917]">
                          {formatThb(s.total_revenue)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          <span className={s.gross_profit >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'}>
                            {formatThb(s.gross_profit, true)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteSale(s.id)}
                            title="ยกเลิกรายการและคืนสต๊อก"
                            aria-label={`ยกเลิกรายการ ${s.dispatch_code}`}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#78716C] hover:text-[#DC2626] hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-[#E5E5E0]">
              {sales.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#78716C]">ยังไม่มีประวัติการจำหน่าย</div>
              ) : (
                sales.map((s) => (
                  <div key={s.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-[#1C1917] truncate">{s.customer_name}</div>
                      <div className="text-xs text-[#78716C] mt-0.5 font-mono">
                        {formatDateThai(s.dispatch_date)} · เกรด {s.grade === 'BULK' ? 'Bulk' : s.grade} ·{' '}
                        {formatKg(s.weight_kg)}
                      </div>
                      <div className="text-[11px] text-[#78716C] font-mono mt-0.5">
                        {s.batch_allocations.map((a) => `${a.batch_code}`).join(', ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums font-semibold text-sm text-[#1C1917]">
                        {formatThb(s.total_revenue)}
                      </div>
                      <div
                        className={`font-mono tabular-nums text-xs mt-0.5 ${
                          s.gross_profit >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatThb(s.gross_profit, true)}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteSale(s.id)}
                        className="mt-1 text-xs text-[#DC2626] font-medium px-2 py-1"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
