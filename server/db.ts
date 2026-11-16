import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  BatchAllocation,
  BatchAnalyticsRow,
  BatchGradeLot,
  CocoaGrade,
  DashboardSummary,
  Farmer,
  FreshPurchase,
  GradeStockSummary,
  ProcessingBatch,
  RawMaterialType,
  SalesDispatch,
  StockLedgerEntry,
} from '../src/types.ts';

function resolveWritableDataDir(): string {
  const preferred = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(preferred)) {
      fs.mkdirSync(preferred, { recursive: true });
    }
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'cacaoflow-data');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

const DATA_DIR = resolveWritableDataDir();
const DB_PATH = path.join(DATA_DIR, 'cacao.db');
const MIGRATION_PATH = path.resolve(process.cwd(), 'migrations', '0001_init.sql');

export const db = new DatabaseSync(DB_PATH);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function hasColumn(tableName: string, colName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === colName);
}

function upgradeExistingSchemaIfNeeded(): void {
  // Add wet_stock columns & raw_type columns safely for existing DBs
  if (!hasColumn('stock_state', 'wet_stock_kg')) {
    db.exec('ALTER TABLE stock_state ADD COLUMN wet_stock_kg REAL NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE stock_state ADD COLUMN wet_stock_value REAL NOT NULL DEFAULT 0');
  }
  if (!hasColumn('fresh_purchases', 'raw_type')) {
    db.exec("ALTER TABLE fresh_purchases ADD COLUMN raw_type TEXT NOT NULL DEFAULT 'POD'");
  }
  if (!hasColumn('processing_batches', 'wet_purchased_used_kg')) {
    db.exec('ALTER TABLE processing_batches ADD COLUMN wet_purchased_used_kg REAL NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE processing_batches ADD COLUMN wet_cost_allocated REAL NOT NULL DEFAULT 0');
  }

  const bgsRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='batch_grade_stock'")
    .get() as { sql: string } | undefined;

  if (bgsRow && !bgsRow.sql.includes("'BULK'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    withTransaction(() => {
      db.exec(`
        CREATE TABLE batch_grade_stock_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id INTEGER NOT NULL,
          grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'BULK')),
          initial_kg REAL NOT NULL,
          remaining_kg REAL NOT NULL,
          cost_per_kg REAL NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES processing_batches(id)
        );
        INSERT INTO batch_grade_stock_new (id, batch_id, grade, initial_kg, remaining_kg, cost_per_kg)
        SELECT id, batch_id, grade, initial_kg, remaining_kg, cost_per_kg FROM batch_grade_stock;
        DROP TABLE batch_grade_stock;
        ALTER TABLE batch_grade_stock_new RENAME TO batch_grade_stock;

        CREATE TABLE sales_dispatches_new (
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
        INSERT INTO sales_dispatches_new
        SELECT * FROM sales_dispatches;
        DROP TABLE sales_dispatches;
        ALTER TABLE sales_dispatches_new RENAME TO sales_dispatches;
      `);

      const batchesWithBulk = db
        .prepare("SELECT * FROM processing_batches WHERE status = 'completed' AND bulk_loss_kg > 0")
        .all() as unknown as ProcessingBatch[];

      for (const b of batchesWithBulk) {
        const existingBulkLot = db
          .prepare("SELECT id FROM batch_grade_stock WHERE batch_id = ? AND grade = 'BULK'")
          .get(b.id);
        if (!existingBulkLot) {
          const totalCost = round2(b.fresh_cost_allocated + (b.wet_cost_allocated ?? 0) + b.processing_expense);
          const totalWithBulk = round2(b.grade_a_kg + b.grade_b_kg + b.grade_c_kg + b.bulk_loss_kg);
          const unifiedCost = totalWithBulk > 0 ? round2(totalCost / totalWithBulk) : 0;
          const bulkVal = round2(b.bulk_loss_kg * unifiedCost);

          db.prepare(
            `UPDATE processing_batches
             SET dried_total_kg = ?, cost_per_dried_kg = ?, bulk_loss_value = ?
             WHERE id = ?`
          ).run(totalWithBulk, unifiedCost, bulkVal, b.id);

          db.prepare('UPDATE batch_grade_stock SET cost_per_kg = ? WHERE batch_id = ?').run(unifiedCost, b.id);
          db.prepare(
            `INSERT INTO batch_grade_stock (batch_id, grade, initial_kg, remaining_kg, cost_per_kg)
             VALUES (?, 'BULK', ?, ?, ?)`
          ).run(b.id, b.bulk_loss_kg, b.bulk_loss_kg, unifiedCost);
        }
      }
    });
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

export function initDatabase(): void {
  // Ensure existing tables don't fail if migration runs on pre-upgrade DB
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_state'")
    .get();
  if (!tableExists) {
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    db.exec(migrationSql);
  }
  upgradeExistingSchemaIfNeeded();
  seedInitialDataIfEmpty();
}

function nextCode(prefix: string, dateStr: string, table: string, col: string): string {
  const compactDate = dateStr.replace(/-/g, '');
  const pattern = `${prefix}-${compactDate}-%`;
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} LIKE ?`)
    .get(pattern) as { cnt: number };
  const seq = String((row?.cnt ?? 0) + 1).padStart(3, '0');
  return `${prefix}-${compactDate}-${seq}`;
}

function getRawStockState(): {
  fresh_stock_kg: number;
  fresh_stock_value: number;
  wet_stock_kg: number;
  wet_stock_value: number;
} {
  const row = db
    .prepare('SELECT fresh_stock_kg, fresh_stock_value, wet_stock_kg, wet_stock_value FROM stock_state WHERE id = 1')
    .get() as
    | { fresh_stock_kg: number; fresh_stock_value: number; wet_stock_kg: number; wet_stock_value: number }
    | undefined;
  return row ?? { fresh_stock_kg: 0, fresh_stock_value: 0, wet_stock_kg: 0, wet_stock_value: 0 };
}

function seedInitialDataIfEmpty(): void {
  const farmerCount = (db.prepare('SELECT COUNT(*) as cnt FROM farmers').get() as { cnt: number }).cnt;
  if (farmerCount > 0) return;

  const f1 = createFarmer({ name: 'คุณสมชาย ใจดี (สวนแม่ริม)', phone: '081-442-8891', location: 'อ.แม่ริม จ.เชียงใหม่' });
  const f2 = createFarmer({ name: 'วิสาหกิจชุมชนโกโก้ดอยสะเก็ด', phone: '089-712-3045', location: 'อ.ดอยสะเก็ด จ.เชียงใหม่' });
  const f3 = createFarmer({ name: 'คุณวิภาวรรณ แสนสุข', phone: '086-918-4510', location: 'อ.ปาย จ.แม่ฮ่องสอน' });

  createPurchase({
    scheduledDate: '2026-10-28',
    farmerId: f1.id,
    rawType: 'POD',
    weightKg: 420,
    pricePerKg: 14,
    notes: 'ผลสดสุกจัด รอบรับซื้อวันอังคาร',
  });
  createPurchase({
    scheduledDate: '2026-10-28',
    farmerId: f2.id,
    rawType: 'POD',
    weightKg: 380,
    pricePerKg: 15,
    notes: 'คัดไซส์ใหญ่ เปลือกบาง',
  });
  createPurchase({
    scheduledDate: '2026-11-05',
    farmerId: f3.id,
    rawType: 'POD',
    weightKg: 510,
    pricePerKg: 14.5,
    notes: 'รับซื้อลานหน้าโรงงาน',
  });
  createPurchase({
    scheduledDate: '2026-11-12',
    farmerId: f1.id,
    rawType: 'POD',
    weightKg: 260,
    pricePerKg: 15,
    notes: 'ผลสดรอบล่าสุด เตรียมเข้าหมัก',
  });
  createPurchase({
    scheduledDate: '2026-11-13',
    farmerId: f2.id,
    rawType: 'WET_BEAN',
    weightKg: 85,
    pricePerKg: 42,
    notes: 'เมล็ดสดแกะจากสวนแล้ว พร้อมเข้าถังหมัก',
  });

  const b1 = startBatch({
    startedDate: '2026-10-29',
    freshUsedKg: 600,
    wetPurchasedUsedKg: 0,
    wetBeanKg: 215,
    processingExpense: 1800,
    notes: 'ถังหมักไม้ 1-2 หมัก 6 วัน พลิกกลับทุก 48 ชม.',
  });
  completeBatch(b1.id, {
    completedDate: '2026-11-06',
    bulkLossKg: 6,
    gradeAKg: 52,
    gradeBKg: 19,
    gradeCKg: 8,
    extraExpense: 400,
    notes: 'ตากแดดโรงเรือน 6 วัน คัดเกรด A/B/C และปัดเมล็ดตกเกรดเป็น Bulk เข้าคลัง',
  });

  const b2 = startBatch({
    startedDate: '2026-11-06',
    freshUsedKg: 500,
    wetPurchasedUsedKg: 0,
    wetBeanKg: 175,
    processingExpense: 1500,
    notes: 'หมักช่วงฝนตก อุณหภูมิถังขึ้นช้า',
  });
  completeBatch(b2.id, {
    completedDate: '2026-11-13',
    bulkLossKg: 16,
    gradeAKg: 31,
    gradeBKg: 17,
    gradeCKg: 11,
    extraExpense: 300,
    notes: 'คัดแยกเมล็ดสีไม่สม่ำเสมอหลังตากแห้งปัดเป็นเกรด Bulk เข้าสต๊อก',
  });

  startBatch({
    startedDate: '2026-11-14',
    freshUsedKg: 310,
    wetPurchasedUsedKg: 0,
    wetBeanKg: 112,
    processingExpense: 950,
    notes: 'กำลังหมักวันที่ 2 ในลังไม้หมายเลข 3',
  });

  createSale({
    dispatchDate: '2026-11-09',
    customerName: 'บจก. สยามคราฟท์ช็อกโกแลต',
    grade: 'A',
    weightKg: 40,
    pricePerKg: 295,
    preferredBatchId: b1.id,
    notes: 'ส่งขนส่งควบคุมความชื้น กระสอบ 40 กก.',
  });
  createSale({
    dispatchDate: '2026-11-14',
    customerName: 'โรงคั่วคาเคาเชียงใหม่',
    grade: 'B',
    weightKg: 25,
    pricePerKg: 210,
    notes: 'ชำระเงินโอนเต็มจำนวนแล้ว',
  });
}

export function listFarmers(): Farmer[] {
  return db
    .prepare(
      `
      SELECT f.*,
        COUNT(p.id) as total_purchases,
        COALESCE(SUM(p.weight_kg), 0) as total_weight_kg,
        COALESCE(SUM(CASE WHEN p.raw_type = 'POD' THEN p.weight_kg ELSE 0 END), 0) as total_pod_kg,
        COALESCE(SUM(CASE WHEN p.raw_type = 'WET_BEAN' THEN p.weight_kg ELSE 0 END), 0) as total_wet_kg,
        COALESCE(SUM(p.total_cost), 0) as total_spent
      FROM farmers f
      LEFT JOIN fresh_purchases p ON p.farmer_id = f.id
      GROUP BY f.id
      ORDER BY f.name ASC
      `
    )
    .all() as unknown as Farmer[];
}

export function createFarmer(input: { name: string; phone?: string; location?: string }): Farmer {
  const name = input.name.trim();
  if (!name) throw new Error('กรุณาระบุชื่อเกษตรกร');
  const createdAt = nowIso();
  const res = db
    .prepare('INSERT INTO farmers (name, phone, location, created_at) VALUES (?, ?, ?, ?)')
    .run(name, (input.phone ?? '').trim(), (input.location ?? '').trim(), createdAt);
  return db.prepare('SELECT * FROM farmers WHERE id = ?').get(Number(res.lastInsertRowid)) as unknown as Farmer;
}

export function listPurchases(filters?: {
  date?: string;
  farmerId?: number;
  rawType?: RawMaterialType;
}): FreshPurchase[] {
  let sql = `
    SELECT p.*, f.name as farmer_name, f.location as farmer_location
    FROM fresh_purchases p
    JOIN farmers f ON f.id = p.farmer_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (filters?.date) {
    sql += ' AND p.scheduled_date = ?';
    params.push(filters.date);
  }
  if (filters?.farmerId) {
    sql += ' AND p.farmer_id = ?';
    params.push(filters.farmerId);
  }
  if (filters?.rawType) {
    sql += ' AND p.raw_type = ?';
    params.push(filters.rawType);
  }
  sql += ' ORDER BY p.scheduled_date DESC, p.id DESC';
  return db.prepare(sql).all(...params) as unknown as FreshPurchase[];
}

