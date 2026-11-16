import React, { useState } from 'react';
import { CheckCircle2, Flame, PackageCheck } from 'lucide-react';
import type { DashboardSummary, ProcessingBatch } from '../types';
import { formatDateThai, formatKg, formatThb, todayIso } from '../lib/format';

interface ProcessingViewProps {
  batches: ProcessingBatch[];
  summary: DashboardSummary;
  onStartBatch: (data: {
    startedDate: string;
    freshUsedKg: number;
    wetPurchasedUsedKg: number;
    wetBeanKg: number;
    processingExpense: number;
    notes: string;
  }) => Promise<void>;
  onCompleteBatch: (
    batchId: number,
    data: {
      completedDate: string;
      bulkLossKg: number;
      gradeAKg: number;
      gradeBKg: number;
      gradeCKg: number;
      extraExpense: number;
      notes: string;
    }
  ) => Promise<void>;
}

export function ProcessingView({
  batches,
  summary,
  onStartBatch,
  onCompleteBatch,
}: ProcessingViewProps) {
  const [startedDate, setStartedDate] = useState(todayIso());
  const [freshUsedKg, setFreshUsedKg] = useState('');
  const [wetPurchasedUsedKg, setWetPurchasedUsedKg] = useState('');
  const [wetBeanKg, setWetBeanKg] = useState('');
  const [wetBeanTouched, setWetBeanTouched] = useState(false);
  const [processingExpense, setProcessingExpense] = useState('0');
  const [startNotes, setStartNotes] = useState('');
  const [starting, setStarting] = useState(false);

  const [completingBatch, setCompletingBatch] = useState<ProcessingBatch | null>(null);
  const [completedDate, setCompletedDate] = useState(todayIso());
  const [bulkLossKg, setBulkLossKg] = useState('0');
  const [gradeAKg, setGradeAKg] = useState('');
  const [gradeBKg, setGradeBKg] = useState('');
  const [gradeCKg, setGradeCKg] = useState('');
  const [extraExpense, setExtraExpense] = useState('0');
  const [completeNotes, setCompleteNotes] = useState('');
  const [completing, setCompleting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'fermenting' | 'completed' | 'all'>('all');

  const freshInputNum = Number(freshUsedKg) || 0;
  const wetInputNum = Number(wetPurchasedUsedKg) || 0;
  const freshAvailable = summary.fresh_stock_kg;
  const wetAvailable = summary.wet_stock_kg;

  const freshInsufficient = freshInputNum > freshAvailable + 0.001;
  const wetInsufficient = wetInputNum > wetAvailable + 0.001;

  const estRawCostAllocated =
    freshInputNum * summary.avg_fresh_cost_per_kg + wetInputNum * summary.avg_wet_cost_per_kg;

  const fermentingBatches = batches.filter((b) => b.status === 'fermenting');
  const completedBatches = batches.filter((b) => b.status === 'completed');

  const visibleBatches = batches.filter((b) => {
    if (statusFilter === 'all') return true;
    return b.status === statusFilter;
  });

  const handleWetPurchasedChange = (val: string) => {
    setWetPurchasedUsedKg(val);
    if (!wetBeanTouched && (Number(freshUsedKg) || 0) === 0) {
      setWetBeanKg(val);
    }
  };

  const handleStartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (freshInsufficient || wetInsufficient) return;
    if (freshInputNum <= 0 && wetInputNum <= 0) return;
    setStarting(true);
    try {
      await onStartBatch({
        startedDate,
        freshUsedKg: freshInputNum,
        wetPurchasedUsedKg: wetInputNum,
        wetBeanKg: Number(wetBeanKg),
        processingExpense: Number(processingExpense) || 0,
        notes: startNotes,
      });
      setFreshUsedKg('');
      setWetPurchasedUsedKg('');
      setWetBeanKg('');
      setWetBeanTouched(false);
      setProcessingExpense('0');
      setStartNotes('');
    } finally {
      setStarting(false);
    }
  };

  const openCompletePanel = (batch: ProcessingBatch) => {
    setCompletingBatch(batch);
    setCompletedDate(todayIso());
    setBulkLossKg('0');
    setGradeAKg('');
    setGradeBKg('');
    setGradeCKg('');
    setExtraExpense('0');
    setCompleteNotes('');
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingBatch) return;
    setCompleting(true);
    try {
      await onCompleteBatch(completingBatch.id, {
        completedDate,
        bulkLossKg: Number(bulkLossKg) || 0,
        gradeAKg: Number(gradeAKg) || 0,
        gradeBKg: Number(gradeBKg) || 0,
        gradeCKg: Number(gradeCKg) || 0,
        extraExpense: Number(extraExpense) || 0,
        notes: completeNotes,
      });
      setCompletingBatch(null);
    } finally {
      setCompleting(false);
    }
  };

  const previewA = Number(gradeAKg) || 0;
  const previewB = Number(gradeBKg) || 0;
  const previewC = Number(gradeCKg) || 0;
  const previewBulk = Number(bulkLossKg) || 0;
  const previewDriedTotal = previewA + previewB + previewC + previewBulk;
  const previewTotalCost = completingBatch
    ? completingBatch.fresh_cost_allocated +
      (completingBatch.wet_cost_allocated ?? 0) +
      completingBatch.processing_expense +
      (Number(extraExpense) || 0)
    : 0;

  const previewCostPerKg = previewDriedTotal > 0 ? previewTotalCost / previewDriedTotal : 0;
  const previewBulkCost = previewBulk * previewCostPerKg;

  return (
    <div className="space-y-6">
      {/* Step 2 Completion Modal / Sheet */}
      {completingBatch && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-batch-title"
        >
          <form
            onSubmit={handleCompleteSubmit}
            className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E5E0] max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5"
          >
            <div className="w-10 h-1.5 bg-[#D6D3D1] rounded-full mx-auto sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="complete-batch-title" className="text-base font-bold text-[#1C1917]">
                  ปิดรอบหมัก & ตากแห้งคัดเกรด · {completingBatch.batch_code}
                </h2>
                <p className="text-xs text-[#57534E] mt-0.5 font-mono tabular-nums">
                  เมล็ดหมักรวม {formatKg(completingBatch.wet_bean_kg)} · ทุนสะสม{' '}
                  {formatThb(
                    completingBatch.fresh_cost_allocated +
                      (completingBatch.wet_cost_allocated ?? 0) +
                      completingBatch.processing_expense
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletingBatch(null)}
                className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-[#57534E] hover:bg-[#F3F3EE]"
              >
                ยกเลิก
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#57534E] mb-1">
                  วันที่ตากแห้ง & คัดเกรดเสร็จ
                </label>
                <input
                  type="date"
                  required
                  value={completedDate}
                  onChange={(e) => setCompletedDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#57534E] mb-1">
                  ค่าตากแห้ง / คัดเกรดเพิ่มเติม (บาท)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={extraExpense}
                  onChange={(e) => setExtraExpense(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Grade A, B, C, and BULK Dried Beans entering stock */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1C1917]">
                  ผลผลิตโกโก้แห้งคัดเกรดนำเข้าสต๊อก (กก.)
                </span>
                <span className="text-xs font-mono tabular-nums text-[#15803D] font-medium">
                  รวมทั้งหมด {formatKg(previewDriedTotal)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#15803D] mb-1">เกรด A (กก.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={gradeAKg}
                    onChange={(e) => setGradeAKg(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B45309] mb-1">เกรด B (กก.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={gradeBKg}
                    onChange={(e) => setGradeBKg(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">เกรด C (กก.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={gradeCKg}
                    onChange={(e) => setGradeCKg(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#DC2626] mb-1">
                    เกรด Bulk (กก.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={bulkLossKg}
                    onChange={(e) => setBulkLossKg(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2]/60 text-sm font-mono tabular-nums text-[#991B1B]"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FEF2F2]/50 border border-[#FECACA] text-[11px] text-[#991B1B] flex items-center justify-between gap-2">
                <span>
                  เมล็ดที่หมักแล้วปัดเป็น <strong>เกรด Bulk</strong> จะถูกนำเข้าสต๊อกเป็นเกรด Bulk หลังตากแห้ง
                </span>
                <span className="font-mono font-semibold whitespace-nowrap">
                  {formatThb(previewBulkCost)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                บันทึกเพิ่มเติมหลังตากแห้ง
              </label>
              <input
                type="text"
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="เช่น ความชื้น 7% คัดเกรด A/B/C และปัดเมล็ดเสียเป็น Bulk"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm"
              />
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-[#57534E]">Yield เทียบวัตถุดิบ: </span>
                <span className="font-mono font-semibold text-[#1C1917]">
                  {(() => {
                    const base =
                      completingBatch.fresh_used_kg > 0
                        ? completingBatch.fresh_used_kg + (completingBatch.wet_purchased_used_kg ?? 0)
                        : completingBatch.wet_bean_kg;
                    return base > 0 ? ((previewDriedTotal / base) * 100).toFixed(1) : '0.0';
                  })()}
                  %
                </span>
              </div>
              <div>
                <span className="text-[#57534E]">ต้นทุนเฉลี่ยโกโก้แห้งรอบนี้: </span>
                <span className="font-mono font-semibold text-[#15803D]">
                  {formatThb(previewCostPerKg)}/กก.
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={completing || previewDriedTotal <= 0}
              className="w-full min-h-[48px] rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <PackageCheck className="w-4 h-4" />
              <span>{completing ? 'กำลังบันทึก...' : 'ยืนยันปิดรอบ & นำเข้าสต๊อก A / B / C / Bulk'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Main Split: Step 1 Form + Batch List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleStartSubmit}
          className="lg:col-span-4 bg-white border border-[#E5E5E0] rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">
              ขั้นที่ 1: เบิกวัตถุดิบเข้าหมัก (ตัดสต๊อกอัตโนมัติ)
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              เบิกได้ทั้ง "ผลสด" และ/หรือ "เมล็ดสด" ที่รับซื้อไว้เพื่อส่งเข้าถังหมัก
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0]">
              <div className="text-[11px] text-[#57534E]">ผลสดคงเหลือ</div>
              <div className="font-mono tabular-nums font-bold text-sm text-[#1C1917] mt-0.5">
                {formatKg(freshAvailable)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0]">
              <div className="text-[11px] text-[#57534E]">เมล็ดสดคงเหลือ</div>
              <div className="font-mono tabular-nums font-bold text-sm text-[#9A4A18] mt-0.5">
                {formatKg(wetAvailable)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">วันที่เริ่มรอบหมัก</label>
            <input
              type="date"
              required
              value={startedDate}
              onChange={(e) => setStartedDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                เบิกผลสด (กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={freshUsedKg}
                onChange={(e) => setFreshUsedKg(e.target.value)}
                placeholder="0.0"
                className={`w-full min-h-[44px] px-3 rounded-lg border text-sm font-mono tabular-nums bg-[#FAFAF8] ${
                  freshInsufficient ? 'border-[#DC2626] text-[#DC2626]' : 'border-[#E5E5E0]'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                เบิกเมล็ดสดที่ซื้อไว้ (กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={wetPurchasedUsedKg}
                onChange={(e) => handleWetPurchasedChange(e.target.value)}
                placeholder="0.0"
                className={`w-full min-h-[44px] px-3 rounded-lg border text-sm font-mono tabular-nums bg-[#FAFAF8] ${
                  wetInsufficient ? 'border-[#DC2626] text-[#DC2626]' : 'border-[#E5E5E0]'
                }`}
              />
            </div>
          </div>

          {(freshInsufficient || wetInsufficient) && (
            <p className="text-xs text-[#DC2626] font-medium">
              {freshInsufficient
                ? `น้ำหนักเบิกผลสดเกินสต๊อกคงเหลือ (${formatKg(freshAvailable)})`
                : `น้ำหนักเบิกเมล็ดสดเกินสต๊อกคงเหลือ (${formatKg(wetAvailable)})`}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              น้ำหนักเมล็ดสดรวมที่เข้าถังหมักจริง (กก.) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              inputMode="decimal"
              value={wetBeanKg}
              onChange={(e) => {
                setWetBeanKg(e.target.value);
                setWetBeanTouched(true);
              }}
              placeholder="เช่น เมล็ดที่ได้จากผลสด + เมล็ดสดที่เบิก"
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              ค่าแรงแกะผลสด / ค่าดำเนินการรอบนี้ (บาท)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={processingExpense}
              onChange={(e) => setProcessingExpense(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              หมายเหตุถังหมัก / สูตรหมัก
            </label>
            <input
              type="text"
              value={startNotes}
              onChange={(e) => setStartNotes(e.target.value)}
              placeholder="เช่น ถังไม้ 4 หมัก 6 วัน"
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm"
            />
          </div>

          <div className="p-3 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] text-xs flex items-center justify-between">
            <span className="text-[#57534E]">ต้นทุนวัตถุดิบสดที่ตัดเข้าหมัก</span>
            <span className="font-mono tabular-nums font-semibold text-[#1C1917]">
              {formatThb(estRawCostAllocated)}
            </span>
          </div>

          <button
            type="submit"
            disabled={
              starting ||
              freshInsufficient ||
              wetInsufficient ||
              (freshInputNum <= 0 && wetInputNum <= 0)
            }
            className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-[#9A4A18] hover:bg-[#7C360D] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Flame className="w-4 h-4" />
            <span>{starting ? 'กำลังตัดสต๊อก...' : 'เปิดรอบหมัก & ตัดสต๊อกวัตถุดิบ'}</span>
          </button>
        </form>

        {/* Right Column: Active Fermenting + Completed Batches */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#E5E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C1917]">รายการรอบหมักและผลผลิตตากแห้ง</h2>
                <p className="text-xs text-[#57534E] mt-0.5">
                  กำลังหมัก {fermentingBatches.length} รอบ · ปิดยอดคัดเกรดแล้ว {completedBatches.length} รอบ
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#F3F3EE] rounded-lg self-start">
                {(
                  [
                    { id: 'all', label: 'ทั้งหมด' },
                    { id: 'fermenting', label: `กำลังหมัก (${fermentingBatches.length})` },
                    { id: 'completed', label: `คัดเกรดแล้ว (${completedBatches.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setStatusFilter(t.id)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      statusFilter === t.id ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[#E5E5E0]">
              {visibleBatches.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#78716C]">
                  ยังไม่มีรอบการแปรรูปในหมวดหมู่นี้
                </div>
              ) : (
                visibleBatches.map((batch) => {
                  const totalCost =
                    batch.fresh_cost_allocated +
                    (batch.wet_cost_allocated ?? 0) +
                    batch.processing_expense;
                  return (
                    <div key={batch.id} className="p-4 sm:p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-[#1C1917]">
                              {batch.batch_code}
                            </span>
                            <span className="text-[#D6D3D1]" aria-hidden="true">·</span>
                            <span className="text-xs text-[#57534E]">
                              เริ่มหมัก {formatDateThai(batch.started_date)}
                            </span>
                            <span className="text-[#D6D3D1]" aria-hidden="true">·</span>
                            {batch.status === 'fermenting' ? (
                              <span className="text-xs font-semibold text-[#B45309]">กำลังหมัก (รอบันทึกผลแห้ง)</span>
                            ) : (
                              <span className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                คัดเกรดแล้ว {formatDateThai(batch.completed_date)}
                              </span>
                            )}
                          </div>
                          {batch.notes && (
                            <p className="text-xs text-[#78716C] mt-1">{batch.notes}</p>
                          )}
                        </div>

                        {batch.status === 'fermenting' && (
                          <button
                            type="button"
                            onClick={() => openCompletePanel(batch)}
                            className="min-h-[44px] px-4 py-2 rounded-lg bg-[#291D16] hover:bg-[#1C1917] text-white text-xs sm:text-sm font-medium whitespace-nowrap shrink-0"
                          >
                            บันทึกผลตากแห้ง · คัดเกรด A/B/C/Bulk
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0]">
                          <div className="text-[#78716C]">วัตถุดิบ → เมล็ดเข้าหมัก</div>
                          <div className="font-mono tabular-nums font-semibold text-[#1C1917] mt-0.5">
                            {batch.fresh_used_kg > 0 ? `ผล ${batch.fresh_used_kg}` : ''}
                            {batch.fresh_used_kg > 0 && (batch.wet_purchased_used_kg ?? 0) > 0 ? ' + ' : ''}
                            {(batch.wet_purchased_used_kg ?? 0) > 0
                              ? `เมล็ด ${batch.wet_purchased_used_kg}`
                              : ''}{' '}
                            → {batch.wet_bean_kg} กก.
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0]">
                          <div className="text-[#78716C]">ต้นทุนรวมรอบผลิต</div>
                          <div className="font-mono tabular-nums font-semibold text-[#1C1917] mt-0.5">
                            {formatThb(totalCost)}
                          </div>
                        </div>

                        {batch.status === 'completed' ? (
                          <>
                            <div className="p-2.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0]">
                              <div className="text-[#78716C]">คัดเกรดเข้าสต๊อก (A / B / C)</div>
                              <div className="font-mono tabular-nums font-semibold text-[#15803D] mt-0.5">
                                {batch.grade_a_kg} / {batch.grade_b_kg} / {batch.grade_c_kg} กก.
                              </div>
                            </div>

                            <div
                              className={`p-2.5 rounded-lg border ${
                                batch.bulk_loss_kg > 0
                                  ? 'bg-[#FEF2F2]/60 border-[#FECACA]'
                                  : 'bg-[#FAFAF8] border-[#E5E5E0]'
                              }`}
                            >
                              <div className={batch.bulk_loss_kg > 0 ? 'text-[#991B1B]' : 'text-[#78716C]'}>
                                เกรด Bulk เข้าสต๊อก
                              </div>
                              <div
                                className={`font-mono tabular-nums font-semibold mt-0.5 ${
                                  batch.bulk_loss_kg > 0 ? 'text-[#DC2626]' : 'text-[#1C1917]'
                                }`}
                              >
                                {formatKg(batch.bulk_loss_kg)} ({formatThb(batch.bulk_loss_value)})
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 p-2.5 rounded-lg bg-[#FFFBEB]/60 border border-[#FDE68A] flex items-center text-[#92400E]">
                            รอครบกำหนดหมักและตากแห้ง เพื่อคัดเกรด A, B, C และเกรด Bulk เข้าสต๊อก
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
