import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Layout, type NavTab } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { PurchasesView } from './components/PurchasesView';
import { ProcessingView } from './components/ProcessingView';
import { SalesView } from './components/SalesView';
import { LedgerView } from './components/LedgerView';
import type {
  BatchGradeLot,
  CocoaGrade,
  DashboardSummary,
  Farmer,
  FreshPurchase,
  ProcessingBatch,
  RawMaterialType,
  SalesDispatch,
  StockLedgerEntry,
} from './types';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
  return body as T;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [purchases, setPurchases] = useState<FreshPurchase[]>([]);
  const [batches, setBatches] = useState<ProcessingBatch[]>([]);
  const [gradeLots, setGradeLots] = useState<BatchGradeLot[]>([]);
  const [sales, setSales] = useState<SalesDispatch[]>([]);
  const [ledger, setLedger] = useState<StockLedgerEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, farmerData, purchaseData, batchData, lotData, salesData, ledgerData] =
        await Promise.all([
          apiJson<DashboardSummary>('/api/dashboard'),
          apiJson<Farmer[]>('/api/farmers'),
          apiJson<FreshPurchase[]>('/api/purchases'),
          apiJson<ProcessingBatch[]>('/api/batches'),
          apiJson<BatchGradeLot[]>('/api/grade-lots'),
          apiJson<SalesDispatch[]>('/api/sales'),
          apiJson<StockLedgerEntry[]>('/api/ledger'),
        ]);
      setSummary(dashData);
      setFarmers(farmerData);
      setPurchases(purchaseData);
      setBatches(batchData);
      setGradeLots(lotData);
      setSales(salesData);
      setLedger(ledgerData);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    const onFocus = () => {
      loadAllData();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAllData]);

  const handleCreateFarmer = async (data: { name: string; phone: string; location: string }) => {
    try {
      const created = await apiJson<Farmer>('/api/farmers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadAllData();
      showToast('success', `เพิ่มเกษตรกร "${created.name}" เรียบร้อยแล้ว`);
      return created;
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const handleCreatePurchase = async (data: {
    scheduledDate: string;
    farmerId: number;
    rawType: RawMaterialType;
    weightKg: number;
    pricePerKg: number;
    notes: string;
  }) => {
    try {
      const created = await apiJson<FreshPurchase>('/api/purchases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadAllData();
      const label = created.raw_type === 'WET_BEAN' ? 'เมล็ดสด' : 'ผลสด';
      showToast('success', `บันทึกรับซื้อ${label} ${created.purchase_code} (+${created.weight_kg} กก.)`);
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const handleDeletePurchase = async (id: number) => {
    try {
      await apiJson<{ ok: boolean }>(`/api/purchases/${id}`, { method: 'DELETE' });
      await loadAllData();
      showToast('success', 'ลบรายการรับซื้อและปรับสต๊อกเรียบร้อยแล้ว');
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  const handleStartBatch = async (data: {
    startedDate: string;
    freshUsedKg: number;
    wetPurchasedUsedKg: number;
    wetBeanKg: number;
    processingExpense: number;
    notes: string;
  }) => {
    try {
      const created = await apiJson<ProcessingBatch>('/api/batches/start', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadAllData();
      showToast('success', `เปิดรอบหมัก ${created.batch_code} และตัดสต๊อกวัตถุดิบเรียบร้อยแล้ว`);
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const handleCompleteBatch = async (
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
  ) => {
    try {
      const updated = await apiJson<ProcessingBatch>(`/api/batches/${batchId}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadAllData();
      showToast('success', `ปิดรอบ ${updated.batch_code} และนำเข้าสต๊อกเกรด A / B / C / Bulk เรียบร้อยแล้ว`);
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const handleCreateSale = async (data: {
    dispatchDate: string;
    customerName: string;
    grade: CocoaGrade;
    weightKg: number;
    pricePerKg: number;
    preferredBatchId?: number;
    notes: string;
  }) => {
    try {
      const created = await apiJson<SalesDispatch>('/api/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadAllData();
      const gradeLabel = created.grade === 'BULK' ? 'Bulk' : created.grade;
      showToast('success', `ตัดจ่ายสินค้า ${created.dispatch_code} เกรด ${gradeLabel} เรียบร้อยแล้ว`);
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const handleDeleteSale = async (id: number) => {
    try {
      await apiJson<{ ok: boolean }>(`/api/sales/${id}`, { method: 'DELETE' });
      await loadAllData();
      showToast('success', 'ยกเลิกการจ่ายสินค้าและคืนสต๊อกกลับเข้าคลังแล้ว');
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  const handleResetData = async (options: { keepFarmers: boolean }) => {
    try {
      await apiJson<{ ok: boolean }>('/api/reset', {
        method: 'POST',
        body: JSON.stringify(options),
      });
      await loadAllData();
      setActiveTab('dashboard');
      showToast('success', 'ล้างข้อมูลเรียบร้อยแล้ว พร้อมเริ่มบันทึกรายการจริง');
    } catch (err) {
      showToast('error', (err as Error).message);
      throw err;
    }
  };

  const quickHeaderCta: Record<NavTab, { label: string; target: NavTab } | undefined> = {
    dashboard: { label: 'รับซื้อผลสด', target: 'purchases' },
    purchases: { label: 'เข้าหมักแปรรูป', target: 'processing' },
    processing: { label: 'จ่ายสินค้าออก', target: 'sales' },
    sales: { label: 'ดูภาพรวมกำไร', target: 'dashboard' },
    ledger: { label: 'ภาพรวมคลัง', target: 'dashboard' },
  };

  const cta = quickHeaderCta[activeTab];

  return (
    <Layout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      summary={summary}
      loading={loading}
      onRefresh={loadAllData}
      onResetData={handleResetData}
      primaryActionLabel={cta?.label}
      onPrimaryAction={cta ? () => setActiveTab(cta.target) : undefined}
    >
      {toast && (
        <div
          role="status"
          className={`mb-4 px-4 py-3 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs underline underline-offset-2 shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {!summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white border border-[#E5E5E0] animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-white border border-[#E5E5E0] animate-pulse" />
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardView summary={summary} onNavigate={setActiveTab} />
          )}
          {activeTab === 'purchases' && (
            <PurchasesView
              farmers={farmers}
              purchases={purchases}
              summary={summary}
              onCreateFarmer={handleCreateFarmer}
              onCreatePurchase={handleCreatePurchase}
              onDeletePurchase={handleDeletePurchase}
            />
          )}
          {activeTab === 'processing' && (
            <ProcessingView
              batches={batches}
              summary={summary}
              onStartBatch={handleStartBatch}
              onCompleteBatch={handleCompleteBatch}
            />
          )}
          {activeTab === 'sales' && (
            <SalesView
              sales={sales}
              gradeLots={gradeLots}
              summary={summary}
              onCreateSale={handleCreateSale}
              onDeleteSale={handleDeleteSale}
            />
          )}
          {activeTab === 'ledger' && <LedgerView entries={ledger} />}
        </>
      )}
    </Layout>
  );
}
