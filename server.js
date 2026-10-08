process.env.TZ = 'Europe/Lisbon';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const compression = require('compression');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');

const { pool, init, getSettings, setSettings } = require('./db');
const bot = require('./bot');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const TZ = 'Europe/Lisbon';

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '50kb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: PROD ? '7d' : 0,
  })
);

// ---------- Sessões ----------
if (!process.env.SESSION_SECRET) {
  console.warn('Aviso: SESSION_SECRET não definido, a usar um valor temporário (as sessões perdem-se a cada reinício).');
}
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: PROD,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// ---------- Utilitários ----------
const rateBuckets = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    const bucket = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (bucket.length >= max) {
      if (req.path.startsWith('/api/')) return res.status(429).json({ error: 'Demasiados pedidos. Tente daqui a pouco.' });
      return res.status(429).send('Demasiados pedidos. Tente daqui a pouco.');
    }
    bucket.push(now);
    rateBuckets.set(key, bucket);
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (!v.some((t) => now - t < 3600_000)) rateBuckets.delete(k);
}, 600_000).unref();

let settingsCache = { at: 0, value: null };
async function loadSettings(force = false) {
  if (!force && settingsCache.value && Date.now() - settingsCache.at < 30_000) return settingsCache.value;
  settingsCache = { at: Date.now(), value: await getSettings() };
  return settingsCache.value;
}

const money = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ',') + ' €');
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const waNumber = (s) => String(s.whatsapp || '').replace(/\D/g, '');
const waLink = (s, text) => bot.waUrl(s, text);

app.use(async (req, res, next) => {
  const s = await loadSettings();
  res.locals.s = s;
  res.locals.money = money;
  res.locals.waLink = (text) => waLink(s, text);
  res.locals.path = req.path;
  res.locals.year = new Date().getFullYear();
  res.locals.csrf = '';
  res.locals.flash = null;
  res.locals.title = null;
  res.locals.description = null;
  res.locals.isAdmin = false;
  next();
});

const categoryOrder = ['Pastelaria', 'Salgados', 'Bolos', 'Bebidas'];
function groupByCategory(items) {
  const map = new Map();
  for (const i of items) {
    if (!map.has(i.category)) map.set(i.category, []);
    map.get(i.category).push(i);
  }
  return [...map.entries()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a[0]);
    const bi = categoryOrder.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
  });
}

async function todayItems(limitN) {
  const { rows } = await pool.query(
    `SELECT * FROM menu_items WHERE today AND available ORDER BY sort, name ${limitN ? 'LIMIT ' + Number(limitN) : ''}`
  );
  return rows;
}

const todayLabel = () =>
  new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

// ids numéricos (Express 5 já não aceita regex nos parâmetros)
app.param('id', (req, res, next, val) => (/^\d+$/.test(val) ? next() : next('route')));

// ---------- Páginas públicas ----------
app.get('/', async (req, res) => {
  const [items, gallery] = await Promise.all([
    todayItems(6),
    pool.query('SELECT * FROM gallery ORDER BY featured DESC, sort, id DESC LIMIT 6'),
  ]);
  res.render('index', {
    title: 'Pastelaria Luar de Prata · Pontinha',
    description: 'Pastelaria Arte e Sabor na Pontinha. Ementa do dia, bolos de aniversário e batizado, e encomendas diretas por WhatsApp.',
    items,
    gallery: gallery.rows,
    todayLabel: todayLabel(),
  });
});

app.get('/ementa', async (req, res) => {
  const [today, all] = await Promise.all([
    todayItems(),
    pool.query('SELECT * FROM menu_items WHERE available ORDER BY sort, name'),
  ]);
  res.render('ementa', {
    title: 'Ementa do dia · Luar de Prata',
    description: 'A ementa do dia da Pastelaria Luar de Prata e a nossa montra completa.',
    today,
    groups: groupByCategory(all.rows),
    todayLabel: todayLabel(),
  });
});

app.get('/bolos', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM gallery ORDER BY sort, id DESC');
  const cats = [...new Set(rows.map((r) => r.category))];
  res.render('bolos', {
    title: 'Bolos e doces · Luar de Prata',
    description: 'Galeria de bolos de aniversário, batizado, casamento e doces da Pastelaria Luar de Prata.',
    gallery: rows,
    cats,
  });
});

