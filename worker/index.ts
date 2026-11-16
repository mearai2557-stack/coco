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
  SalesDispatch,
  StockLedgerEntry,
} from '../src/types';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ success: boolean; meta: { last_row_id?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS stock_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fresh_stock_kg REAL NOT NULL DEFAULT 0,
    fresh_stock_value REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO stock_state (id, fresh_stock_kg, fresh_stock_value, updated_at)
   VALUES (1, 0, 0, datetime('now'))`,
  `CREATE TABLE IF NOT EXISTS farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS fresh_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_code TEXT NOT NULL UNIQUE,
    scheduled_date TEXT NOT NULL,
    farmer_id INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    price_per_kg REAL NOT NULL,
    total_cost REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS processing_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL UNIQUE,
    started_date TEXT NOT NULL,
    completed_date TEXT,
    status TEXT NOT NULL CHECK (status IN ('fermenting', 'completed')),
    fresh_used_kg REAL NOT NULL,
    fresh_cost_allocated REAL NOT NULL,
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
  )`,
  `CREATE TABLE IF NOT EXISTS batch_grade_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'BULK')),
    initial_kg REAL NOT NULL,
    remaining_kg REAL NOT NULL,
    cost_per_kg REAL NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES processing_batches(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sales_dispatches (
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
  )`,
  `CREATE TABLE IF NOT EXISTS stock_ledger (
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
  )`,
];

let schemaReady = false;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function ensureSchemaAndSeed(db: D1Database): Promise<void> {
  if (!schemaReady) {
    await db.batch(DDL_STATEMENTS.map((sql) => db.prepare(sql)));
    schemaReady = true;
  }

  const row = await db.prepare('SELECT COUNT(*) as cnt FROM farmers').first<{ cnt: number }>();
  if ((row?.cnt ?? 0) === 0) {
    const f1 = await createFarmer(db, {
      name: 'คุณสมชาย ใจดี (สวนแม่ริม)',
      phone: '081-442-8891',
      location: 'อ.แม่ริม จ.เชียงใหม่',
    });
    const f2 = await createFarmer(db, {
      name: 'วิสาหกิจชุมชนโกโก้ดอยสะเก็ด',
      phone: '089-712-3045',
      location: 'อ.ดอยสะเก็ด จ.เชียงใหม่',
    });
    const f3 = await createFarmer(db, {
      name: 'คุณวิภาวรรณ แสนสุข',
      phone: '086-918-4510',
      location: 'อ.ปาย จ.แม่ฮ่องสอน',
    });

    await createPurchase(db, {
      scheduledDate: '2026-10-28',
      farmerId: f1.id,
      weightKg: 420,
      pricePerKg: 14,
      notes: 'ผลสดสุกจัด รอบรับซื้อวันอังคาร',
    });
    await createPurchase(db, {
      scheduledDate: '2026-10-28',
      farmerId: f2.id,
      weightKg: 380,
      pricePerKg: 15,
      notes: 'คัดไซส์ใหญ่ เปลือกบาง',
    });
    await createPurchase(db, {
      scheduledDate: '2026-11-05',
      farmerId: f3.id,
      weightKg: 510,
      pricePerKg: 14.5,
      notes: 'รับซื้อลานหน้าโรงงาน',
    });
    await createPurchase(db, {
      scheduledDate: '2026-11-12',
      farmerId: f1.id,
      weightKg: 260,
      pricePerKg: 15,
      notes: 'ผลสดรอบล่าสุด เตรียมเข้าหมัก',
    });

    const b1 = await startBatch(db, {
      startedDate: '2026-10-29',
      freshUsedKg: 600,
      wetBeanKg: 215,
      processingExpense: 1800,
      notes: 'ถังหมักไม้ 1-2 หมัก 6 วัน พลิกกลับทุก 48 ชม.',
    });
    await completeBatch(db, b1.id, {
      completedDate: '2026-11-06',
      bulkLossKg: 6,
      gradeAKg: 52,
      gradeBKg: 19,
      gradeCKg: 8,
      extraExpense: 400,
      notes: 'ตากแดดโรงเรือน 6 วัน คัดเกรด A/B/C และปัดเมล็ดตกเกรดเป็น Bulk เข้าคลัง',
    });

    const b2 = await startBatch(db, {
      startedDate: '2026-11-06',
      freshUsedKg: 500,
      wetBeanKg: 175,
      processingExpense: 1500,
      notes: 'หมักช่วงฝนตก อุณหภูมิถังขึ้นช้า',
    });
    await completeBatch(db, b2.id, {
      completedDate: '2026-11-13',
      bulkLossKg: 16,
      gradeAKg: 31,
      gradeBKg: 17,
      gradeCKg: 11,
      extraExpense: 300,
      notes: 'คัดแยกเมล็ดสีไม่สม่ำเสมอหลังตากแห้งปัดเป็นเกรด Bulk เข้าสต๊อก',
    });

    await startBatch(db, {
      startedDate: '2026-11-14',
      freshUsedKg: 310,
      wetBeanKg: 112,
      processingExpense: 950,
      notes: 'กำลังหมักวันที่ 2 ในลังไม้หมายเลข 3',
    });

    await createSale(db, {
      dispatchDate: '2026-11-09',
      customerName: 'บจก. สยามคราฟท์ช็อกโกแลต',
      grade: 'A',
      weightKg: 40,
      pricePerKg: 295,
      preferredBatchId: b1.id,
      notes: 'ส่งขนส่งควบคุมความชื้น กระสอบ 40 กก.',
    });
    await createSale(db, {
      dispatchDate: '2026-11-14',
      customerName: 'โรงคั่วคาเคาเชียงใหม่',
      grade: 'B',
      weightKg: 25,
      pricePerKg: 210,
      notes: 'ชำระเงินโอนเต็มจำนวนแล้ว',
    });
  }
}

async function nextCode(
  db: D1Database,
  prefix: string,
  dateStr: string,
  table: string,
  col: string
): Promise<string> {
  const compactDate = dateStr.replace(/-/g, '');
  const pattern = `${prefix}-${compactDate}-%`;
  const row = await db
    .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} LIKE ?`)
    .bind(pattern)
    .first<{ cnt: number }>();
  const seq = String((row?.cnt ?? 0) + 1).padStart(3, '0');
  return `${prefix}-${compactDate}-${seq}`;
}

