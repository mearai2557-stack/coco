import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type { DashboardSummary, Farmer, FreshPurchase, RawMaterialType } from '../types';
import { formatDateThai, formatKg, formatThb, todayIso } from '../lib/format';

interface PurchasesViewProps {
  farmers: Farmer[];
  purchases: FreshPurchase[];
  summary: DashboardSummary;
  onCreateFarmer: (data: { name: string; phone: string; location: string }) => Promise<Farmer>;
  onCreatePurchase: (data: {
    scheduledDate: string;
    farmerId: number;
    rawType: RawMaterialType;
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
  const [rawType, setRawType] = useState<RawMaterialType>('POD');
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('15');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterFarmerId, setFilterFarmerId] = useState<string>('');
  const [filterRawType, setFilterRawType] = useState<'ALL' | RawMaterialType>('ALL');

  // Quick add farmer modal/drawer
  const [showAddFarmer, setShowAddFarmer] = useState(false);
  const [newFarmerName, setNewFarmerName] = useState('');
  const [newFarmerPhone, setNewFarmerPhone] = useState('');
  const [newFarmerLocation, setNewFarmerLocation] = useState('');
  const [savingFarmer, setSavingFarmer] = useState(false);

  const selectedFarmerId = farmerId || farmers[0]?.id || 0;
  const estTotalCost = (Number(weightKg) || 0) * (Number(pricePerKg) || 0);

  const handleSelectRawType = (nextType: RawMaterialType) => {
    setRawType(nextType);
    setPricePerKg(nextType === 'WET_BEAN' ? '42' : '15');
  };

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (filterDate && p.scheduled_date !== filterDate) return false;
      if (filterFarmerId && String(p.farmer_id) !== filterFarmerId) return false;
      if (filterRawType !== 'ALL' && p.raw_type !== filterRawType) return false;
      return true;
    });
  }, [purchases, filterDate, filterFarmerId, filterRawType]);

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
        rawType,
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
      {/* Top Dual Raw-Material Stock Banner */}
      <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 flex-1">
          <div>
            <div className="text-xs font-medium text-[#57534E]">สต๊อกผลโกโก้สดคงเหลือ (รอแกะ)</div>
            <div className="mt-1 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#1C1917]">
                {formatKg(summary.fresh_stock_kg)}
              </span>
              <span className="text-xs text-[#78716C] font-mono tabular-nums">
                {formatThb(summary.fresh_stock_value)} · เฉลี่ย {formatThb(summary.avg_fresh_cost_per_kg)}/กก.
              </span>
            </div>
          </div>

          <div className="sm:border-l sm:border-[#E5E5E0] sm:pl-6">
            <div className="text-xs font-medium text-[#57534E]">สต๊อกเมล็ดโกโก้สดคงเหลือ (รอเข้าหมัก)</div>
            <div className="mt-1 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#9A4A18]">
                {formatKg(summary.wet_stock_kg)}
              </span>
              <span className="text-xs text-[#78716C] font-mono tabular-nums">
                {formatThb(summary.wet_stock_value)} · เฉลี่ย {formatThb(summary.avg_wet_cost_per_kg)}/กก.
              </span>
            </div>
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

      {/* Main Split: Receive Fresh Pods / Wet Beans Form + Scheduled Buying List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmitPurchase}
          className="lg:col-span-4 bg-white border border-[#E5E5E0] rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-[#1C1917]">บันทึกรับซื้อวัตถุดิบสด</h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              เลือกรับซื้อเป็น "ผลโกโก้สด" หรือ "เมล็ดโกโก้สด" เพื่อแยกสต๊อกอัตโนมัติ
            </p>
          </div>

          {/* Raw Material Type Toggle */}
          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-1.5">ประเภทที่รับซื้อ</label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F3F3EE] rounded-lg">
              <button
                type="button"
                onClick={() => handleSelectRawType('POD')}
                className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  rawType === 'POD' ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                }`}
              >
                ผลโกโก้สด
              </button>
              <button
                type="button"
                onClick={() => handleSelectRawType('WET_BEAN')}
                className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  rawType === 'WET_BEAN' ? 'bg-[#9A4A18] text-white shadow-xs' : 'text-[#57534E]'
                }`}
              >
                เมล็ดโกโก้สด
              </button>
            </div>
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
              รายชื่อเกษตรกรผู้ส่งสินค้า
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
                น้ำหนัก{rawType === 'WET_BEAN' ? 'เมล็ดสด' : 'ผลสด'} (กก.)
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
              placeholder={
                rawType === 'WET_BEAN'
                  ? 'เช่น เมล็ดสดแกะใหม่จากสวน บรรจุถังสะอาด'
                  : 'เช่น ผลสุกดี ผ่านการคัดเกรดหน้าลาน'
              }
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
            <span>
              {submitting
                ? 'กำลังบันทึก...'
                : rawType === 'WET_BEAN'
                ? 'บันทึกรับเข้าเมล็ดสด'
                : 'บันทึกรับเข้าผลสด'}
            </span>
          </button>
        </form>

        {/* Purchase Records & Farmer Filter */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#E5E5E0] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#1C1917]">
                    รายการรับซื้อผลสดและเมล็ดสดตามรอบวัน
                  </h2>
                  <p className="text-xs text-[#57534E] font-mono tabular-nums mt-0.5">
                    แสดง {filteredPurchases.length} รายการ · น้ำหนักรวม {formatKg(filteredSummary.weight)} ·{' '}
                    {formatThb(filteredSummary.cost)}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F3F3EE] rounded-lg self-start">
                  {(
                    [
                      { id: 'ALL', label: 'ทั้งหมด' },
                      { id: 'POD', label: 'ผลสด' },
                      { id: 'WET_BEAN', label: 'เมล็ดสด' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFilterRawType(t.id)}
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        filterRawType === t.id ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
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
                  className="min-h-[40px] px-2.5 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs max-w-[200px]"
                >
                  <option value="">เกษตรกรทั้งหมด</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {(filterDate || filterFarmerId || filterRawType !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDate('');
                      setFilterFarmerId('');
                      setFilterRawType('ALL');
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
                    <th className="py-3 px-4">เกษตรกร / ประเภท</th>
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
                    filteredPurchases.map((p) => {
                      const isWet = p.raw_type === 'WET_BEAN';
                      return (
                        <tr key={p.id} className="hover:bg-[#FAFAF8]">
                          <td className="py-3 px-4">
                            <div className="font-medium text-[#1C1917]">{formatDateThai(p.scheduled_date)}</div>
                            <div className="text-xs font-mono text-[#78716C]">{p.purchase_code}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-[#1C1917]">{p.farmer_name}</div>
                            <div className="text-xs mt-0.5">
                              <span className={isWet ? 'text-[#9A4A18] font-semibold' : 'text-[#57534E] font-medium'}>
                                {isWet ? 'เมล็ดสด' : 'ผลสด'}
                              </span>
                              {p.notes ? <span className="text-[#78716C]"> · {p.notes}</span> : null}
                            </div>
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-[#E5E5E0]">
              {filteredPurchases.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#78716C]">ไม่พบรายการรับซื้อ</div>
              ) : (
                filteredPurchases.map((p) => {
                  const isWet = p.raw_type === 'WET_BEAN';
                  return (
                    <div key={p.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-[#1C1917] truncate">{p.farmer_name}</div>
                        <div className="text-xs text-[#78716C] mt-0.5 font-mono">
                          <span className={isWet ? 'text-[#9A4A18] font-semibold' : 'text-[#57534E]'}>
                            {isWet ? 'เมล็ดสด' : 'ผลสด'}
                          </span>{' '}
                          · {formatDateThai(p.scheduled_date)} · {p.purchase_code}
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
                  );
                })
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
                    <div className="font-semibold text-[#1C1917]">
                      ผล {formatKg(f.total_pod_kg ?? 0, 0)} · เมล็ด {formatKg(f.total_wet_kg ?? 0, 0)}
                    </div>
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
