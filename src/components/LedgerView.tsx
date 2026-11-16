import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { LedgerTxType, StockLedgerEntry } from '../types';
import { downloadCsv, formatDateThai, formatKg, formatThb } from '../lib/format';

interface LedgerViewProps {
  entries: StockLedgerEntry[];
}

const TX_TYPE_LABELS: Record<LedgerTxType, string> = {
  PURCHASE_FRESH: 'รับซื้อผลสด',
  START_FERMENT: 'ตัดเข้าหมัก',
  COMPLETE_DRYING: 'ตากแห้งคัดเกรด',
  BULK_LOSS: 'Bulk สูญเสีย',
  DISPATCH_SALE: 'จ่ายสินค้าออก',
  VOID_REVERSAL: 'ยกเลิกรายการ',
};

export function LedgerView({ entries }: LedgerViewProps) {
  const [txType, setTxType] = useState<'ALL' | LedgerTxType>('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (txType !== 'ALL' && item.tx_type !== txType) return false;
      if (dateFrom && item.tx_date < dateFrom) return false;
      if (dateTo && item.tx_date > dateTo) return false;
      if (q) {
        const hay = `${item.ref_code} ${item.title} ${item.counterparty} ${item.item_category} ${item.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, txType, search, dateFrom, dateTo]);

  const handleExport = () => {
    downloadCsv(
      'cacaoflow-stock-ledger.csv',
      ['วันที่', 'ประเภท', 'เลขที่อ้างอิง', 'รายการ', 'คู่ค้า/รอบ', 'หมวดสต๊อก', 'เปลี่ยนแปลง (กก.)', 'มูลค่า (บาท)', 'หมายเหตุ'],
      filtered.map((r) => [
        r.tx_date,
        TX_TYPE_LABELS[r.tx_type],
        r.ref_code,
        r.title,
        r.counterparty,
        r.item_category,
        r.weight_delta_kg,
        r.amount_thb,
        r.notes,
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่เอกสาร, ชื่อเกษตรกร, ลูกค้า, รหัสรอบ..."
              className="w-full min-h-[42px] pl-9 pr-3 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-sm focus:outline-none focus:border-[#9A4A18]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="ตั้งแต่วันที่"
              className="min-h-[40px] px-2.5 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs font-mono"
            />
            <span className="text-xs text-[#78716C]">ถึง</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="ถึงวันที่"
              className="min-h-[40px] px-2.5 rounded-lg border border-[#E5E5E0] bg-[#FAFAF8] text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleExport}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#E5E5E0] bg-white hover:bg-[#F3F3EE] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ส่งออก CSV</span>
            </button>
          </div>
        </div>

        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1 p-1 bg-[#F3F3EE] rounded-lg overflow-x-auto">
          {(
            [
              { id: 'ALL', label: 'ทั้งหมด' },
              { id: 'PURCHASE_FRESH', label: 'รับซื้อผลสด' },
              { id: 'START_FERMENT', label: 'ตัดเข้าหมัก' },
              { id: 'COMPLETE_DRYING', label: 'ตากแห้งคัดเกรด' },
              { id: 'BULK_LOSS', label: 'Bulk สูญเสีย' },
              { id: 'DISPATCH_SALE', label: 'จ่ายสินค้าออก' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTxType(tab.id)}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                txType === tab.id ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#57534E]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E5E5E0] text-xs text-[#57534E] font-mono tabular-nums">
          พบประวัติการทำรายการ {filtered.length} รายการ
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3F3EE] border-b border-[#E5E5E0] text-xs font-semibold text-[#57534E]">
                <th className="py-3 px-4">วันที่ / เลขที่</th>
                <th className="py-3 px-4">ประเภทรายการ</th>
                <th className="py-3 px-4">รายละเอียด / คู่ค้า</th>
                <th className="py-3 px-4">หมวดสต๊อก</th>
                <th className="py-3 px-4 text-right">ยอดเปลี่ยนแปลง</th>
                <th className="py-3 px-4 text-right">กระแสเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-[#78716C]">
                    ไม่พบประวัติรายการที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isBulk = item.tx_type === 'BULK_LOSS';
                  const deltaPositive = item.weight_delta_kg > 0;
                  return (
                    <tr key={item.id} className="hover:bg-[#FAFAF8]">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1917]">{formatDateThai(item.tx_date)}</div>
                        <div className="text-xs font-mono text-[#78716C]">{item.ref_code}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            isBulk
                              ? 'text-[#DC2626]'
                              : item.tx_type === 'DISPATCH_SALE' || item.tx_type === 'COMPLETE_DRYING'
                              ? 'text-[#15803D]'
                              : item.tx_type === 'START_FERMENT'
                              ? 'text-[#B45309]'
                              : 'text-[#1C1917]'
                          }`}
                        >
                          {TX_TYPE_LABELS[item.tx_type]}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#1C1917]">{item.title}</div>
                        <div className="text-xs text-[#78716C]">
                          {item.counterparty}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#57534E]">{item.item_category}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        <span
                          className={
                            isBulk
                              ? 'text-[#DC2626]'
                              : deltaPositive
                              ? 'text-[#15803D]'
                              : 'text-[#57534E]'
                          }
                        >
                          {deltaPositive ? '+' : ''}
                          {formatKg(item.weight_delta_kg)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {item.amount_thb === 0 ? (
                          <span className="text-[#78716C]">-</span>
                        ) : (
                          <span className={item.amount_thb > 0 ? 'text-[#15803D]' : 'text-[#DC2626]'}>
                            {formatThb(item.amount_thb, true)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-[#E5E5E0]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#78716C]">ไม่พบประวัติรายการ</div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#9A4A18]">
                    {TX_TYPE_LABELS[item.tx_type]} · <span className="text-[#78716C] font-mono">{item.ref_code}</span>
                  </div>
                  <div className="text-sm font-medium text-[#1C1917] mt-0.5">{item.title}</div>
                  <div className="text-xs text-[#78716C] mt-0.5">
                    {formatDateThai(item.tx_date)} · {item.counterparty}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <div
                    className={`text-sm font-semibold ${
                      item.tx_type === 'BULK_LOSS'
                        ? 'text-[#DC2626]'
                        : item.weight_delta_kg > 0
                        ? 'text-[#15803D]'
                        : 'text-[#57534E]'
                    }`}
                  >
                    {item.weight_delta_kg > 0 ? '+' : ''}
                    {formatKg(item.weight_delta_kg)}
                  </div>
                  {item.amount_thb !== 0 && (
                    <div
                      className={`text-xs mt-0.5 ${
                        item.amount_thb > 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
                      }`}
                    >
                      {formatThb(item.amount_thb, true)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
