import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Factory,
  History,
  RefreshCw,
  RotateCcw,
  Scale,
  Truck,
} from 'lucide-react';
import type { DashboardSummary } from '../types';
import { formatKg } from '../lib/format';

export type NavTab = 'dashboard' | 'purchases' | 'processing' | 'sales' | 'ledger';

interface LayoutProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  summary: DashboardSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onResetData: (options: { keepFarmers: boolean }) => Promise<void>;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'ภาพรวม & กำไรขาดทุน', mobileLabel: 'ภาพรวม', icon: BarChart3 },
  { id: 'purchases', label: 'รับซื้อผลสด & เมล็ดสด', mobileLabel: 'รับซื้อ', icon: Scale },
  { id: 'processing', label: 'แปรรูป & หมักตาก', mobileLabel: 'แปรรูป', icon: Factory },
  { id: 'sales', label: 'จ่ายสินค้าออก', mobileLabel: 'ขายออก', icon: Truck },
  { id: 'ledger', label: 'ประวัติรายการ', mobileLabel: 'ประวัติ', icon: History },
];

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'ภาพรวมคลังสินค้าและกำไรขาดทุนรายรอบ',
  purchases: 'รับซื้อผลโกโก้สด & เมล็ดโกโก้สดแยกตามเกษตรกร',
  processing: 'แปรรูปผลสด · เมล็ดสด · หมัก · ตากแห้ง & คัดเกรด',
  sales: 'จ่ายสินค้าออกจำหน่ายและตัดสต๊อก',
  ledger: 'ประวัติการเคลื่อนไหวสต๊อกย้อนหลังทั้งหมด',
};