async function getFreshStockState(
  db: D1Database
): Promise<{ fresh_stock_kg: number; fresh_stock_value: number }> {
  const row = await db
    .prepare('SELECT fresh_stock_kg, fresh_stock_value FROM stock_state WHERE id = 1')
    .first<{ fresh_stock_kg: number; fresh_stock_value: number }>();
  return row ?? { fresh_stock_kg: 0, fresh_stock_value: 0 };
}

async function listFarmers(db: D1Database): Promise<Farmer[]> {
  const res = await db
    .prepare(
      `SELECT f.*,
        COUNT(p.id) as total_purchases,
        COALESCE(SUM(p.weight_kg), 0) as total_weight_kg,
        COALESCE(SUM(p.total_cost), 0) as total_spent
      FROM farmers f
      LEFT JOIN fresh_purchases p ON p.farmer_id = f.id
      GROUP BY f.id
      ORDER BY f.name ASC`
    )
    .all<Farmer>();
  return res.results;
}

async function createFarmer(
  db: D1Database,
  input: { name: string; phone?: string; location?: string }
): Promise<Farmer> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('กรุณาระบุชื่อเกษตรกร');
  const createdAt = nowIso();
  const res = await db
    .prepare('INSERT INTO farmers (name, phone, location, created_at) VALUES (?, ?, ?, ?)')
    .bind(name, (input.phone ?? '').trim(), (input.location ?? '').trim(), createdAt)
    .run();
  const id = Number(res.meta.last_row_id);
  const farmer = await db.prepare('SELECT * FROM farmers WHERE id = ?').bind(id).first<Farmer>();
  return farmer!;
}

async function listPurchases(
  db: D1Database,
  filters?: { date?: string; farmerId?: number }
): Promise<FreshPurchase[]> {
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
  sql += ' ORDER BY p.scheduled_date DESC, p.id DESC';
  const res = await db.prepare(sql).bind(...params).all<FreshPurchase>();
  return res.results;
}

