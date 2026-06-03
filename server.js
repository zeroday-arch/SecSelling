require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'testest7173@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Passwordisnotowner123idiot';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '250kb' }));
app.use(express.static(PUBLIC_DIR));

const baseMils = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];

function defaultDb() {
  const inventory = {};
  baseMils.forEach(mil => { inventory[String(mil)] = 10; });
  return { offers: {}, announcements: [], inventory, orders: [], reviews: [
    { name: 'Alex', rating: 5, text: 'Fast support and clear delivery steps.' },
    { name: 'Mika', rating: 5, text: 'Order status made it easy to follow progress.' },
    { name: 'Jonas', rating: 4, text: 'Clean process, got updates quickly.' }
  ] };
}

async function readDb() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    return { ...defaultDb(), ...JSON.parse(raw) };
  } catch (error) {
    const db = defaultDb();
    await writeDb(db);
    return db;
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function publicSiteData(db) {
  return {
    offers: db.offers || {},
    announcements: db.announcements || [],
    inventory: db.inventory || {},
    reviews: db.reviews || []
  };
}

function cleanAnnouncement(item) {
  return {
    text: String(item.text || '').trim().slice(0, 180),
    endDate: String(item.endDate || '').trim()
  };
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing admin token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Not admin' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/site', async (req, res) => {
  const db = await readDb();
  res.json(publicSiteData(db));
});

app.post('/api/reviews', async (req, res) => {
  const name = String(req.body.name || 'Customer').trim().slice(0, 40) || 'Customer';
  const rating = Math.max(1, Math.min(5, Number(req.body.rating) || 5));
  const text = String(req.body.text || '').trim().slice(0, 300);

  if (text.length < 8) {
    return res.status(400).json({ error: 'Review text is too short' });
  }

  const db = await readDb();
  const review = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    name,
    rating,
    text
  };

  db.reviews = [ ...(db.reviews || []), review ].slice(-100);
  await writeDb(db);
  res.json({ ok: true, review, reviews: db.reviews });
});

app.post('/api/admin/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const emailMatches = email === ADMIN_EMAIL.toLowerCase();
  const passwordMatches = await bcrypt.compare(password, await bcrypt.hash(ADMIN_PASSWORD, 10));

  if (!emailMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid admin login' });
  }

  const token = jwt.sign({ email: ADMIN_EMAIL, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, email: ADMIN_EMAIL, username: 'Owner' });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ email: ADMIN_EMAIL, username: 'Owner', role: 'admin' });
});

app.put('/api/admin/offers/:mil', requireAdmin, async (req, res) => {
  const mil = String(Number(req.params.mil));
  if (!baseMils.includes(Number(mil))) return res.status(400).json({ error: 'Invalid package' });

  const salePrice = Number(req.body.salePrice);
  const description = String(req.body.description || '').trim().slice(0, 80);
  const endDate = String(req.body.endDate || '').trim();

  const db = await readDb();

  if (!Number.isFinite(salePrice) || salePrice <= 0 || !endDate) {
    delete db.offers[mil];
  } else {
    db.offers[mil] = { salePrice, description, endDate };
  }

  await writeDb(db);
  res.json(publicSiteData(db));
});

app.delete('/api/admin/offers/:mil', requireAdmin, async (req, res) => {
  const mil = String(Number(req.params.mil));
  const db = await readDb();
  delete db.offers[mil];
  await writeDb(db);
  res.json(publicSiteData(db));
});

app.put('/api/admin/inventory/:mil', requireAdmin, async (req, res) => {
  const mil = String(Number(req.params.mil));
  if (!baseMils.includes(Number(mil))) return res.status(400).json({ error: 'Invalid package' });

  const stock = Number(req.body.stock);
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });

  const db = await readDb();
  db.inventory[mil] = stock;
  await writeDb(db);
  res.json(publicSiteData(db));
});

app.put('/api/admin/announcements', requireAdmin, async (req, res) => {
  if (!Array.isArray(req.body.announcements)) {
    return res.status(400).json({ error: 'announcements must be an array' });
  }

  const cleaned = req.body.announcements
    .map(cleanAnnouncement)
    .filter(item => item.text && item.endDate)
    .slice(0, 5);

  const db = await readDb();
  db.announcements = cleaned;
  await writeDb(db);
  res.json(publicSiteData(db));
});

app.post('/api/orders', async (req, res) => {
  const db = await readDb();
  const order = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    userName: String(req.body.userName || '').slice(0, 80),
    userEmail: String(req.body.userEmail || '').slice(0, 120),
    packageMil: Number(req.body.packageMil),
    price: Number(req.body.price),
    method: String(req.body.method || '').slice(0, 40),
    status: 'payment_pending',
    adminNote: '',
    updatedAt: new Date().toISOString()
  };
  db.orders.push(order);
  db.orders = db.orders.slice(-500);
  await writeDb(db);
  res.json({ ok: true, order });
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const db = await readDb();
  res.json({ orders: db.orders || [] });
});
app.get('/api/orders', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Missing email' });
  const db = await readDb();
  const orders = (db.orders || [])
    .filter(order => String(order.userEmail || '').toLowerCase() === email)
    .map(order => ({
      id: order.id,
      timestamp: order.timestamp,
      packageMil: order.packageMil,
      price: order.price,
      method: order.method,
      status: order.status || 'payment_pending',
      adminNote: order.adminNote || '',
      updatedAt: order.updatedAt || order.timestamp
    }));
  res.json({ orders });
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const allowedStatuses = ['payment_pending', 'paid', 'in_progress', 'delivered', 'cancelled'];
  const db = await readDb();
  const order = (db.orders || []).find(item => Number(item.id) === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.body.status !== undefined) {
    const status = String(req.body.status || '').trim();
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    order.status = status;
  }
  if (req.body.adminNote !== undefined) {
    order.adminNote = String(req.body.adminNote || '').trim().slice(0, 500);
  }
  order.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({ ok: true, order });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const db = await readDb();
  const before = (db.orders || []).length;
  db.orders = (db.orders || []).filter(item => Number(item.id) !== id);
  if (db.orders.length === before) return res.status(404).json({ error: 'Order not found' });
  await writeDb(db);
  res.json({ ok: true });
});


app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SecSell backend running: http://localhost:${PORT}`);
});