export function Layout({
  activeTab,
  onSelectTab,
  summary,
  loading,
  onRefresh,
  onResetData,
  primaryActionLabel,
  onPrimaryAction,
  children,
}: LayoutProps) {
  const [showResetModal, setShowResetModal] = useState(false);
  const [keepFarmers, setKeepFarmers] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [resetting, setResetting] = useState(false);

  const openResetModal = () => {
    setKeepFarmers(false);
    setConfirmChecked(false);
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    if (!confirmChecked || resetting) return;
    setResetting(true);
    try {
      await onResetData({ keepFarmers });
      setShowResetModal(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1C1917] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-[#E5E5E0] z-30">
        <div className="h-14 px-5 flex items-center border-b border-[#E5E5E0]">
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A4A18] rounded-md"
          >
            <span className="w-8 h-8 rounded-lg bg-[#291D16] text-white flex items-center justify-center font-bold text-sm tracking-tight shrink-0">
              CF
            </span>
            <span className="font-bold text-base tracking-tight text-[#1C1917] whitespace-nowrap">
              CacaoFlow
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full min-h-[44px] px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#291D16] text-white'
                    : 'text-[#57534E] hover:bg-[#F3F3EE] hover:text-[#1C1917]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#F59E0B]' : 'text-[#78716C]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live Stock Snapshot in Sidebar Footer */}
        {summary && (
          <div className="p-4 border-t border-[#E5E5E0] bg-[#FAFAF8]/70 space-y-2.5">
            <div className="text-xs font-semibold text-[#57534E]">สต๊อกคงเหลือปัจจุบัน</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#57534E]">ผลสดรอแกะ</span>
                <span className="font-mono tabular-nums font-medium text-[#1C1917]">
                  {formatKg(summary.fresh_stock_kg)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#57534E]">เมล็ดสดรอหมัก</span>
                <span className="font-mono tabular-nums font-medium text-[#1C1917]">
                  {formatKg(summary.wet_stock_kg)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#57534E]">อยู่ระหว่างหมัก</span>
                <span className="font-mono tabular-nums font-medium text-[#B45309]">
                  {summary.fermenting_batch_count} รอบ · {formatKg(summary.fermenting_wet_kg, 0)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-[#E5E5E0] flex items-center justify-between">
                <span className="text-[#57534E]">แห้ง (A/B/C)</span>
                <span className="font-mono tabular-nums font-semibold text-[#15803D]">
                  {formatKg(
                    summary.grade_stocks.A.remaining_kg +
                      summary.grade_stocks.B.remaining_kg +
                      summary.grade_stocks.C.remaining_kg
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#57534E]">เกรด Bulk คงคลัง</span>
                <span className="font-mono tabular-nums font-medium text-[#DC2626]">
                  {formatKg(summary.grade_stocks.BULK.remaining_kg)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={openResetModal}
              className="w-full min-h-[40px] mt-1 px-3 py-2 rounded-lg border border-[#E5E5E0] bg-white hover:border-[#DC2626]/50 hover:bg-[#FEF2F2] text-xs font-medium text-[#57534E] hover:text-[#991B1B] transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>ล้างข้อมูลเริ่มบันทึกจริง</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Compact Sticky Top Header (<= 52px on mobile) */}
        <header className="sticky top-0 z-20 h-13 lg:h-14 bg-white/95 backdrop-blur-md border-b border-[#E5E5E0] px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="lg:hidden font-bold text-sm text-[#291D16] whitespace-nowrap shrink-0">
              CacaoFlow
            </span>
            <span className="lg:hidden text-[#D6D3D1]" aria-hidden="true">/</span>
            <h1 className="text-sm lg:text-base font-semibold text-[#1C1917] truncate">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openResetModal}
              title="ล้างข้อมูลเพื่อเริ่มบันทึกจริง"
              aria-label="ล้างข้อมูลเพื่อเริ่มบันทึกจริง"
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5E5E0] bg-white text-[#57534E] hover:text-[#991B1B] hover:border-[#FECACA] hover:bg-[#FEF2F2] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              title="รีเฟรชข้อมูลล่าสุด"
              aria-label="รีเฟรชข้อมูลล่าสุด"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5E5E0] bg-white text-[#57534E] hover:text-[#1C1917] hover:bg-[#F3F3EE] transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {primaryActionLabel && onPrimaryAction && (
              <button
                type="button"
                onClick={onPrimaryAction}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#9A4A18] hover:bg-[#7C360D] text-white text-xs lg:text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4 shrink-0 hidden sm:block" />
                <span>{primaryActionLabel}</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Workspace Body */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-5 pb-24 lg:px-8 lg:py-7 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb Zone, fixed height 64px) */}
      <nav
        aria-label="เมนูมือถือ"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E5E5E0] pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] px-1 transition-colors ${
                  active ? 'text-[#9A4A18]' : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[11px] mt-1 leading-none whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}>
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Reset Data Confirmation Modal */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 bg-[#1C1917]/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white border border-[#E5E5E0] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 id="reset-modal-title" className="text-base font-bold text-[#1C1917]">
                  ล้างข้อมูลเพื่อเริ่มลงบันทึกจริง
                </h2>
                <p className="text-xs text-[#57534E] mt-1 leading-relaxed">
                  ระบบจะลบข้อมูลตัวอย่างและรายการทดสอบทั้งหมด (สต๊อกผลสด, เมล็ดสด, การรับซื้อ, รอบหมัก-ตาก, สต๊อกเกรด A/B/C/Bulk, การขาย และประวัติย้อนหลัง) ให้กลับเป็น 0 และไม่สร้างข้อมูลตัวอย่างซ้ำอีก
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-[#E5E5E0] bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="resetScope"
                  checked={!keepFarmers}
                  onChange={() => setKeepFarmers(false)}
                  className="mt-0.5 accent-[#9A4A18]"
                />
                <div className="text-xs">
                  <div className="font-semibold text-[#1C1917]">ล้างข้อมูลทั้งหมด 100% (รวมรายชื่อเกษตรกร)</div>
                  <div className="text-[#57534E] mt-0.5">เหมาะสำหรับเริ่มระบบใหม่จากศูนย์ทั้งหมด</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-[#E5E5E0] bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="resetScope"
                  checked={keepFarmers}
                  onChange={() => setKeepFarmers(true)}
                  className="mt-0.5 accent-[#9A4A18]"
                />
                <div className="text-xs">
                  <div className="font-semibold text-[#1C1917]">ล้างเฉพาะสต๊อกและรายการ (เก็บรายชื่อเกษตรกรไว้)</div>
                  <div className="text-[#57534E] mt-0.5">หากคุณลงทะเบียนรายชื่อเกษตรกรจริงไว้แล้ว</div>
                </div>
              </label>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="w-4 h-4 accent-[#DC2626] shrink-0"
              />
              <span className="text-xs font-medium text-[#991B1B]">
                ฉันเข้าใจว่าการล้างข้อมูลไม่สามารถย้อนกลับได้ และต้องการเริ่มบันทึกจริง
              </span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[#E5E5E0] bg-white hover:bg-[#F3F3EE] text-sm font-medium text-[#57534E] disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!confirmChecked || resetting}
                onClick={handleConfirmReset}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {resetting ? 'กำลังล้างข้อมูล...' : 'ยืนยันล้างข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
