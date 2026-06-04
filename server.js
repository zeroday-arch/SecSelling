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
const basePrices = { 5: 3, 10: 5, 15: 15, 20: 20, 25: 25, 30: 30, 35: 40, 40: 50, 45: 60, 50: 70, 55: 80, 60: 90, 65: 100, 70: 110, 75: 120, 80: 130, 85: 140, 90: 150, 95: 160, 100: 170 };

function defaultDb() {
  const inventory = {};
  baseMils.forEach(mil => { inventory[String(mil)] = 10; });
  return { offers: {}, announcements: [], inventory, orders: [], chats: {}, reviews: [
    { name: 'Alex', rating: 5, text: 'Fast support and clear delivery steps.' },
    { name: 'Mika', rating: 5, text: 'Order status made it easy to follow progress.' },
    { name: 'Jonas', rating: 4, text: 'Clean process, got updates quickly.' }
  ] };
}

async function readDb() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    return ensureDbShapes({ ...defaultDb(), ...JSON.parse(raw) });
  } catch (error) {
    const db = ensureDbShapes(defaultDb());
    await writeDb(db);
    return db;
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}


function publicChat(chat) {
  return {
    id: chat.id,
    email: chat.email || '',
    name: chat.name || 'Customer',
    messages: chat.messages || [],
    updatedAt: chat.updatedAt || chat.createdAt || new Date().toISOString()
  };
}

function cleanChatText(text) {
  return String(text || '').trim().slice(0, 1000);
}

function makeChatId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDbShapes(db) {
  db.offers ||= {};
  db.announcements ||= [];
  db.inventory ||= {};
  db.orders ||= [];
  db.reviews ||= [];
  db.chats ||= {};
  return db;
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


app.post('/api/chats/message', async (req, res) => {
  const text = cleanChatText(req.body.text);
  if (!text) return res.status(400).json({ error: 'Message is empty' });

  const db = await readDb();
  const chatId = String(req.body.chatId || '').trim() || makeChatId();
  if (!db.chats[chatId]) {
    db.chats[chatId] = {
      id: chatId,
      email: String(req.body.email || '').trim().slice(0, 120),
      name: String(req.body.name || 'Customer').trim().slice(0, 80) || 'Customer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
  }

  const chat = db.chats[chatId];
  if (req.body.email) chat.email = String(req.body.email || '').trim().slice(0, 120);
  if (req.body.name) chat.name = String(req.body.name || 'Customer').trim().slice(0, 80) || 'Customer';
  chat.messages.push({
    id: Date.now(),
    sender: 'customer',
    text,
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString()
  });
  chat.messages = chat.messages.slice(-200);
  chat.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({ ok: true, chatId, chat: publicChat(chat) });
});

app.get('/api/chats/:id', async (req, res) => {
  const db = await readDb();
  const chat = db.chats[String(req.params.id)] || { id: String(req.params.id), messages: [] };
  res.json({ chat: publicChat(chat) });
});

app.get('/api/admin/chats', requireAdmin, async (req, res) => {
  const db = await readDb();
  const chats = Object.values(db.chats || {})
    .map(publicChat)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ chats });
});

app.get('/api/admin/chats/:id', requireAdmin, async (req, res) => {
  const db = await readDb();
  const chat = db.chats[String(req.params.id)];
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json({ chat: publicChat(chat) });
});

app.post('/api/admin/chats/:id/message', requireAdmin, async (req, res) => {
  const text = cleanChatText(req.body.text);
  if (!text) return res.status(400).json({ error: 'Message is empty' });

  const db = await readDb();
  const chatId = String(req.params.id);
  const chat = db.chats[chatId];
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  chat.messages.push({
    id: Date.now(),
    sender: 'admin',
    text,
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString()
  });
  chat.messages = chat.messages.slice(-200);
  chat.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({ ok: true, chat: publicChat(chat) });
});

app.delete('/api/admin/chats/:id', requireAdmin, async (req, res) => {
  const db = await readDb();
  const chatId = String(req.params.id);
  if (!db.chats[chatId]) return res.status(404).json({ error: 'Chat not found' });
  delete db.chats[chatId];
  await writeDb(db);
  res.json({ ok: true });
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


app.post('/api/admin/offers/bulk-discount', requireAdmin, async (req, res) => {
  const discountPercent = Number(req.body.discountPercent);
  const description = String(req.body.description || '').trim().slice(0, 80);
  const endDate = String(req.body.endDate || '').trim();

  if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 99) {
    return res.status(400).json({ error: 'Discount must be between 1 and 99 percent' });
  }
  if (!endDate || Number.isNaN(new Date(endDate).getTime())) {
    return res.status(400).json({ error: 'Valid end date is required' });
  }

  const db = await readDb();
  baseMils.forEach(mil => {
    const original = Number(basePrices[mil]);
    const salePrice = Math.max(0.01, Math.round((original * (1 - discountPercent / 100)) * 100) / 100);
    db.offers[String(mil)] = {
      salePrice,
      description: description || `${discountPercent}% OFF`,
      endDate
    };
  });

  await writeDb(db);
  res.json(publicSiteData(db));
});

app.delete('/api/admin/offers', requireAdmin, async (req, res) => {
  const db = await readDb();
  db.offers = {};
  await writeDb(db);
  res.json(publicSiteData(db));
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
