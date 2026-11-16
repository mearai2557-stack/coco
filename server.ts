import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  completeBatch,
  createFarmer,
  createPurchase,
  createSale,
  deletePurchase,
  deleteSale,
  getDashboardSummary,
  initDatabase,
  listBatches,
  listBatchGradeLots,
  listFarmers,
  listLedger,
  listPurchases,
  listSales,
  startBatch,
} from './server/db.ts';

initDatabase();

const app = express();
app.use(express.json());

// API Routes
app.get('/api/dashboard', (_req, res) => {
  try {
    res.json(getDashboardSummary());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/farmers', (_req, res) => {
  try {
    res.json(listFarmers());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/farmers', (req, res) => {
  try {
    const farmer = createFarmer(req.body);
    res.status(201).json(farmer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/purchases', (req, res) => {
  try {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : undefined;
    const farmerId =
      typeof req.query.farmerId === 'string' && req.query.farmerId ? Number(req.query.farmerId) : undefined;
    const rawType =
      req.query.rawType === 'POD' || req.query.rawType === 'WET_BEAN' ? req.query.rawType : undefined;
    res.json(listPurchases({ date, farmerId, rawType }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/purchases', (req, res) => {
  try {
    const purchase = createPurchase(req.body);
    res.status(201).json(purchase);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/purchases/:id', (req, res) => {
  try {
    deletePurchase(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/batches', (_req, res) => {
  try {
    res.json(listBatches());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/batches/start', (req, res) => {
  try {
    const batch = startBatch(req.body);
    res.status(201).json(batch);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/batches/:id/complete', (req, res) => {
  try {
    const batch = completeBatch(Number(req.params.id), req.body);
    res.json(batch);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/grade-lots', (_req, res) => {
  try {
    res.json(listBatchGradeLots());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/sales', (_req, res) => {
  try {
    res.json(listSales());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/sales', (req, res) => {
  try {
    const sale = createSale(req.body);
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/sales/:id', (req, res) => {
  try {
    deleteSale(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/ledger', (req, res) => {
  try {
    const txType = typeof req.query.txType === 'string' ? req.query.txType : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    res.json(listLedger({ txType, search, from, to }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function startServer(): Promise<void> {
  const isDevLifecycle = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';
  const isProdEnv = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
  const distDir = path.resolve(process.cwd(), 'dist');
  const shouldServeBuiltDist = fs.existsSync(distDir) && (isProdEnv || !isDevLifecycle);

  if (!shouldServeBuiltDist) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`CacaoFlow server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