async function createPurchase(
  db: D1Database,
  input: {
    scheduledDate: string;
    farmerId: number;
    weightKg: number;
    pricePerKg: number;
    notes?: string;
  }
): Promise<FreshPurchase> {
  const weightKg = round2(Number(input.weightKg));
  const pricePerKg = round2(Number(input.pricePerKg));
  if (!input.scheduledDate) throw new Error('กรุณาระบุวันที่มีการกำหนดรับซื้อ');
  if (!input.farmerId) throw new Error('กรุณาเลือกเกษตรกร');
  if (!(weightKg > 0)) throw new Error('น้ำหนักรับเข้าต้องมากกว่า 0 กก.');
  if (pricePerKg < 0) throw new Error('ราคาต่อกิโลกรัมต้องไม่ติดลบ');

  const farmer = await db
    .prepare('SELECT id, name FROM farmers WHERE id = ?')
    .bind(input.farmerId)
    .first<{ id: number; name: string }>();
  if (!farmer) throw new Error('ไม่พบข้อมูลเกษตรกรที่เลือก');

  const totalCost = round2(weightKg * pricePerKg);
  const code = await nextCode(db, 'PO', input.scheduledDate, 'fresh_purchases', 'purchase_code');
  const createdAt = nowIso();

  const insertRes = await db
    .prepare(
      `INSERT INTO fresh_purchases (purchase_code, scheduled_date, farmer_id, weight_kg, price_per_kg, total_cost, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      code,
      input.scheduledDate,
      farmer.id,
      weightKg,
      pricePerKg,
      totalCost,
      (input.notes ?? '').trim(),
      createdAt
    )
    .run();

  await db.batch([
    db
      .prepare(
        `UPDATE stock_state
         SET fresh_stock_kg = ROUND(fresh_stock_kg + ?, 2),
             fresh_stock_value = ROUND(fresh_stock_value + ?, 2),
             updated_at = ?
         WHERE id = 1`
      )
      .bind(weightKg, totalCost, createdAt),
    db
      .prepare(
        `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
         VALUES (?, 'PURCHASE_FRESH', ?, ?, ?, 'ผลสด', ?, ?, ?, ?)`
      )
      .bind(
        input.scheduledDate,
        code,
        `รับซื้อผลโกโก้สด (${pricePerKg.toLocaleString('th-TH')} ฿/กก.)`,
        farmer.name,
        weightKg,
        -totalCost,
        (input.notes ?? '').trim(),
        createdAt
      ),
  ]);

  const row = await db
    .prepare(
      `SELECT p.*, f.name as farmer_name, f.location as farmer_location
       FROM fresh_purchases p JOIN farmers f ON f.id = p.farmer_id WHERE p.id = ?`
    )
    .bind(Number(insertRes.meta.last_row_id))
    .first<FreshPurchase>();
  return row!;
}

async function deletePurchase(db: D1Database, id: number): Promise<void> {
  const purchase = await db
    .prepare(
      `SELECT p.*, f.name as farmer_name FROM fresh_purchases p JOIN farmers f ON f.id = p.farmer_id WHERE p.id = ?`
    )
    .bind(id)
    .first<FreshPurchase>();
  if (!purchase) throw new Error('ไม่พบรายการรับซื้อ');

  const state = await getFreshStockState(db);
  if (state.fresh_stock_kg + 0.001 < purchase.weight_kg) {
    throw new Error('ไม่สามารถลบรายการรับซื้อนี้ได้ เนื่องจากผลสดถูกเบิกเข้าหมักแปรรูปไปแล้ว');
  }

  const createdAt = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE stock_state
         SET fresh_stock_kg = MAX(0, ROUND(fresh_stock_kg - ?, 2)),
             fresh_stock_value = MAX(0, ROUND(fresh_stock_value - ?, 2)),
             updated_at = ?
         WHERE id = 1`
      )
      .bind(purchase.weight_kg, purchase.total_cost, createdAt),
    db.prepare('DELETE FROM fresh_purchases WHERE id = ?').bind(id),
    db
      .prepare(
        `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
         VALUES (?, 'VOID_REVERSAL', ?, ?, ?, 'ผลสด', ?, ?, ?, ?)`
      )
      .bind(
        createdAt.slice(0, 10),
        purchase.purchase_code,
        'ยกเลิกรายการรับซื้อผลสด',
        purchase.farmer_name,
        -purchase.weight_kg,
        purchase.total_cost,
        'คืนสต๊อกและยอดเงินจากการลบรายการ',
        createdAt
      ),
  ]);
}

async function listBatches(db: D1Database): Promise<ProcessingBatch[]> {
  const res = await db
    .prepare('SELECT * FROM processing_batches ORDER BY status ASC, started_date DESC, id DESC')
    .all<ProcessingBatch>();
  return res.results;
}

async function listBatchGradeLots(db: D1Database): Promise<BatchGradeLot[]> {
  const res = await db
    .prepare(
      `SELECT bgs.id, bgs.batch_id, b.batch_code, b.started_date, b.completed_date,
              bgs.grade, bgs.initial_kg, bgs.remaining_kg, bgs.cost_per_kg
       FROM batch_grade_stock bgs
       JOIN processing_batches b ON b.id = bgs.batch_id
       WHERE bgs.remaining_kg > 0.001
       ORDER BY b.completed_date ASC, bgs.id ASC`
    )
    .all<BatchGradeLot>();
  return res.results;
}