app.get('/sobre', (req, res) => {
  res.render('sobre', { title: 'Sobre nós · Luar de Prata', description: 'Conheça a Pastelaria Luar de Prata, Pontinha.' });
});

app.get('/contacto', (req, res) => {
  res.render('contacto', { title: 'Contactos · Luar de Prata', description: 'Morada, horário e contactos da Pastelaria Luar de Prata.' });
});

const KINDS = ['Bolo de aniversário', 'Bolo de batizado', 'Bolo de casamento', 'Tortas e sobremesas', 'Salgados e festa', 'Outro'];

app.get('/encomendar', (req, res) => {
  res.render('encomendar', {
    title: 'Encomendar · Luar de Prata',
    description: 'Encomende bolos, tortas e salgados à Pastelaria Luar de Prata, direto por WhatsApp.',
    kinds: KINDS,
    form: { kind: req.query.tipo && KINDS.includes(req.query.tipo) ? req.query.tipo : KINDS[0] },
    errors: [],
    minDate: todayISO(),
  });
});

app.post('/encomendar', limit(8, 3600_000), async (req, res) => {
  const b = req.body || {};
  const form = {
    name: String(b.name || '').trim().slice(0, 80),
    phone: String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 20),
    kind: KINDS.includes(b.kind) ? b.kind : 'Outro',
    pickup_date: String(b.pickup_date || '').slice(0, 10),
    pickup_time: String(b.pickup_time || '').slice(0, 5),
    details: String(b.details || '').trim().slice(0, 1500),
  };
  // honeypot: bots preenchem este campo escondido
  if (b.website) return res.redirect('/encomendar');

  const errors = [];
  if (form.name.length < 2) errors.push('Indique o seu nome.');
  if (form.phone.replace(/\D/g, '').length < 9) errors.push('Indique um telemóvel válido (pelo menos 9 dígitos).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.pickup_date) || form.pickup_date < todayISO()) errors.push('Escolha uma data de levantamento a partir de hoje.');
  if (form.details.length < 5) errors.push('Descreva o que pretende (sabor, nº de pessoas, ideias…).');

  if (errors.length) {
    return res.status(400).render('encomendar', {
      title: 'Encomendar · Luar de Prata',
      description: null,
      kinds: KINDS,
      form,
      errors,
      minDate: todayISO(),
    });
  }

  const { rows } = await pool.query(
    'INSERT INTO orders (name, phone, kind, pickup_date, pickup_time, details) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [form.name, form.phone, form.kind, form.pickup_date, form.pickup_time, form.details]
  );
  const id = rows[0].id;
  const [y, m, d] = form.pickup_date.split('-');
  const msg =
    `Olá! Acabei de fazer um pedido no site (n.º ${id}).\n` +
    `Nome: ${form.name}\nTipo: ${form.kind}\n` +
    `Para: ${d}/${m}/${y}${form.pickup_time ? ' às ' + form.pickup_time : ''}\n` +
    `Detalhes: ${form.details}`;
  res.render('encomendar-ok', {
    title: 'Pedido recebido · Luar de Prata',
    description: null,
    id,
    name: form.name,
    waHref: waLink(res.locals.s, msg),
  });
});

// ---------- Bot ----------
app.post('/api/bot', limit(40, 600_000), async (req, res) => {
  const message = String((req.body && req.body.message) || '').slice(0, 300);
  if (!message.trim()) return res.json({ text: 'Escreva-me uma pergunta. 🙂', chips: [] });
  const [settings, items] = await Promise.all([loadSettings(), todayItems()]);
  res.json(bot.reply(message, { settings, todayItems: items }));
});

// ---------- Imagens guardadas na BD ----------
app.get('/media/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT mime, data FROM images WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.send(rows[0].data);
});

