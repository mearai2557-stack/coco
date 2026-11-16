-- Cloudflare D1 / SQLite Compatible Schema for Cocoa Processing Factory Inventory
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stock_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fresh_stock_kg REAL NOT NULL DEFAULT 0,
  fresh_stock_value REAL NOT NULL DEFAULT 0,
  wet_stock_kg REAL NOT NULL DEFAULT 0,
  wet_stock_value REAL NOT NULL DEFAULT 0,
  skip_sample_seed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO stock_state (id, fresh_stock_kg, fresh_stock_value, wet_stock_kg, wet_stock_value, skip_sample_seed, updated_at)
VALUES (1, 0, 0, 0, 0, 0, datetime('now'));

CREATE TABLE IF NOT EXISTS farmers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fresh_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_code TEXT NOT NULL UNIQUE,
  scheduled_date TEXT NOT NULL,
  farmer_id INTEGER NOT NULL,
  raw_type TEXT NOT NULL DEFAULT 'POD' CHECK (raw_type IN ('POD', 'WET_BEAN')),
  weight_kg REAL NOT NULL,
  price_per_kg REAL NOT NULL,
  total_cost REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (farmer_id) REFERENCES farmers(id)
);

CREATE TABLE IF NOT EXISTS processing_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  started_date TEXT NOT NULL,
  completed_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('fermenting', 'completed')),
  fresh_used_kg REAL NOT NULL DEFAULT 0,
  fresh_cost_allocated REAL NOT NULL DEFAULT 0,
  wet_purchased_used_kg REAL NOT NULL DEFAULT 0,
  wet_cost_allocated REAL NOT NULL DEFAULT 0,
  wet_bean_kg REAL NOT NULL,
  processing_expense REAL NOT NULL DEFAULT 0,
  bulk_loss_kg REAL NOT NULL DEFAULT 0,
  bulk_loss_value REAL NOT NULL DEFAULT 0,
  grade_a_kg REAL NOT NULL DEFAULT 0,
  grade_b_kg REAL NOT NULL DEFAULT 0,
  grade_c_kg REAL NOT NULL DEFAULT 0,
  dried_total_kg REAL NOT NULL DEFAULT 0,
  cost_per_dried_kg REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_grade_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'BULK')),
  initial_kg REAL NOT NULL,
  remaining_kg REAL NOT NULL,
  cost_per_kg REAL NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES processing_batches(id)
);

CREATE TABLE IF NOT EXISTS sales_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_code TEXT NOT NULL UNIQUE,
  dispatch_date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'BULK')),
  weight_kg REAL NOT NULL,
  price_per_kg REAL NOT NULL,
  total_revenue REAL NOT NULL,
  cogs_total REAL NOT NULL,
  gross_profit REAL NOT NULL,
  batch_allocations_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_date TEXT NOT NULL,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('PURCHASE_FRESH', 'START_FERMENT', 'COMPLETE_DRYING', 'BULK_LOSS', 'DISPATCH_SALE', 'VOID_REVERSAL')),
  ref_code TEXT NOT NULL,
  title TEXT NOT NULL,
  counterparty TEXT NOT NULL DEFAULT '',
  item_category TEXT NOT NULL,
  weight_delta_kg REAL NOT NULL,
  amount_thb REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON fresh_purchases(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON processing_batches(status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON stock_ledger(tx_date, id);