async function startBatch(
  db: D1Database,
  input: {
    startedDate: string;
    freshUsedKg: number;
    wetBeanKg: number;
    processingExpense?: number;
    notes?: string;
  }
): Promise<ProcessingBatch> {
  const freshUsedKg = round2(Number(input.freshUsedKg));
  const wetBeanKg = round2(Number(input.wetBeanKg));
  const processingExpense = round2(Number(input.processingExpense ?? 0));

  if (!input.startedDate) throw new Error('กรุณาระบุวันที่เริ่มแปรรูป');
  if (!(freshUsedKg > 0)) throw new Error('น้ำหนักผลสดที่เบิกใช้ต้องมากกว่า 0 กก.');
  if (!(wetBeanKg > 0)) throw new Error('น้ำหนักเมล็ดสดเตรียมหมักต้องมากกว่า 0 กก.');
  if (processingExpense < 0) throw new Error('ค่าใช้จ่ายแปรรูปต้องไม่ติดลบ');

  const state = await getFreshStockState(db);
  if (state.fresh_stock_kg + 0.001 < freshUsedKg) {
    throw new Error(
      `สต๊อกผลสดคงเหลือไม่เพียงพอ (คงเหลือ ${state.fresh_stock_kg.toLocaleString('th-TH')} กก. แต่ต้องการเบิก ${freshUsedKg.toLocaleString('th-TH')} กก.)`
    );
  }

  const avgFreshCost = state.fresh_stock_kg > 0 ? state.fresh_stock_value / state.fresh_stock_kg : 0;
  const freshCostAllocated = round2(Math.min(state.fresh_stock_value, freshUsedKg * avgFreshCost));
  const createdAt = nowIso();
  const batchCode = await nextCode(db, 'BATCH', input.startedDate, 'processing_batches', 'batch_code');

  await db
    .prepare(
      `UPDATE stock_state
       SET fresh_stock_kg = MAX(0, ROUND(fresh_stock_kg - ?, 2)),
           fresh_stock_value = MAX(0, ROUND(fresh_stock_value - ?, 2)),
           updated_at = ?
       WHERE id = 1`
    )
    .bind(freshUsedKg, freshCostAllocated, createdAt)
    .run();

  const insertRes = await db
    .prepare(
      `INSERT INTO processing_batches (
        batch_code, started_date, status, fresh_used_kg, fresh_cost_allocated,
        wet_bean_kg, processing_expense, notes, created_at
      ) VALUES (?, ?, 'fermenting', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      batchCode,
      input.startedDate,
      freshUsedKg,
      freshCostAllocated,
      wetBeanKg,
      processingExpense,
      (input.notes ?? '').trim(),
      createdAt
    )
    .run();

  await db
    .prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'START_FERMENT', ?, ?, ?, 'ผลสด (ตัดเบิกเข้าหมัก)', ?, ?, ?, ?)`
    )
    .bind(
      input.startedDate,
      batchCode,
      `ตัดสต๊อกผลสดเข้าหมัก -> เมล็ดสด ${wetBeanKg.toLocaleString('th-TH')} กก.`,
      batchCode,
      -freshUsedKg,
      -processingExpense,
      (input.notes ?? '').trim(),
      createdAt
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM processing_batches WHERE id = ?')
    .bind(Number(insertRes.meta.last_row_id))
    .first<ProcessingBatch>();
  return row!;
}

async function completeBatch(
  db: D1Database,
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
): Promise<ProcessingBatch> {
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

  const batch = await db
    .prepare('SELECT * FROM processing_batches WHERE id = ?')
    .bind(batchId)
    .first<ProcessingBatch>();
  if (!batch) throw new Error('ไม่พบรอบการหมักที่เลือก');
  if (batch.status === 'completed') throw new Error('รอบการผลิตนี้ปิดยอดและคัดเกรดไปแล้ว');

  const totalProcessingExpense = round2(batch.processing_expense + extraExpense);
  const totalBatchCost = round2(batch.fresh_cost_allocated + totalProcessingExpense);
  const costPerDriedKg = round2(totalBatchCost / driedTotalKg);
  const bulkAllocatedCost = round2(gradeBulkKg * costPerDriedKg);
  const mergedNotes = [batch.notes, (input.notes ?? '').trim()].filter(Boolean).join(' · ');
  const createdAt = nowIso();

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
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
      )
      .bind(
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
      ),
  ];

  const grades: Array<{ grade: CocoaGrade; label: string; kg: number }> = [
    { grade: 'A', label: 'โกโก้แห้ง เกรด A', kg: gradeAKg },
    { grade: 'B', label: 'โกโก้แห้ง เกรด B', kg: gradeBKg },
    { grade: 'C', label: 'โกโก้แห้ง เกรด C', kg: gradeCKg },
    { grade: 'BULK', label: 'โกโก้แห้ง เกรด Bulk', kg: gradeBulkKg },
  ];

  for (const g of grades) {
    if (g.kg > 0) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO batch_grade_stock (batch_id, grade, initial_kg, remaining_kg, cost_per_kg)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(batchId, g.grade, g.kg, g.kg, costPerDriedKg),
        db
          .prepare(
            `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
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
          )
      );
    }
  }

  await db.batch(stmts);
  const updated = await db
    .prepare('SELECT * FROM processing_batches WHERE id = ?')
    .bind(batchId)
    .first<ProcessingBatch>();
  return updated!;
}

async function listSales(db: D1Database): Promise<SalesDispatch[]> {
  const res = await db
    .prepare('SELECT * FROM sales_dispatches ORDER BY dispatch_date DESC, id DESC')
    .all<Omit<SalesDispatch, 'batch_allocations'> & { batch_allocations_json: string }>();
  return res.results.map((r) => ({
    ...r,
    batch_allocations: JSON.parse(r.batch_allocations_json || '[]') as BatchAllocation[],
  }));
}

async function createSale(
  db: D1Database,
  input: {
    dispatchDate: string;
    customerName: string;
    grade: CocoaGrade;
    weightKg: number;
    pricePerKg: number;
    preferredBatchId?: number;
    notes?: string;
  }
): Promise<SalesDispatch> {
  const weightKg = round2(Number(input.weightKg));
  const pricePerKg = round2(Number(input.pricePerKg));
  const customerName = (input.customerName ?? '').trim();
  if (!input.dispatchDate) throw new Error('กรุณาระบุวันที่จ่ายสินค้าออก');
  if (!customerName) throw new Error('กรุณาระบุชื่อลูกค้าหรือผู้รับซื้อ/เหตุผลการตัดสต๊อก');
  if (!['A', 'B', 'C', 'BULK'].includes(input.grade)) throw new Error('กรุณาเลือกเกรด A, B, C หรือ Bulk');
  if (!(weightKg > 0)) throw new Error('น้ำหนักที่จ่ายออกต้องมากกว่า 0 กก.');
  if (pricePerKg < 0) throw new Error('ราคาขายต่อกิโลกรัมต้องไม่ติดลบ');

  const lotRes = await db
    .prepare(
      `SELECT bgs.id, bgs.batch_id, b.batch_code, bgs.remaining_kg, bgs.cost_per_kg
       FROM batch_grade_stock bgs
       JOIN processing_batches b ON b.id = bgs.batch_id
       WHERE bgs.grade = ? AND bgs.remaining_kg > 0.001
       ORDER BY b.completed_date ASC, bgs.id ASC`
    )
    .bind(input.grade)
    .all<{
      id: number;
      batch_id: number;
      batch_code: string;
      remaining_kg: number;
      cost_per_kg: number;
    }>();

  let availRows = lotRes.results;
  if (input.preferredBatchId) {
    const targetRow = availRows.find((r) => r.batch_id === input.preferredBatchId);
    if (!targetRow) throw new Error(`ไม่พบสต๊อกเกรด ${input.grade} คงเหลือในรอบผลิตที่เลือก`);
    if (targetRow.remaining_kg + 0.001 < weightKg) {
      throw new Error(
        `รอบ ${targetRow.batch_code} มีเกรด ${input.grade} คงเหลือเพียง ${targetRow.remaining_kg.toLocaleString('th-TH')} กก.`
      );
    }
    availRows = [targetRow];
  }

  const totalAvail = round2(availRows.reduce((acc, r) => acc + r.remaining_kg, 0));
  if (totalAvail + 0.001 < weightKg) {
    throw new Error(
      `สต๊อกโกโก้แห้ง เกรด ${input.grade === 'BULK' ? 'Bulk' : input.grade} ไม่เพียงพอ (คงเหลือ ${totalAvail.toLocaleString('th-TH')} กก.)`
    );
  }

  let leftToDeduct = weightKg;
  let cogsTotal = 0;
  const allocations: BatchAllocation[] = [];
  const updateStmts: D1PreparedStatement[] = [];

  for (const row of availRows) {
    if (leftToDeduct <= 0.0001) break;
    const take = round2(Math.min(row.remaining_kg, leftToDeduct));
    const cogs = round2(take * row.cost_per_kg);
    updateStmts.push(
      db
        .prepare('UPDATE batch_grade_stock SET remaining_kg = ROUND(remaining_kg - ?, 2) WHERE id = ?')
        .bind(take, row.id)
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
  const dispatchCode = await nextCode(db, 'OUT', input.dispatchDate, 'sales_dispatches', 'dispatch_code');
  const createdAt = nowIso();
  const gradeLabel = input.grade === 'BULK' ? 'Bulk' : input.grade;

  await db.batch(updateStmts);

  const insertRes = await db
    .prepare(
      `INSERT INTO sales_dispatches (
        dispatch_code, dispatch_date, customer_name, grade, weight_kg, price_per_kg,
        total_revenue, cogs_total, gross_profit, batch_allocations_json, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
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
    )
    .run();

  await db
    .prepare(
      `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
       VALUES (?, 'DISPATCH_SALE', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
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
    )
    .run();

  const created = await db
    .prepare('SELECT * FROM sales_dispatches WHERE id = ?')
    .bind(Number(insertRes.meta.last_row_id))
    .first<Omit<SalesDispatch, 'batch_allocations'> & { batch_allocations_json: string }>();
  return {
    ...created!,
    batch_allocations: allocations,
  };
}

async function deleteSale(db: D1Database, id: number): Promise<void> {
  const sale = await db
    .prepare('SELECT * FROM sales_dispatches WHERE id = ?')
    .bind(id)
    .first<Omit<SalesDispatch, 'batch_allocations'> & { batch_allocations_json: string }>();
  if (!sale) throw new Error('ไม่พบรายการจ่ายสินค้า');

  const allocations = JSON.parse(sale.batch_allocations_json || '[]') as BatchAllocation[];
  const createdAt = nowIso();
  const gradeLabel = sale.grade === 'BULK' ? 'Bulk' : sale.grade;

  const stmts: D1PreparedStatement[] = allocations.map((alloc) =>
    db
      .prepare('UPDATE batch_grade_stock SET remaining_kg = ROUND(remaining_kg + ?, 2) WHERE batch_id = ? AND grade = ?')
      .bind(alloc.kg, alloc.batch_id, sale.grade)
  );
  stmts.push(
    db.prepare('DELETE FROM sales_dispatches WHERE id = ?').bind(id),
    db
      .prepare(
        `INSERT INTO stock_ledger (tx_date, tx_type, ref_code, title, counterparty, item_category, weight_delta_kg, amount_thb, notes, created_at)
         VALUES (?, 'VOID_REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createdAt.slice(0, 10),
        sale.dispatch_code,
        'ยกเลิกรายการจ่ายสินค้า (คืนสต๊อกเกรด)',
        sale.customer_name,
        `โกโก้แห้ง เกรด ${gradeLabel}`,
        sale.weight_kg,
        -sale.total_revenue,
        'คืนยอดคงเหลือกลับเข้าคลังสินค้า',
        createdAt
      )
  );
  await db.batch(stmts);
}

async function listLedger(
  db: D1Database,
  filters?: { txType?: string; search?: string; from?: string; to?: string }
): Promise<StockLedgerEntry[]> {
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
  const res = await db.prepare(sql).bind(...params).all<StockLedgerEntry>();
  return res.results;
}

async function getDashboardSummary(db: D1Database): Promise<DashboardSummary> {
  const state = await getFreshStockState(db);
  const avgFreshCost = state.fresh_stock_kg > 0 ? round2(state.fresh_stock_value / state.fresh_stock_kg) : 0;

  const fermAgg = await db
    .prepare(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(wet_bean_kg), 0) as wet_kg,
              COALESCE(SUM(fresh_cost_allocated + processing_expense), 0) as cost_val
       FROM processing_batches WHERE status = 'fermenting'`
    )
    .first<{ cnt: number; wet_kg: number; cost_val: number }>();

  const gradeRes = await db
    .prepare(
      `SELECT grade,
              COALESCE(SUM(remaining_kg), 0) as remaining_kg,
              COALESCE(SUM(remaining_kg * cost_per_kg), 0) as stock_value
       FROM batch_grade_stock
       GROUP BY grade`
    )
    .all<{ grade: CocoaGrade; remaining_kg: number; stock_value: number }>();

  const gradeStocks: Record<CocoaGrade, GradeStockSummary> = {
    A: { grade: 'A', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    B: { grade: 'B', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    C: { grade: 'C', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
    BULK: { grade: 'BULK', remaining_kg: 0, stock_value: 0, avg_cost_per_kg: 0 },
  };
  for (const r of gradeRes.results) {
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

  const purchAgg = await db
    .prepare('SELECT COALESCE(SUM(weight_kg), 0) as kg, COALESCE(SUM(total_cost), 0) as spend FROM fresh_purchases')
    .first<{ kg: number; spend: number }>();

  const batchAgg = await db
    .prepare(
      `SELECT COALESCE(SUM(processing_expense), 0) as proc_exp,
              COALESCE(SUM(bulk_loss_kg), 0) as bulk_kg,
              COALESCE(SUM(bulk_loss_value), 0) as bulk_val
       FROM processing_batches`
    )
    .first<{ proc_exp: number; bulk_kg: number; bulk_val: number }>();

  const salesAgg = await db
    .prepare(
      `SELECT COALESCE(SUM(weight_kg), 0) as kg,
              COALESCE(SUM(total_revenue), 0) as rev,
              COALESCE(SUM(cogs_total), 0) as cogs,
              COALESCE(SUM(gross_profit), 0) as gp
       FROM sales_dispatches`
    )
    .first<{ kg: number; rev: number; cogs: number; gp: number }>();

  const allSales = await listSales(db);
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

  const batches = await listBatches(db);
  const bgsRes = await db
    .prepare('SELECT batch_id, grade, remaining_kg, cost_per_kg FROM batch_grade_stock')
    .all<{ batch_id: number; grade: CocoaGrade; remaining_kg: number; cost_per_kg: number }>();

  const batchRemMap = new Map<
    number,
    { A: number; B: number; C: number; BULK: number; bulkVal: number; val: number }
  >();
  for (const r of bgsRes.results) {
    const entry = batchRemMap.get(r.batch_id) ?? { A: 0, B: 0, C: 0, BULK: 0, bulkVal: 0, val: 0 };
    entry[r.grade] = round2(entry[r.grade] + r.remaining_kg);
    const rowVal = r.remaining_kg * r.cost_per_kg;
    if (r.grade === 'BULK') entry.bulkVal = round2(entry.bulkVal + rowVal);
    entry.val = round2(entry.val + rowVal);
    batchRemMap.set(r.batch_id, entry);
  }

  const batchAnalytics: BatchAnalyticsRow[] = batches.map((b) => {
    const totalCost = round2(b.fresh_cost_allocated + b.processing_expense);
    const salesInfo = batchSalesMap.get(b.id) ?? { soldKg: 0, revenue: 0, cogs: 0 };
    const remInfo = batchRemMap.get(b.id) ?? { A: 0, B: 0, C: 0, BULK: 0, bulkVal: 0, val: 0 };
    const yieldPct = b.fresh_used_kg > 0 ? round2((b.dried_total_kg / b.fresh_used_kg) * 100) : 0;
    const realizedPnl = round2(salesInfo.revenue - salesInfo.cogs - remInfo.bulkVal);
    const netCycleBalance = round2(salesInfo.revenue - totalCost);

    return {
      id: b.id,
      batch_code: b.batch_code,
      started_date: b.started_date,
      completed_date: b.completed_date,
      status: b.status,
      fresh_used_kg: b.fresh_used_kg,
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

  const gp = salesAgg?.gp ?? 0;
  const netOperatingProfit = round2(gp - gradeStocks.BULK.stock_value);

  return {
    fresh_stock_kg: round2(state.fresh_stock_kg),
    fresh_stock_value: round2(state.fresh_stock_value),
    avg_fresh_cost_per_kg: avgFreshCost,
    fermenting_batch_count: fermAgg?.cnt ?? 0,
    fermenting_wet_kg: round2(fermAgg?.wet_kg ?? 0),
    fermenting_cost_value: round2(fermAgg?.cost_val ?? 0),
    grade_stocks: gradeStocks,
    total_dried_stock_kg: totalDriedKg,
    total_dried_stock_value: totalDriedVal,
    totals: {
      total_purchase_kg: round2(purchAgg?.kg ?? 0),
      total_purchase_spend: round2(purchAgg?.spend ?? 0),
      total_processing_expense: round2(batchAgg?.proc_exp ?? 0),
      total_bulk_loss_kg: round2(batchAgg?.bulk_kg ?? 0),
      total_bulk_loss_value: round2(batchAgg?.bulk_val ?? 0),
      unsold_bulk_kg: gradeStocks.BULK.remaining_kg,
      unsold_bulk_value: gradeStocks.BULK.stock_value,
      total_sales_kg: round2(salesAgg?.kg ?? 0),
      total_sales_revenue: round2(salesAgg?.rev ?? 0),
      total_cogs: round2(salesAgg?.cogs ?? 0),
      total_gross_profit: round2(gp),
      net_operating_profit: netOperatingProfit,
    },
    batch_analytics: batchAnalytics,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (pathname === '/api/health') {
      return json({ ok: true, runtime: 'cloudflare-workers-d1' });
    }

    try {
      await ensureSchemaAndSeed(env.DB);

      if (pathname === '/api/dashboard' && method === 'GET') {
        return json(await getDashboardSummary(env.DB));
      }
      if (pathname === '/api/farmers' && method === 'GET') {
        return json(await listFarmers(env.DB));
      }
      if (pathname === '/api/farmers' && method === 'POST') {
        const body = (await request.json()) as { name: string; phone?: string; location?: string };
        return json(await createFarmer(env.DB, body), 201);
      }
      if (pathname === '/api/purchases' && method === 'GET') {
        const date = searchParams.get('date') || undefined;
        const farmerIdStr = searchParams.get('farmerId');
        const farmerId = farmerIdStr ? Number(farmerIdStr) : undefined;
        return json(await listPurchases(env.DB, { date, farmerId }));
      }
      if (pathname === '/api/purchases' && method === 'POST') {
        const body = (await request.json()) as {
          scheduledDate: string;
          farmerId: number;
          weightKg: number;
          pricePerKg: number;
          notes?: string;
        };
        return json(await createPurchase(env.DB, body), 201);
      }
      const purchaseDeleteMatch = pathname.match(/^\/api\/purchases\/(\d+)$/);
      if (purchaseDeleteMatch && method === 'DELETE') {
        await deletePurchase(env.DB, Number(purchaseDeleteMatch[1]));
        return json({ ok: true });
      }
      if (pathname === '/api/batches' && method === 'GET') {
        return json(await listBatches(env.DB));
      }
      if (pathname === '/api/batches/start' && method === 'POST') {
        const body = (await request.json()) as {
          startedDate: string;
          freshUsedKg: number;
          wetBeanKg: number;
          processingExpense?: number;
          notes?: string;
        };
        return json(await startBatch(env.DB, body), 201);
      }
      const batchCompleteMatch = pathname.match(/^\/api\/batches\/(\d+)\/complete$/);
      if (batchCompleteMatch && method === 'POST') {
        const body = (await request.json()) as {
          completedDate: string;
          bulkLossKg: number;
          gradeAKg: number;
          gradeBKg: number;
          gradeCKg: number;
          extraExpense?: number;
          notes?: string;
        };
        return json(await completeBatch(env.DB, Number(batchCompleteMatch[1]), body));
      }
      if (pathname === '/api/grade-lots' && method === 'GET') {
        return json(await listBatchGradeLots(env.DB));
      }
      if (pathname === '/api/sales' && method === 'GET') {
        return json(await listSales(env.DB));
      }
      if (pathname === '/api/sales' && method === 'POST') {
        const body = (await request.json()) as {
          dispatchDate: string;
          customerName: string;
          grade: CocoaGrade;
          weightKg: number;
          pricePerKg: number;
          preferredBatchId?: number;
          notes?: string;
        };
        return json(await createSale(env.DB, body), 201);
      }
      const saleDeleteMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
      if (saleDeleteMatch && method === 'DELETE') {
        await deleteSale(env.DB, Number(saleDeleteMatch[1]));
        return json({ ok: true });
      }
      if (pathname === '/api/ledger' && method === 'GET') {
        return json(
          await listLedger(env.DB, {
            txType: searchParams.get('txType') || undefined,
            search: searchParams.get('search') || undefined,
            from: searchParams.get('from') || undefined,
            to: searchParams.get('to') || undefined,
          })
        );
      }

      return json({ error: 'ไม่พบ API Endpoint ที่เรียกใช้งาน' }, 404);
    } catch (err) {
      const msg = (err as Error).message || 'เกิดข้อผิดพลาดในการประมวลผล';
      const status = msg.includes('ไม่พบ') || msg.includes('กรุณา') || msg.includes('ไม่เพียงพอ') ? 400 : 500;
      return json({ error: msg }, status);
    }
  },
};
