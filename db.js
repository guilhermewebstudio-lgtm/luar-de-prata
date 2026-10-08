const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta a variável DATABASE_URL (string de ligação do Neon).');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) ? false : { rejectUnauthorized: false },
  max: 5,
});

const DEFAULT_SETTINGS = {
  whatsapp: process.env.WHATSAPP_NUMBER || '',
  phone: '',
  email: 'pastelariasluardeprata@gmail.com',
  address: 'Rua Capitão Salgueiro Maia n.º 7A, Pontinha',
  hours: 'Segunda a Sábado: 07:00 – 20:00\nDomingo: 07:00 – 13:00',
  hours_short: 'Todos os dias, de manhã à tarde',
  facebook: 'https://www.facebook.com/search/top?q=Pastelaria%20LUAR%20De%20PRATA%20-%20Pontinha',
  instagram: '',
  promo_title: 'Promoção do fim de semana',
  promo_text: 'Tortas de ovo gratinadas!',
  promo_active: '1',
  order_notice: 'Encomendas de bolos com 48h de antecedência, por favor.',
  about:
    'Somos uma pastelaria de bairro na Pontinha, fundada em 2024, onde o pão quente, o café a cheirar e os bolos feitos com carinho recebem todos os dias quem passa. Dos pastéis de nata aos bolos de batizado e aniversário, tudo é feito a pensar em si.',
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price NUMERIC(8,2),
      category TEXT NOT NULL DEFAULT 'Pastelaria',
      today BOOLEAN NOT NULL DEFAULT false,
      available BOOLEAN NOT NULL DEFAULT true,
      sort INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Bolos',
      image_url TEXT NOT NULL,
      image_id INT REFERENCES images(id) ON DELETE SET NULL,
      featured BOOLEAN NOT NULL DEFAULT false,
      sort INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'Outro',
      pickup_date DATE,
      pickup_time TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'nova',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  const { rows: m } = await pool.query('SELECT COUNT(*)::int AS n FROM menu_items');
  if (m[0].n === 0) {
    const items = [
      // nome, descrição, preço, categoria, hoje
      ['Pastel de nata', 'Folhado estaladiço, creme suave, canela à parte.', 1.2, 'Pastelaria', true],
      ['Tortas de ovo gratinadas', 'A promoção do fim de semana. Ovos moles, caramelizadas à mão.', 3.5, 'Pastelaria', true],
      ['Croissant misto', 'Folhado fresco com queijo e fiambre.', 2.2, 'Salgados', true],
      ['Bola de Berlim', 'Com creme de ovos, açúcar por cima.', 1.8, 'Pastelaria', true],
      ['Pão de Deus', 'Macio, com coco ralado a cobrir.', 1.3, 'Pastelaria', false],
      ['Folhado de salsicha', 'Quentinho, a sair do forno.', 1.5, 'Salgados', true],
      ['Rissol de camarão', 'Massa estaladiça, recheio cremoso.', 1.4, 'Salgados', false],
      ['Fatia de bolo de bolacha', 'Receita da casa, com café.', 2.5, 'Bolos', true],
      ['Bolo de laranja', 'Fofo, com sumo e raspa de laranja.', 2.2, 'Bolos', false],
      ['Café', '', 0.8, 'Bebidas', false],
      ['Galão', '', 1.4, 'Bebidas', false],
      ['Sumo de laranja natural', 'Espremido na hora.', 2.5, 'Bebidas', false],
    ];
    let i = 0;
    for (const [name, description, price, category, today] of items) {
      await pool.query(
        'INSERT INTO menu_items (name, description, price, category, today, sort) VALUES ($1,$2,$3,$4,$5,$6)',
        [name, description, price, category, today, i++]
      );
    }
  }

  const { rows: g } = await pool.query('SELECT COUNT(*)::int AS n FROM gallery');
  if (g[0].n === 0) {
    await pool.query(
      "INSERT INTO gallery (title, category, image_url, featured, sort) VALUES ('Tortas de ovo gratinadas', 'Doces', '/img/tortas-de-ovo.jpg', true, 0)"
    );
  }
}

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  if (!s.whatsapp && process.env.WHATSAPP_NUMBER) s.whatsapp = process.env.WHATSAPP_NUMBER;
  return s;
}

async function setSettings(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, String(value ?? '').trim()]
    );
  }
}

module.exports = { pool, init, getSettings, setSettings, DEFAULT_SETTINGS };
