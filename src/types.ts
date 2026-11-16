export type CocoaGrade = 'A' | 'B' | 'C' | 'BULK';

export type RawMaterialType = 'POD' | 'WET_BEAN';

export type LedgerTxType =
  | 'PURCHASE_FRESH'
  | 'START_FERMENT'
  | 'COMPLETE_DRYING'
  | 'BULK_LOSS'
  | 'DISPATCH_SALE'
  | 'VOID_REVERSAL';

export interface Farmer {
  id: number;
  name: string;
  phone: string;
  location: string;
  created_at: string;
  total_purchases?: number;
  total_weight_kg?: number;
  total_pod_kg?: number;
  total_wet_kg?: number;
  total_spent?: number;
}

export interface FreshPurchase {
  id: number;
  purchase_code: string;
  scheduled_date: string;
  farmer_id: number;
  farmer_name: string;
  farmer_location?: string;
  raw_type: RawMaterialType;
  weight_kg: number;
  price_per_kg: number;
  total_cost: number;
  notes: string;
  created_at: string;
}

export interface ProcessingBatch {
  id: number;
  batch_code: string;
  started_date: string;
  completed_date: string | null;
  status: 'fermenting' | 'completed';
  fresh_used_kg: number;
  fresh_cost_allocated: number;
  wet_purchased_used_kg: number;
  wet_cost_allocated: number;
  wet_bean_kg: number;
  processing_expense: number;
  bulk_loss_kg: number;
  bulk_loss_value: number;
  grade_a_kg: number;
  grade_b_kg: number;
  grade_c_kg: number;
  dried_total_kg: number;
  cost_per_dried_kg: number;
  notes: string;
  created_at: string;
}

export interface BatchGradeLot {
  id: number;
  batch_id: number;
  batch_code: string;
  started_date: string;
  completed_date: string | null;
  grade: CocoaGrade;
  initial_kg: number;
  remaining_kg: number;
  cost_per_kg: number;
}

export interface BatchAllocation {
  batch_id: number;
  batch_code: string;
  kg: number;
  cost_per_kg: number;
  cogs: number;
}

export interface SalesDispatch {
  id: number;
  dispatch_code: string;
  dispatch_date: string;
  customer_name: string;
  grade: CocoaGrade;
  weight_kg: number;
  price_per_kg: number;
  total_revenue: number;
  cogs_total: number;
  gross_profit: number;
  batch_allocations: BatchAllocation[];
  notes: string;
  created_at: string;
}

export interface StockLedgerEntry {
  id: number;
  tx_date: string;
  tx_type: LedgerTxType;
  ref_code: string;
  title: string;
  counterparty: string;
  item_category: string;
  weight_delta_kg: number;
  amount_thb: number;
  notes: string;
  created_at: string;
}

export interface GradeStockSummary {
  grade: CocoaGrade;
  remaining_kg: number;
  stock_value: number;
  avg_cost_per_kg: number;
}

export interface BatchAnalyticsRow {
  id: number;
  batch_code: string;
  started_date: string;
  completed_date: string | null;
  status: 'fermenting' | 'completed';
  fresh_used_kg: number;
  wet_purchased_used_kg: number;
  wet_bean_kg: number;
  dried_total_kg: number;
  yield_percent: number;
  bulk_loss_kg: number;
  bulk_loss_value: number;
  grade_a_kg: number;
  grade_b_kg: number;
  grade_c_kg: number;
  remaining_a_kg: number;
  remaining_b_kg: number;
  remaining_c_kg: number;
  remaining_bulk_kg: number;
  remaining_stock_value: number;
  total_cost: number;
  sold_kg: number;
  realized_revenue: number;
  sold_cogs: number;
  realized_pnl: number;
  net_cycle_balance: number;
}

export interface DashboardSummary {
  fresh_stock_kg: number;
  fresh_stock_value: number;
  avg_fresh_cost_per_kg: number;
  wet_stock_kg: number;
  wet_stock_value: number;
  avg_wet_cost_per_kg: number;
  fermenting_batch_count: number;
  fermenting_wet_kg: number;
  fermenting_cost_value: number;
  grade_stocks: Record<CocoaGrade, GradeStockSummary>;
  total_dried_stock_kg: number;
  total_dried_stock_value: number;
  totals: {
    total_purchase_kg: number;
    total_purchase_spend: number;
    total_processing_expense: number;
    total_bulk_loss_kg: number;
    total_bulk_loss_value: number;
    unsold_bulk_kg: number;
    unsold_bulk_value: number;
    total_sales_kg: number;
    total_sales_revenue: number;
    total_cogs: number;
    total_gross_profit: number;
    net_operating_profit: number;
  };
  batch_analytics: BatchAnalyticsRow[];
}
