import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type { DashboardSummary, Farmer, FreshPurchase } from '../types';
import { formatDateThai, formatKg, formatThb, todayIso } from '../lib/format';

interface PurchasesViewProps {
  farmers: Farmer[];
  purchases: FreshPurchase[];
  summary: DashboardSummary;
  onCreateFarmer: (data: { name: string; phone: string; location: string }) => Promise<Farmer>;
  onCreatePurchase: (data: {
    scheduledDate: string;
    farmerId: number;
    weightKg: number;
    pricePerKg: number;
    notes: string;
  }) => Promise<void>;
  onDeletePurchase: (id: number) => Promise<void>;
}

export function PurchasesView({
  farmers,
  purchases,
  summary,
  onCreateFarmer,
  onCreatePurchase,
  onDeletePurchase,
}: PurchasesViewProps) {
  const [scheduledDate, setScheduledDate] = useState(todayIso());
  const [farmerId, setFarmerId] = useState<number>(farmers[0]?.id ?? 0);
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('15');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterFarmerId, setFilterFarmerId] = useState<string>('');

  // Quick add farmer modal/drawer
  const [showAddFarmer, setShowAddFarmer] = useState(false);
  const [newFarmerName, setNewFarmerName] = useState('');
  const [newFarmerPhone, setNewFarmerPhone] = useState('');
  const [newFarmerLocation, setNewFarmerLocation] = useState('');
  const [savingFarmer, setSavingFarmer] = useState(false);

  const selectedFarmerId = farmerId || farmers[0]?.id || 0;
  const estTotalCost = (Number(weightKg) || 0) * (Number(pricePerKg) || 0);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (filterDate && p.scheduled_date !== filterDate) return false;
      if (filterFarmerId && String(p.farmer_id) !== filterFarmerId) return false;
      return true;
    });
  }, [purchases, filterDate, filterFarmerId]);

  const filteredSummary = useMemo(() => {
    return filteredPurchases.reduce(
      (acc, p) => {
        acc.weight += p.weight_kg;
        acc.cost += p.total_cost;
        return acc;
      },
      { weight: 0, cost: 0 }
    );
  }, [filteredPurchases]);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmerId) return;
    setSubmitting(true);
    try {
      await onCreatePurchase({
        scheduledDate,
        farmerId: selectedFarmerId,
        weightKg: Number(weightKg),
        pricePerKg: Number(pricePerKg),
        notes,
      });
      setWeightKg('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddFarmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFarmerName.trim()) return;
    setSavingFarmer(true);
    try {
      const created = await onCreateFarmer({
        name: newFarmerName,
        phone: newFarmerPhone,
        location: newFarmerLocation,
      });
      setFarmerId(created.id);
      setNewFarmerName('');
      setNewFarmerPhone('');
      setNewFarmerLocation('');
      setShowAddFarmer(false);
    } finally {
      setSavingFarmer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stock Banner */}
      <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-[#57534E]">สต๊อกผลโกโก้สดคงเหลือในโรงงาน</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#1C1917]">
              {formatKg(summary.fresh_stock_kg)}
            </span>
            <span className="text-xs text-[#78716C] font-mono tabular-nums">
              มูลค่า {formatThb(summary.fresh_stock_value)} · ต้นทุนเฉลี่ย{' '}
              {formatThb(summary.avg_fresh_cost_per_kg)}/กก.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddFarmer((v) => !v)}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] hover:bg-[#F3F3EE] text-sm font-medium text-[#1C1917] flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4 text-[#9A4A18]" />
          <span>เพิ่มรายชื่อเกษตรกร</span>
        </button>
      </div>

      {/* Quick Add Farmer Panel */}
      {showAddFarmer && (
        <form
          onSubmit={handleAddFarmer}
          className="bg-white border border-[#9A4A18]/40 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1C1917]">ลงทะเบียนเกษตรกรรายใหม่</h2>
            <button
              type="button"
              onClick={() => setShowAddFarmer(false)}
              className="text-xs text-[#78716C] hover:text-[#1C1917] px-2 py-1"
            >
              ปิด
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                ชื่อเกษตรกร / สวน *
              </label>
              <input
                type="text"
                required
                value={newFarmerName}
                onChange={(e) => setNewFarmerName(e.target.value)}
                placeholder="เช่น คุณประสิทธิ์ สวนป่าแดด"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                value={newFarmerPhone}
                onChange={(e) => setNewFarmerPhone(e.target.value)}
                placeholder="08x-xxx-xxxx"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">พื้นที่ / อำเภอ</label>
              <input
                type="text"
                value={newFarmerLocation}
                onChange={(e) => setNewFarmerLocation(e.target.value)}
                placeholder="เช่น อ.สันทราย จ.เชียงใหม่"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingFarmer}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-[#291D16] hover:bg-[#1C1917] text-white text-sm font-medium disabled:opacity-50"
            >
              {savingFarmer ? 'กำลังบันทึก...' : 'บันทึกรายชื่อเกษตรกร'}
            </button>
          </div>
        </form>
      )}

      {/* Main Split: Receive Fresh Pods Form + Scheduled Buying List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Column */}
        <form
          onSubmit={handleSubmitPurchase}
          className="lg:col-span-4 bg-white border border-[#E5E5E0] rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">บันทึกรับซื้อผลโกโก้สด</h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              เพิ่มยอดเข้าคลังผลสดและบันทึกต้นทุนรับซื้ออัตโนมัติ
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              วันที่มีกำหนดการรับซื้อ
            </label>
            <input
              type="date"
              required
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono focus:outline-none focus:border-[#9A4A18]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">
              รายชื่อเกษตรกรผู้ส่งผลสด
            </label>
            <select
              required
              value={selectedFarmerId}
              onChange={(e) => setFarmerId(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
            >
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                น้ำหนักรับเข้า (กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="0.0"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#9A4A18]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#57534E] mb-1">
                ราคารับซื้อ (บาท/กก.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                inputMode="decimal"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                placeholder="15.00"
                className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm font-mono tabular-nums focus:outline-none focus:border-[#9A4A18]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1">หมายเหตุ (ถ้ามี)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ผลสุกดี ผ่านการคัดเกรดหน้าลาน"
              className="w-full min-h-[44px] px-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E5E5E0] flex items-center justify-between">
            <span className="text-xs font-medium text-[#57534E]">ยอดเงินรับซื้อรวม</span>
            <span className="text-lg font-bold font-mono tabular-nums text-[#9A4A18]">
              {formatThb(estTotalCost)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedFarmerId}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-[#9A4A18] hover:bg-[#7C360D] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{submitting ? 'กำลังบันทึก...' : 'บันทึกรับเข้าผลสด'}</span>
          </button>
        </form>

        {/* Purchase Records & Farmer Filter */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#E5E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C1917]">รายการรับซื้อผลสดตามรอบวัน</h2>
                <p className="text-xs text-[#57534E] font-mono tabular-nums mt-0.5">
                  แสดง {filteredPurchases.length} รายการ · น้ำหนักรวม {formatKg(filteredSummary.weight)} ·{' '}
                  {formatThb(filteredSummary.cost)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  aria-label="กรองตามวันที่รับซื้อ"
                  className="min-h-[40px] px-2.5 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs font-mono"
                />
                <select
                  value={filterFarmerId}
                  onChange={(e) => setFilterFarmerId(e.target.value)}
                  aria-label="กรองตามรายชื่อเกษตรกร"
                  className="min-h-[40px] px-2.5 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs max-w-[180px]"
                >
                  <option value="">เกษตรกรทั้งหมด</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {(filterDate || filterFarmerId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDate('');
                      setFilterFarmerId('');
                    }}
                    className="min-h-[40px] px-2.5 text-xs text-[#9A4A18] font-medium"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F3EE] border-b border-[#E5E5E0] text-xs font-semibold text-[#57534E]">
                    <th className="py-3 px-4">วันที่รับซื้อ / เลขที่</th>
                    <th className="py-3 px-4">เกษตรกร</th>
                    <th className="py-3 px-4 text-right">น้ำหนักรับเข้า</th>
                    <th className="py-3 px-4 text-right">ราคา/กก.</th>
                    <th className="py-3 px-4 text-right">ยอดเงินรวม</th>
                    <th className="py-3 px-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E0] text-sm">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-[#78716C]">
                        ไม่พบรายการรับซื้อตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-[#FAFAF8]">
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{formatDateThai(p.scheduled_date)}</div>
                          <div className="text-xs font-mono text-[#78716C]">{p.purchase_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1917]">{p.farmer_name}</div>
                          {p.notes && <div className="text-xs text-[#78716C] truncate max-w-[220px]">{p.notes}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#15803D]">
                          +{formatKg(p.weight_kg)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#57534E]">
                          {formatThb(p.price_per_kg)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#1C1917]">
                          {formatThb(p.total_cost)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onDeletePurchase(p.id)}
                            title="ลบรายการรับซื้อ"
                            aria-label={`ลบรายการ ${p.purchase_code}`}
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
              {filteredPurchases.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#78716C]">ไม่พบรายการรับซื้อ</div>
              ) : (
                filteredPurchases.map((p) => (
                  <div key={p.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-[#1C1917] truncate">{p.farmer_name}</div>
                      <div className="text-xs text-[#78716C] mt-0.5 font-mono">
                        {formatDateThai(p.scheduled_date)} · {p.purchase_code}
                      </div>
                      {p.notes && <div className="text-xs text-[#57534E] mt-1">{p.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums font-semibold text-sm text-[#15803D]">
                        +{formatKg(p.weight_kg)}
                      </div>
                      <div className="font-mono tabular-nums text-xs text-[#1C1917] mt-0.5">
                        {formatThb(p.total_cost)}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeletePurchase(p.id)}
                        className="mt-1.5 text-xs text-[#DC2626] font-medium px-2 py-1"
                      >
                        ลบรายการ
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Farmer Cumulative Summary */}
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#1C1917] mb-3">สรุปยอดรับซื้อสะสมแยกตามเกษตรกร</h3>
            <div className="divide-y divide-[#E5E5E0]">
              {farmers.map((f) => (
                <div key={f.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-[#1C1917] truncate">{f.name}</div>
                    <div className="text-xs text-[#78716C]">
                      {f.location || 'ไม่ระบุพื้นที่'} {f.phone ? `· ${f.phone}` : ''}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-semibold text-[#1C1917]">{formatKg(f.total_weight_kg ?? 0)}</div>
                    <div className="text-xs text-[#57534E]">{formatThb(f.total_spent ?? 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