app.get('/health', (req, res) => res.type('text').send('ok'));
app.get('/robots.txt', (req, res) =>
  res.type('text').send(`User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml\n`)
);
app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = ['/', '/ementa', '/bolos', '/encomendar', '/sobre', '/contacto'];
  res.type('xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${base}${u}</loc></url>`)
      .join('')}</urlset>`
  );
});

// ---------- Admin ----------
const csrfCheck = (req, res, next) => {
  const token = (req.body && req.body._csrf) || req.query._csrf;
  if (!token || token !== req.session.csrf) return res.status(403).send('Sessão expirada. Volte atrás e tente novamente.');
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.session.adminId) return res.redirect('/admin/login');
  res.locals.isAdmin = true;
  res.locals.csrf = req.session.csrf || (req.session.csrf = crypto.randomBytes(24).toString('hex'));
  next();
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});

app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Entrar', error: null });
});

app.post('/admin/login', limit(10, 600_000), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
  const ok = rows.length && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) return res.status(401).render('admin/login', { title: 'Entrar', error: 'Email ou palavra-passe incorretos.' });
  const adminId = rows[0].id;
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.adminId = adminId;
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.session.save(() => res.redirect('/admin'));
  });
});

app.use('/admin', requireAdmin);

app.post('/admin/logout', csrfCheck, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const ORDER_STATUS = ['nova', 'confirmada', 'pronta', 'entregue', 'cancelada'];

app.get('/admin', async (req, res) => {
  const status = ORDER_STATUS.includes(req.query.estado) ? req.query.estado : null;
  const { rows } = await pool.query(
    `SELECT *, to_char(pickup_date, 'DD/MM/YYYY') AS pickup_fmt, to_char(created_at AT TIME ZONE 'Europe/Lisbon', 'DD/MM HH24:MI') AS created_fmt
     FROM orders ${status ? 'WHERE status = $1' : ''} ORDER BY (status = 'nova') DESC, pickup_date NULLS LAST, id DESC LIMIT 200`,
    status ? [status] : []
  );
  const counts = (await pool.query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status')).rows;
  res.render('admin/encomendas', {
    title: 'Encomendas',
    tab: 'encomendas',
    orders: rows,
    status,
    statuses: ORDER_STATUS,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  });
});

app.post('/admin/encomendas/:id/estado', csrfCheck, async (req, res) => {
  if (ORDER_STATUS.includes(req.body.status)) {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
  }
  res.redirect(req.get('referer') || '/admin');
});

app.post('/admin/encomendas/:id/apagar', csrfCheck, async (req, res) => {
  await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  res.redirect('/admin');
});

app.get('/admin/ementa', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY today DESC, category, sort, name');
  res.render('admin/ementa', {
    title: 'Ementa',
    tab: 'ementa',
    items: rows,
    categories: categoryOrder,
    saved: req.query.ok === '1',
  });
});

const parsePrice = (v) => {
  const n = parseFloat(String(v || '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

app.post('/admin/ementa/novo', csrfCheck, async (req, res) => {
  const b = req.body;
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) {
    await pool.query(
      'INSERT INTO menu_items (name, description, price, category, today, sort) VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(sort),0)+1 FROM menu_items))',
      [name, String(b.description || '').trim().slice(0, 200), parsePrice(b.price), String(b.category || 'Pastelaria').slice(0, 30), b.today === 'on']
    );
  }
  res.redirect('/admin/ementa?ok=1');
});

app.post('/admin/ementa/limpar-hoje', csrfCheck, async (req, res) => {
  await pool.query('UPDATE menu_items SET today = false');
  res.redirect('/admin/ementa?ok=1');
});

app.post('/admin/ementa/:id', csrfCheck, async (req, res) => {
  const b = req.body;
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) {
    await pool.query(
      'UPDATE menu_items SET name=$1, description=$2, price=$3, category=$4, today=$5, available=$6 WHERE id=$7',
      [name, String(b.description || '').trim().slice(0, 200), parsePrice(b.price), String(b.category || 'Pastelaria').slice(0, 30), b.today === 'on', b.available === 'on', req.params.id]
    );
  }
  res.redirect('/admin/ementa?ok=1');
});

app.post('/admin/ementa/:id/apagar', csrfCheck, async (req, res) => {
  await pool.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
  res.redirect('/admin/ementa');
});

app.get('/admin/galeria', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM gallery ORDER BY sort, id DESC');
  res.render('admin/galeria', { title: 'Galeria', tab: 'galeria', gallery: rows, error: req.query.erro || null, saved: req.query.ok === '1' });
});

app.post('/admin/galeria', upload.array('images', 12), csrfCheck, async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.redirect('/admin/galeria?erro=' + encodeURIComponent('Escolha pelo menos uma imagem (JPG, PNG ou WebP, até 12 MB).'));
  const category = String(req.body.category || 'Bolos').slice(0, 30);
  const title = String(req.body.title || '').trim().slice(0, 80);
  try {
    for (const f of files) {
      const data = await sharp(f.buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const img = await pool.query('INSERT INTO images (mime, data) VALUES ($1,$2) RETURNING id', ['image/webp', data]);
      await pool.query(
        'INSERT INTO gallery (title, category, image_url, image_id, sort) VALUES ($1,$2,$3,$4,(SELECT COALESCE(MIN(sort),0)-1 FROM gallery))',
        [files.length === 1 ? title : '', category, '/media/' + img.rows[0].id, img.rows[0].id]
      );
    }
  } catch (e) {
    console.error('Erro ao processar imagem:', e.message);
    return res.redirect('/admin/galeria?erro=' + encodeURIComponent('Não consegui processar a imagem. Tente outra.'));
  }
  res.redirect('/admin/galeria?ok=1');
});

app.post('/admin/galeria/:id', csrfCheck, async (req, res) => {
  await pool.query('UPDATE gallery SET title=$1, category=$2, featured=$3 WHERE id=$4', [
    String(req.body.title || '').trim().slice(0, 80),
    String(req.body.category || 'Bolos').slice(0, 30),
    req.body.featured === 'on',
    req.params.id,
  ]);
  res.redirect('/admin/galeria?ok=1');
});

app.post('/admin/galeria/:id/apagar', csrfCheck, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM gallery WHERE id = $1 RETURNING image_id', [req.params.id]);
  if (rows[0] && rows[0].image_id) await pool.query('DELETE FROM images WHERE id = $1', [rows[0].image_id]);
  res.redirect('/admin/galeria');
});

app.get('/admin/definicoes', (req, res) => {
  res.render('admin/definicoes', { title: 'Definições', tab: 'definicoes', saved: req.query.ok === '1', pwMsg: req.query.pw || null });
});

app.post('/admin/definicoes', csrfCheck, async (req, res) => {
  const b = req.body;
  await setSettings({
    whatsapp: String(b.whatsapp || '').replace(/\D/g, ''),
    phone: b.phone,
    email: b.email,
    address: b.address,
    hours: b.hours,
    hours_short: b.hours_short,
    facebook: b.facebook,
    instagram: b.instagram,
    promo_title: b.promo_title,
    promo_text: b.promo_text,
    promo_active: b.promo_active === 'on' ? '1' : '0',
    order_notice: b.order_notice,
    about: b.about,
  });
  await loadSettings(true);
  res.redirect('/admin/definicoes?ok=1');
});

app.post('/admin/password', csrfCheck, async (req, res) => {
  const { current, next, confirm } = req.body;
  const { rows } = await pool.query('SELECT * FROM admins WHERE id = $1', [req.session.adminId]);
  if (!rows.length || !(await bcrypt.compare(String(current || ''), rows[0].password_hash))) {
    return res.redirect('/admin/definicoes?pw=' + encodeURIComponent('A palavra-passe atual está errada.'));
  }
  if (String(next || '').length < 8 || next !== confirm) {
    return res.redirect('/admin/definicoes?pw=' + encodeURIComponent('A nova palavra-passe deve ter 8+ caracteres e coincidir nos dois campos.'));
  }
  await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 12), rows[0].id]);
  res.redirect('/admin/definicoes?pw=' + encodeURIComponent('Palavra-passe alterada.'));
});

// ---------- 404 / erros ----------
app.use((req, res) => {
  res.status(404).render('404', { title: 'Página não encontrada', description: null });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Erro interno.' });
  res.status(500).render('404', { title: 'Algo correu mal', description: null, serverError: true });
});

// ---------- Arranque ----------
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn('Aviso: ADMIN_EMAIL / ADMIN_PASSWORD não definidos, o painel de admin fica sem acesso.');
    return;
  }
  const { rows } = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (!rows.length) {
    await pool.query('INSERT INTO admins (email, password_hash) VALUES ($1,$2)', [email, await bcrypt.hash(password, 12)]);
    console.log('Conta de admin criada:', email);
  } else if (process.env.ADMIN_RESET_PASSWORD === '1') {
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 12), rows[0].id]);
    console.log('Palavra-passe de admin reposta para:', email);
  }
}

const PORT = process.env.PORT || 3000;
init()
  .then(seedAdmin)
  .then(() => app.listen(PORT, () => console.log(`Luar de Prata a correr na porta ${PORT}`)))
  .catch((e) => {
    console.error('Falha no arranque:', e);
    process.exit(1);
  });