export function createPurchase(input: {
  scheduledDate: string;
  farmerId: number;
  rawType?: RawMaterialType;
  weightKg: number;
  pricePerKg: number;
  notes?: string;
}): FreshPurchase {
  const rawType: RawMaterialType = input.rawType === 'WET_BEAN' ? 'WET_BEAN' : 'POD';
  const weightKg = round2(Number(input.weightKg));
  const pricePerKg = round2(Number(input.pricePerKg));
  if (!input.scheduledDate) throw new Error('กรุณาระบุวันที่มีการกำหนดรับซื้อ');
  if (!input.farmerId) throw new Error('กรุณาเลือกเกษตรกร');
  if (!(weightKg > 0)) throw new Error('น้ำหนักรับเข้าต้องมากกว่า 0 กก.');
  if (pricePerKg < 0) throw new Error('ราคาต่อกิโลกรัมต้องไม่ติดลบ');

  return withTransaction(() => {
    const farmer = db.prepare('SELECT id, name FROM farmers WHERE id = ?').get(input.farmerId) as
      | { id: number; name: string }
      | undefined;
    if (!farmer) throw new Error('ไม่พบข้อมูลเกษตรกรที่เลือก');

    const totalCost = round2(weightKg * pricePerKg);
    const prefix = rawType === 'WET_BEAN' ? 'WB' : 'PO';
    const code = nextCode(prefix, input.scheduledDate, 'fresh_purchases', 'purchase_code');
    const createdAt = nowIso();

    const res = db
      .prepare(
        `INSERT INTO fresh_purchases (purchase_code, scheduled_date, farmer_id, raw_type, weight_kg, price_per_kg, total_cost, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        input.scheduledDate,
        farmer.id,
        rawType,
        weightKg,
        pricePerKg,
        totalCost,
        (input.notes ?? '').trim(),
        createdAt
      );

    if (rawType === 'WET_BEAN') {
      db.prepare(
        `UPDATE stock_state
         SET wet_stock_kg = ROUND(wet_stock_kg + ?, 2),
             wet_stock_value = ROUND(wet_stock_value + ?, 2),
             updated_at = ?
         WHERE id = 1`
      ).run(weightKg, totalCost, createdAt);
    } else {
      db.prepare(
        `UPDATE stock_state
         SET fresh_stock_kg = ROUND(fresh_stock_kg + ?, 2),
             fresh_stock_value = ROUND(fresh_stock_value + ?, 2),
             updated_at = ?
         WHERE id = 1`
      ).run(weightKg, totalCost, createdAt);
    }

    const itemCategory = rawType === 'WET_BEAN' ? 'เมล็ดสด' : 'ผลสด';
    const titleLabel =
      rawType === 'WET_BEAN'
        ? `รับซื้อเมล็ดโกโก้สด (${pricePerKg.toLocaleString('th-TH')} ฿/กก.)`
        : `รับซื้อผลโกโก้สด (${pricePerKg.toLocaleString('th-TH')} ฿/กก.)`;

    db.prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'PURCHASE_FRESH', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.scheduledDate,
      code,
      titleLabel,
      farmer.name,
      itemCategory,
      weightKg,
      -totalCost,
      (input.notes ?? '').trim(),
      createdAt
    );

    return db
      .prepare(
        `SELECT p.*, f.name as farmer_name, f.location as farmer_location
         FROM fresh_purchases p JOIN farmers f ON f.id = p.farmer_id WHERE p.id = ?`
      )
      .get(Number(res.lastInsertRowid)) as unknown as FreshPurchase;
  });
}

export function deletePurchase(id: number): void {
  withTransaction(() => {
    const purchase = db
      .prepare(
        `SELECT p.*, f.name as farmer_name FROM fresh_purchases p JOIN farmers f ON f.id = p.farmer_id WHERE p.id = ?`
      )
      .get(id) as unknown as FreshPurchase | undefined;
    if (!purchase) throw new Error('ไม่พบรายการรับซื้อ');

    const state = getRawStockState();
    const isWet = purchase.raw_type === 'WET_BEAN';
    const avail = isWet ? state.wet_stock_kg : state.fresh_stock_kg;
    if (avail + 0.001 < purchase.weight_kg) {
      throw new Error(
        `ไม่สามารถลบรายการรับซื้อนี้ได้ เนื่องจาก${isWet ? 'เมล็ดสด' : 'ผลสด'}ถูกเบิกเข้าหมักแปรรูปไปแล้ว`
      );
    }

    const createdAt = nowIso();
    if (isWet) {
      db.prepare(
        `UPDATE stock_state
         SET wet_stock_kg = MAX(0, ROUND(wet_stock_kg - ?, 2)),
             wet_stock_value = MAX(0, ROUND(wet_stock_value - ?, 2)),
             updated_at = ?
         WHERE id = 1`
      ).run(purchase.weight_kg, purchase.total_cost, createdAt);
    } else {
      db.prepare(
        `UPDATE stock_state
         SET fresh_stock_kg = MAX(0, ROUND(fresh_stock_kg - ?, 2)),
             fresh_stock_value = MAX(0, ROUND(fresh_stock_value - ?, 2)),
             updated_at = ?
         WHERE id = 1`
      ).run(purchase.weight_kg, purchase.total_cost, createdAt);
    }

    db.prepare('DELETE FROM fresh_purchases WHERE id = ?').run(id);

    db.prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'VOID_REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      createdAt.slice(0, 10),
      purchase.purchase_code,
      isWet ? 'ยกเลิกรายการรับซื้อเมล็ดสด' : 'ยกเลิกรายการรับซื้อผลสด',
      purchase.farmer_name,
      isWet ? 'เมล็ดสด' : 'ผลสด',
      -purchase.weight_kg,
      purchase.total_cost,
      'คืนสต๊อกและยอดเงินจากการลบรายการ',
      createdAt
    );
  });
}

export function listBatches(): ProcessingBatch[] {
  return db
    .prepare('SELECT * FROM processing_batches ORDER BY status ASC, started_date DESC, id DESC')
    .all() as unknown as ProcessingBatch[];
}

export function listBatchGradeLots(): BatchGradeLot[] {
  return db
    .prepare(
      `SELECT bgs.id, bgs.batch_id, b.batch_code, b.started_date, b.completed_date,
              bgs.grade, bgs.initial_kg, bgs.remaining_kg, bgs.cost_per_kg
       FROM batch_grade_stock bgs
       JOIN processing_batches b ON b.id = bgs.batch_id
       WHERE bgs.remaining_kg > 0.001
       ORDER BY b.completed_date ASC, bgs.id ASC`
    )
    .all() as unknown as BatchGradeLot[];
}

export function startBatch(input: {
  startedDate: string;
  freshUsedKg?: number;
  wetPurchasedUsedKg?: number;
  wetBeanKg: number;
  processingExpense?: number;
  notes?: string;
}): ProcessingBatch {
  const freshUsedKg = round2(Number(input.freshUsedKg ?? 0));
  const wetPurchasedUsedKg = round2(Number(input.wetPurchasedUsedKg ?? 0));
  const wetBeanKg = round2(Number(input.wetBeanKg));
  const processingExpense = round2(Number(input.processingExpense ?? 0));

  if (!input.startedDate) throw new Error('กรุณาระบุวันที่เริ่มแปรรูป');
  if (freshUsedKg < 0 || wetPurchasedUsedKg < 0) throw new Error('น้ำหนักที่เบิกใช้ต้องไม่ติดลบ');
  if (freshUsedKg <= 0 && wetPurchasedUsedKg <= 0) {
    throw new Error('กรุณาระบุน้ำหนักผลสด หรือ เมล็ดสดที่เบิกใช้เข้าหมักอย่างน้อย 1 รายการ');
  }
  if (!(wetBeanKg > 0)) throw new Error('น้ำหนักเมล็ดสดรวมที่เข้าถังหมักต้องมากกว่า 0 กก.');
  if (processingExpense < 0) throw new Error('ค่าใช้จ่ายแปรรูปต้องไม่ติดลบ');

  return withTransaction(() => {
    const state = getRawStockState();
    if (freshUsedKg > 0 && state.fresh_stock_kg + 0.001 < freshUsedKg) {
      throw new Error(
        `สต๊อกผลสดคงเหลือไม่เพียงพอ (คงเหลือ ${state.fresh_stock_kg.toLocaleString('th-TH')} กก. แต่ต้องการเบิก ${freshUsedKg.toLocaleString('th-TH')} กก.)`
      );
    }
    if (wetPurchasedUsedKg > 0 && state.wet_stock_kg + 0.001 < wetPurchasedUsedKg) {
      throw new Error(
        `สต๊อกเมล็ดสดคงเหลือไม่เพียงพอ (คงเหลือ ${state.wet_stock_kg.toLocaleString('th-TH')} กก. แต่ต้องการเบิก ${wetPurchasedUsedKg.toLocaleString('th-TH')} กก.)`
      );
    }

    const avgFreshCost = state.fresh_stock_kg > 0 ? state.fresh_stock_value / state.fresh_stock_kg : 0;
    const freshCostAllocated =
      freshUsedKg > 0 ? round2(Math.min(state.fresh_stock_value, freshUsedKg * avgFreshCost)) : 0;

    const avgWetCost = state.wet_stock_kg > 0 ? state.wet_stock_value / state.wet_stock_kg : 0;
    const wetCostAllocated =
      wetPurchasedUsedKg > 0 ? round2(Math.min(state.wet_stock_value, wetPurchasedUsedKg * avgWetCost)) : 0;

    const createdAt = nowIso();
    const batchCode = nextCode('BATCH', input.startedDate, 'processing_batches', 'batch_code');

    db.prepare(
      `UPDATE stock_state
       SET fresh_stock_kg = MAX(0, ROUND(fresh_stock_kg - ?, 2)),
           fresh_stock_value = MAX(0, ROUND(fresh_stock_value - ?, 2)),
           wet_stock_kg = MAX(0, ROUND(wet_stock_kg - ?, 2)),
           wet_stock_value = MAX(0, ROUND(wet_stock_value - ?, 2)),
           updated_at = ?
       WHERE id = 1`
    ).run(freshUsedKg, freshCostAllocated, wetPurchasedUsedKg, wetCostAllocated, createdAt);

    const res = db
      .prepare(
        `INSERT INTO processing_batches (
          batch_code, started_date, status, fresh_used_kg, fresh_cost_allocated,
          wet_purchased_used_kg, wet_cost_allocated, wet_bean_kg, processing_expense, notes, created_at
        ) VALUES (?, ?, 'fermenting', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        batchCode,
        input.startedDate,
        freshUsedKg,
        freshCostAllocated,
        wetPurchasedUsedKg,
        wetCostAllocated,
        wetBeanKg,
        processingExpense,
        (input.notes ?? '').trim(),
        createdAt
      );

    if (freshUsedKg > 0) {
      db.prepare(
        `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
         VALUES (?, 'START_FERMENT', ?, ?, ?, 'ผลสด (ตัดเบิกเข้าหมัก)', ?, ?, ?, ?)`
      ).run(
        input.startedDate,
        batchCode,
        `ตัดสต๊อกผลสดเข้าหมัก -> เมล็ดรวม ${wetBeanKg.toLocaleString('th-TH')} กก.`,
        batchCode,
        -freshUsedKg,
        wetPurchasedUsedKg > 0 ? 0 : -processingExpense,
        (input.notes ?? '').trim(),
        createdAt
      );
    }

    if (wetPurchasedUsedKg > 0) {
      db.prepare(
        `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
         VALUES (?, 'START_FERMENT', ?, ?, ?, 'เมล็ดสด (ตัดเบิกเข้าหมัก)', ?, ?, ?, ?)`
      ).run(
        input.startedDate,
        batchCode,
        `ตัดสต๊อกเมล็ดสดเข้าหมัก -> เมล็ดรวม ${wetBeanKg.toLocaleString('th-TH')} กก.`,
        batchCode,
        -wetPurchasedUsedKg,
        -processingExpense,
        (input.notes ?? '').trim(),
        createdAt
      );
    }

    return db
      .prepare('SELECT * FROM processing_batches WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as ProcessingBatch;
  });
}

export function completeBatch(
  batchId: number,
  input: {
    completedDate: string;
    bulkLossKg: number;
    gradeAKg: number;
    gradeBKg: number;
    gradeCKg: number;
    extraExpense?: number;
    notes?: string;
  }
): ProcessingBatch {
  const gradeBulkKg = round2(Number(input.bulkLossKg ?? 0));
  const gradeAKg = round2(Number(input.gradeAKg ?? 0));
  const gradeBKg = round2(Number(input.gradeBKg ?? 0));
  const gradeCKg = round2(Number(input.gradeCKg ?? 0));
  const extraExpense = round2(Number(input.extraExpense ?? 0));
  const driedTotalKg = round2(gradeAKg + gradeBKg + gradeCKg + gradeBulkKg);

  if (!input.completedDate) throw new Error('กรุณาระบุวันที่ตากแห้งและคัดเกรดเสร็จ');
  if (gradeBulkKg < 0 || gradeAKg < 0 || gradeBKg < 0 || gradeCKg < 0 || extraExpense < 0) {
    throw new Error('ค่าน้ำหนักและค่าใช้จ่ายต้องไม่ติดลบ');
  }
  if (driedTotalKg <= 0) {
    throw new Error('กรุณากรอกน้ำหนักโกโก้แห้งคัดเกรด (A, B, C หรือ Bulk) อย่างน้อย 1 รายการ');
  }

  return withTransaction(() => {
    const batch = db.prepare('SELECT * FROM processing_batches WHERE id = ?').get(batchId) as
      | ProcessingBatch
      | undefined;
    if (!batch) throw new Error('ไม่พบรอบการหมักที่เลือก');
    if (batch.status === 'completed') throw new Error('รอบการผลิตนี้ปิดยอดและคัดเกรดไปแล้ว');

    const totalProcessingExpense = round2(batch.processing_expense + extraExpense);
    const totalBatchCost = round2(
      batch.fresh_cost_allocated + (batch.wet_cost_allocated ?? 0) + totalProcessingExpense
    );

    const costPerDriedKg = round2(totalBatchCost / driedTotalKg);
    const bulkAllocatedCost = round2(gradeBulkKg * costPerDriedKg);

    const mergedNotes = [batch.notes, (input.notes ?? '').trim()].filter(Boolean).join(' · ');
    const createdAt = nowIso();

    db.prepare(
      `UPDATE processing_batches
       SET completed_date = ?,
           status = 'completed',
           processing_expense = ?,
           bulk_loss_kg = ?,
           bulk_loss_value = ?,
           grade_a_kg = ?,
           grade_b_kg = ?,
           grade_c_kg = ?,
           dried_total_kg = ?,
           cost_per_dried_kg = ?,
           notes = ?
       WHERE id = ?`
    ).run(
      input.completedDate,
      totalProcessingExpense,
      gradeBulkKg,
      bulkAllocatedCost,
      gradeAKg,
      gradeBKg,
      gradeCKg,
      driedTotalKg,
      costPerDriedKg,
      mergedNotes,
      batchId
    );

    const grades: Array<{ grade: CocoaGrade; label: string; kg: number }> = [
      { grade: 'A', label: 'โกโก้แห้ง เกรด A', kg: gradeAKg },
      { grade: 'B', label: 'โกโก้แห้ง เกรด B', kg: gradeBKg },
      { grade: 'C', label: 'โกโก้แห้ง เกรด C', kg: gradeCKg },
      { grade: 'BULK', label: 'โกโก้แห้ง เกรด Bulk', kg: gradeBulkKg },
    ];

    for (const g of grades) {
      if (g.kg > 0) {
        db.prepare(
          `INSERT INTO batch_grade_stock (batch_id, grade, initial_kg, remaining_kg, cost_per_kg)
           VALUES (?, ?, ?, ?, ?)`
        ).run(batchId, g.grade, g.kg, g.kg, costPerDriedKg);

        db.prepare(
          `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          input.completedDate,
          g.grade === 'BULK' ? 'BULK_LOSS' : 'COMPLETE_DRYING',
          batch.batch_code,
          g.grade === 'BULK'
            ? `คัดเกรดหลังตากแห้ง -> ปัดเป็นเกรด Bulk เข้าสต๊อก (ทุน ${costPerDriedKg.toLocaleString('th-TH')} ฿/กก.)`
            : `ตากแห้ง & คัดเกรดเข้าคลัง (ต้นทุน ${costPerDriedKg.toLocaleString('th-TH')} ฿/กก.)`,
          batch.batch_code,
          g.label,
          g.kg,
          0,
          (input.notes ?? '').trim(),
          createdAt
        );
      }
    }

    return db.prepare('SELECT * FROM processing_batches WHERE id = ?').get(batchId) as unknown as ProcessingBatch;
  });
}

export function listSales(): SalesDispatch[] {
  const rows = db.prepare('SELECT * FROM sales_dispatches ORDER BY dispatch_date DESC, id DESC').all() as Array<
    Omit<SalesDispatch, 'batch_allocations'> & { batch_allocations_json: string }
  >;
  return rows.map((r) => ({
    ...r,
    batch_allocations: JSON.parse(r.batch_allocations_json || '[]') as BatchAllocation[],
  }));
}

export function createSale(input: {
  dispatchDate: string;
  customerName: string;
  grade: CocoaGrade;
  weightKg: number;
  pricePerKg: number;
  preferredBatchId?: number;
  notes?: string;
}): SalesDispatch {
  const weightKg = round2(Number(input.weightKg));
  const pricePerKg = round2(Number(input.pricePerKg));
  const customerName = input.customerName.trim();
  if (!input.dispatchDate) throw new Error('กรุณาระบุวันที่จ่ายสินค้าออก');
  if (!customerName) throw new Error('กรุณาระบุชื่อลูกค้าหรือผู้รับซื้อ/เหตุผลการตัดสต๊อก');
  if (!['A', 'B', 'C', 'BULK'].includes(input.grade)) throw new Error('กรุณาเลือกเกรด A, B, C หรือ Bulk');
  if (!(weightKg > 0)) throw new Error('น้ำหนักที่จ่ายออกต้องมากกว่า 0 กก.');
  if (pricePerKg < 0) throw new Error('ราคาขายต่อกิโลกรัมต้องไม่ติดลบ');

  return withTransaction(() => {
    let availRows = db
      .prepare(
        `SELECT bgs.id, bgs.batch_id, b.batch_code, bgs.remaining_kg, bgs.cost_per_kg
         FROM batch_grade_stock bgs
         JOIN processing_batches b ON b.id = bgs.batch_id
         WHERE bgs.grade = ? AND bgs.remaining_kg > 0.001
         ORDER BY b.completed_date ASC, bgs.id ASC`
      )
      .all(input.grade) as Array<{
      id: number;
      batch_id: number;
      batch_code: string;
      remaining_kg: number;
      cost_per_kg: number;
    }>;

    if (input.preferredBatchId) {
      const targetRow = availRows.find((r) => r.batch_id === input.preferredBatchId);
      if (!targetRow) {
        throw new Error(`ไม่พบสต๊อกเกรด ${input.grade} คงเหลือในรอบผลิตที่เลือก`);
      }
      if (targetRow.remaining_kg + 0.001 < weightKg) {
        throw new Error(
          `รอบ ${targetRow.batch_code} มีเกรด ${input.grade} คงเหลือเพียง ${targetRow.remaining_kg.toLocaleString('th-TH')} กก. (ต้องการตัด ${weightKg.toLocaleString('th-TH')} กก.)`
        );
      }
      availRows = [targetRow];
    }

    const totalAvail = round2(availRows.reduce((acc, r) => acc + r.remaining_kg, 0));
    if (totalAvail + 0.001 < weightKg) {
      throw new Error(
        `สต๊อกโกโก้แห้ง เกรด ${input.grade === 'BULK' ? 'Bulk' : input.grade} ไม่เพียงพอ (คงเหลือ ${totalAvail.toLocaleString('th-TH')} กก. แต่ต้องการจ่าย ${weightKg.toLocaleString('th-TH')} กก.)`
      );
    }

    let leftToDeduct = weightKg;
    let cogsTotal = 0;
    const allocations: BatchAllocation[] = [];

    for (const row of availRows) {
      if (leftToDeduct <= 0.0001) break;
      const take = round2(Math.min(row.remaining_kg, leftToDeduct));
      const cogs = round2(take * row.cost_per_kg);
      db.prepare('UPDATE batch_grade_stock SET remaining_kg = ROUND(remaining_kg - ?, 2) WHERE id = ?').run(
        take,
        row.id
      );
      allocations.push({
        batch_id: row.batch_id,
        batch_code: row.batch_code,
        kg: take,
        cost_per_kg: row.cost_per_kg,
        cogs,
      });
      cogsTotal = round2(cogsTotal + cogs);
      leftToDeduct = round2(leftToDeduct - take);
    }

    const totalRevenue = round2(weightKg * pricePerKg);
    const grossProfit = round2(totalRevenue - cogsTotal);
    const dispatchCode = nextCode('OUT', input.dispatchDate, 'sales_dispatches', 'dispatch_code');
    const createdAt = nowIso();
    const gradeLabel = input.grade === 'BULK' ? 'Bulk' : input.grade;

    const res = db
      .prepare(
        `INSERT INTO sales_dispatches (
          dispatch_code, dispatch_date, customer_name, grade, weight_kg, price_per_kg,
          total_revenue, cogs_total, gross_profit, batch_allocations_json, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dispatchCode,
        input.dispatchDate,
        customerName,
        input.grade,
        weightKg,
        pricePerKg,
        totalRevenue,
        cogsTotal,
        grossProfit,
        JSON.stringify(allocations),
        (input.notes ?? '').trim(),
        createdAt
      );

    db.prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'DISPATCH_SALE', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.dispatchDate,
      dispatchCode,
      pricePerKg === 0 && input.grade === 'BULK'
        ? 'ตัดทิ้ง/เคลียร์สต๊อกเกรด Bulk (ตัดขาดทุน)'
        : `จ่ายสินค้าออกจำหน่าย (${pricePerKg.toLocaleString('th-TH')} ฿/กก.)`,
      customerName,
      `โกโก้แห้ง เกรด ${gradeLabel}`,
      -weightKg,
      totalRevenue,
      (input.notes ?? '').trim(),
      createdAt
    );

    const created = db
      .prepare('SELECT * FROM sales_dispatches WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as Omit<SalesDispatch, 'batch_allocations'> & {
      batch_allocations_json: string;
    };
    return {
      ...created,
      batch_allocations: allocations,
    };
  });
}

export function deleteSale(id: number): void {
  withTransaction(() => {
    const sale = db.prepare('SELECT * FROM sales_dispatches WHERE id = ?').get(id) as
      | (Omit<SalesDispatch, 'batch_allocations'> & { batch_allocations_json: string })
      | undefined;
    if (!sale) throw new Error('ไม่พบรายการจ่ายสินค้า');

    const allocations = JSON.parse(sale.batch_allocations_json || '[]') as BatchAllocation[];
    for (const alloc of allocations) {
      db.prepare(
        'UPDATE batch_grade_stock SET remaining_kg = ROUND(remaining_kg + ?, 2) WHERE batch_id = ? AND grade = ?'
      ).run(alloc.kg, alloc.batch_id, sale.grade);
    }

    db.prepare('DELETE FROM sales_dispatches WHERE id = ?').run(id);
    const createdAt = nowIso();
    const gradeLabel = sale.grade === 'BULK' ? 'Bulk' : sale.grade;

    db.prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'VOID_REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      createdAt.slice(0, 10),
      sale.dispatch_code,
      'ยกเลิกรายการจ่ายสินค้า (คืนสต๊อกเกรด)',
      sale.customer_name,
      `โกโก้แห้ง เกรด ${gradeLabel}`,
      sale.weight_kg,
      -sale.total_revenue,
      'คืนยอดคงเหลือกลับเข้าคลังสินค้า',
      createdAt
    );
  });
}

export function listLedger(filters?: { txType?: string; search?: string; from?: string; to?: string }): StockLedgerEntry[] {
  let sql = 'SELECT * FROM stock_ledger WHERE 1=1';
  const params: string[] = [];

  if (filters?.txType && filters.txType !== 'ALL') {
    sql += ' AND tx_type = ?';
    params.push(filters.txType);
  }
  if (filters?.from) {
    sql += ' AND tx_date >= ?';
    params.push(filters.from);
  }
  if (filters?.to) {
    sql += ' AND tx_date <= ?';
    params.push(filters.to);
  }
  if (filters?.search) {
    const q = `%${filters.search.trim()}%`;
    sql += ' AND (ref_code LIKE ? OR title LIKE ? OR counterparty LIKE ? OR item_category LIKE ? OR notes LIKE ?)';
    params.push(q, q, q, q, q);
  }
  sql += ' ORDER BY tx_date DESC, id DESC LIMIT 300';
  return db.prepare(sql).all(...params) as unknown as StockLedgerEntry[];
}

export function getDashboardSummary(): DashboardSummary {
  const state = getRawStockState();
  const avgFreshCost = state.fresh_stock_kg > 0 ? round2(state.fresh_stock_value / state.fresh_stock_kg) : 0;
  const avgWetCost = state.wet_stock_kg > 0 ? round2(state.wet_stock_value / state.wet_stock_kg) : 0;

  const fermAgg = db
    .prepare(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(wet_bean_kg), 0) as wet_kg,
              COALESCE(SUM(fresh_cost_allocated + wet_cost_allocated + processing_expense), 0) as cost_val
       FROM processing_batches WHERE status = 'fermenting'`
    )
    .get() as { cnt: number; wet_kg: number; cost_val: number };

  const gradeRows = db
    .prepare(
      `SELECT grade,
              COALESCE(SUM(remaining_kg), 0) as remaining_kg,
              COALESCE(SUM(remaining_kg * cost_per_kg), 0) as stock_value
       FROM batch_grade_stock
       GROUP BY grade`
    )
    .all() as Array<{ grade: CocoaGrade; remaining_kg: number; stock_value: number }>;

  const gradeStocks: Record<CocoaGrade, GradeStockSummary> = {
    A: { grade: 'A', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    B: { grade: 'B', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    C: { grade: 'C', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    BULK: { grade: 'BULK', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
  };
  for (const r of gradeRows) {
    const kg = round2(r.remaining_kg);
    const val = round2(r.stock_value);
    gradeStocks[r.grade] = {
      grade: r.grade,
      remaining_kg: kg,
      stock_value: val,
      avg_cost_per_kg: kg > 0 ? round2(val / kg) : 0,
    };
  }

  const totalDriedKg = round2(
    gradeStocks.A.remaining_kg +
      gradeStocks.B.remaining_kg +
      gradeStocks.C.remaining_kg +
      gradeStocks.BULK.remaining_kg
  );
  const totalDriedVal = round2(
    gradeStocks.A.stock_value +
      gradeStocks.B.stock_value +
      gradeStocks.C.stock_value +
      gradeStocks.BULK.stock_value
  );

  const purchAgg = db
    .prepare('SELECT COALESCE(SUM(weight_kg), 0) as kg, COALESCE(SUM(total_cost), 0) as spend FROM fresh_purchases')
    .get() as { kg: number; spend: number };

  const batchAgg = db
    .prepare(
      `SELECT COALESCE(SUM(processing_expense), 0) as proc_exp,
              COALESCE(SUM(bulk_loss_kg), 0) as bulk_kg,
              COALESCE(SUM(bulk_loss_value), 0) as bulk_val
       FROM processing_batches`
    )
    .get() as { proc_exp: number; bulk_kg: number; bulk_val: number };

  const salesAgg = db
    .prepare(
      `SELECT COALESCE(SUM(weight_kg), 0) as kg,
              COALESCE(SUM(total_revenue), 0) as rev,
              COALESCE(SUM(cogs_total), 0) as cogs,
              COALESCE(SUM(gross_profit), 0) as gp
       FROM sales_dispatches`
    )
    .get() as { kg: number; rev: number; cogs: number; gp: number };

  const allSales = listSales();
  const batchSalesMap = new Map<number, { soldKg: number; revenue: number; cogs: number }>();
  for (const sale of allSales) {
    for (const alloc of sale.batch_allocations) {
      const prev = batchSalesMap.get(alloc.batch_id) ?? { soldKg: 0, revenue: 0, cogs: 0 };
      const allocatedRev = round2(alloc.kg * sale.price_per_kg);
      batchSalesMap.set(alloc.batch_id, {
        soldKg: round2(prev.soldKg + alloc.kg),
        revenue: round2(prev.revenue + allocatedRev),
        cogs: round2(prev.cogs + alloc.cogs),
      });
    }
  }

  const batches = listBatches();
  const batchGradeRemainingRows = db
    .prepare('SELECT batch_id, grade, remaining_kg, cost_per_kg FROM batch_grade_stock')
    .all() as Array<{ batch_id: number; grade: CocoaGrade; remaining_kg: number; cost_per_kg: number }>;

  const batchRemMap = new Map<
    number,
    { A: number; B: number; C: number; BULK: number; bulkVal: number; val: number }
  >();
  for (const r of batchGradeRemainingRows) {
    const entry = batchRemMap.get(r.batch_id) ?? { A: 0, B: 0, C: 0, BULK: 0, bulkVal: 0, val: 0 };
    entry[r.grade] = round2(entry[r.grade] + r.remaining_kg);
    const rowVal = r.remaining_kg * r.cost_per_kg;
    if (r.grade === 'BULK') entry.bulkVal = round2(entry.bulkVal + rowVal);
    entry.val = round2(entry.val + rowVal);
    batchRemMap.set(r.batch_id, entry);
  }

  const batchAnalytics: BatchAnalyticsRow[] = batches.map((b) => {
    const totalCost = round2(b.fresh_cost_allocated + (b.wet_cost_allocated ?? 0) + b.processing_expense);
    const salesInfo = batchSalesMap.get(b.id) ?? { soldKg: 0, revenue: 0, cogs: 0 };
    const remInfo = batchRemMap.get(b.id) ?? { A: 0, B: 0, C: 0, BULK: 0, bulkVal: 0, val: 0 };
    const baseInputKg = b.fresh_used_kg > 0 ? b.fresh_used_kg + (b.wet_purchased_used_kg ?? 0) : b.wet_bean_kg;
    const yieldPct = baseInputKg > 0 ? round2((b.dried_total_kg / baseInputKg) * 100) : 0;
    const realizedPnl = round2(salesInfo.revenue - salesInfo.cogs - remInfo.bulkVal);
    const netCycleBalance = round2(salesInfo.revenue - totalCost);

    return {
      id: b.id,
      batch_code: b.batch_code,
      started_date: b.started_date,
      completed_date: b.completed_date,
      status: b.status,
      fresh_used_kg: b.fresh_used_kg,
      wet_purchased_used_kg: b.wet_purchased_used_kg ?? 0,
      wet_bean_kg: b.wet_bean_kg,
      dried_total_kg: b.dried_total_kg,
      yield_percent: yieldPct,
      bulk_loss_kg: b.bulk_loss_kg,
      bulk_loss_value: b.bulk_loss_value,
      grade_a_kg: b.grade_a_kg,
      grade_b_kg: b.grade_b_kg,
      grade_c_kg: b.grade_c_kg,
      remaining_a_kg: remInfo.A,
      remaining_b_kg: remInfo.B,
      remaining_c_kg: remInfo.C,
      remaining_bulk_kg: remInfo.BULK,
      remaining_stock_value: remInfo.val,
      total_cost: totalCost,
      sold_kg: salesInfo.soldKg,
      realized_revenue: salesInfo.revenue,
      sold_cogs: salesInfo.cogs,
      realized_pnl: realizedPnl,
      net_cycle_balance: netCycleBalance,
    };
  });

  const netOperatingProfit = round2(salesAgg.gp - gradeStocks.BULK.stock_value);

  return {
    fresh_stock_kg: round2(state.fresh_stock_kg),
    fresh_stock_value: round2(state.fresh_stock_value),
    avg_fresh_cost_per_kg: avgFreshCost,
    wet_stock_kg: round2(state.wet_stock_kg),
    wet_stock_value: round2(state.wet_stock_value),
    avg_wet_cost_per_kg: avgWetCost,
    fermenting_batch_count: fermAgg.cnt,
    fermenting_wet_kg: round2(fermAgg.wet_kg),
    fermenting_cost_value: round2(fermAgg.cost_val),
    grade_stocks: gradeStocks,
    total_dried_stock_kg: totalDriedKg,
    total_dried_stock_value: totalDriedVal,
    totals: {
      total_purchase_kg: round2(purchAgg.kg),
      total_purchase_spend: round2(purchAgg.spend),
      total_processing_expense: round2(batchAgg.proc_exp),
      total_bulk_loss_kg: round2(batchAgg.bulk_kg),
      total_bulk_loss_value: round2(batchAgg.bulk_val),
      unsold_bulk_kg: gradeStocks.BULK.remaining_kg,
      unsold_bulk_value: gradeStocks.BULK.stock_value,
      total_sales_kg: round2(salesAgg.kg),
      total_sales_revenue: round2(salesAgg.rev),
      total_cogs: round2(salesAgg.cogs),
      total_gross_profit: round2(gpValue(salesAgg.gp)),
      net_operating_profit: netOperatingProfit,
    },
    batch_analytics: batchAnalytics,
  };
}

function gpValue(v: number): number {
  return v;
}
