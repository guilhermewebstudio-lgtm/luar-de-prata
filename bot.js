// Bot de suporte local: palavras-chave + pontuação, sem APIs externas (custo zero).
// A língua é detetada por mensagem, não depende de nenhum seletor no site.

const EN_HINTS = [
  'hello', 'hi', 'hey', 'the', 'what', 'where', 'when', 'how', 'open', 'opening', 'hours', 'cake', 'order',
  'price', 'much', 'do', 'you', 'have', 'can', 'i', 'please', 'thanks', 'thank', 'menu', 'today', 'birthday',
  'wedding', 'delivery', 'address', 'gluten', 'vegan', 'is', 'are', 'your', 'want', 'need', 'bakery', 'coffee',
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLang(norm) {
  const words = norm.split(' ');
  let en = 0;
  for (const w of words) if (EN_HINTS.includes(w)) en++;
  const pt = words.filter((w) =>
    ['ola', 'bom', 'boa', 'quero', 'queria', 'quanto', 'custa', 'qual', 'quais', 'tem', 'tens', 'horario', 'encomendar', 'bolo', 'bolos', 'morada', 'onde', 'obrigado', 'obrigada', 'que', 'para', 'voces', 'hoje', 'ementa', 'aberto', 'abre', 'fecha'].includes(w)
  ).length;
  return en > pt && en >= 1 ? 'en' : 'pt';
}

// Cada intenção: palavras (peso 1) e expressões (peso 2).
const INTENTS = {
  greeting: { words: ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'hey', 'good morning', 'good evening'], phrases: [] },
  hours: {
    words: ['horario', 'horarios', 'aberto', 'abertos', 'abre', 'abrem', 'fecha', 'fecham', 'hora', 'hours', 'open', 'opening', 'closing', 'close', 'domingo', 'sabado', 'feriado', 'feriados'],
    phrases: ['a que horas', 'ate que horas', 'what time', 'are you open'],
  },
  location: {
    words: ['morada', 'onde', 'localizacao', 'fica', 'chegar', 'mapa', 'estacionamento', 'address', 'where', 'location', 'parking', 'directions', 'pontinha'],
    phrases: ['como chegar', 'onde ficam', 'where are you'],
  },
  menu: {
    words: ['ementa', 'menu', 'hoje', 'today', 'disponivel', 'disponiveis', 'pasteis', 'salgados', 'croissant', 'pao', 'cafe', 'coffee', 'pastry', 'pastries'],
    phrases: ['o que tem', 'o que tens', 'o que ha', 'que bolos', 'tem hoje', 'tem pasteis', 'what do you have', 'ementa do dia', 'menu of the day'],
  },
  prices: {
    words: ['preco', 'precos', 'custa', 'custam', 'quanto', 'valor', 'price', 'prices', 'cost', 'much', 'orcamento', 'caro'],
    phrases: ['quanto custa', 'how much'],
  },
  order: {
    words: ['encomenda', 'encomendar', 'encomendas', 'reservar', 'reserva', 'pedir', 'pedido', 'order', 'orders', 'reserve', 'book', 'levantar', 'levantamento', 'pickup'],
    phrases: ['quero encomendar', 'queria encomendar', 'fazer uma encomenda', 'place an order'],
  },
  cakes: {
    words: ['bolo', 'bolos', 'aniversario', 'batizado', 'batismo', 'casamento', 'comunhao', 'festa', 'torta', 'tortas', 'cake', 'cakes', 'birthday', 'wedding', 'baptism', 'party', 'personalizado', 'decorado', 'fondant', 'topo'],
    phrases: ['bolo de aniversario', 'bolo de batizado', 'bolo personalizado', 'birthday cake'],
  },
  contact: {
    words: ['contacto', 'contactos', 'telefone', 'telemovel', 'whatsapp', 'email', 'falar', 'ligar', 'contact', 'phone', 'call', 'talk', 'humano', 'pessoa', 'atendimento'],
    phrases: ['falar com alguem', 'falar com uma pessoa', 'speak to someone'],
  },
  delivery: {
    words: ['entrega', 'entregas', 'entregar', 'domicilio', 'casa', 'delivery', 'deliver', 'uber', 'glovo', 'bolt'],
    phrases: ['fazem entregas', 'do you deliver'],
  },
  allergens: {
    words: ['gluten', 'lactose', 'alergia', 'alergias', 'alergico', 'intolerancia', 'vegan', 'vegano', 'vegetariano', 'diabetico', 'acucar', 'allergy', 'allergic', 'vegetarian', 'dairy', 'nuts', 'frutos secos', 'ovos'],
    phrases: ['sem gluten', 'sem lactose', 'sem acucar', 'gluten free'],
  },
  payment: {
    words: ['pagamento', 'pagar', 'multibanco', 'mbway', 'cartao', 'dinheiro', 'payment', 'pay', 'card', 'cash'],
    phrases: ['mb way'],
  },
  promo: {
    words: ['promocao', 'promocoes', 'desconto', 'oferta', 'promo', 'promotion', 'deal', 'discount', 'offer', 'especial'],
    phrases: ['fim de semana', 'this weekend'],
  },
  thanks: { words: ['obrigado', 'obrigada', 'obg', 'agradeco', 'thanks', 'thank', 'cheers', 'valeu'], phrases: [] },
  bye: { words: ['adeus', 'tchau', 'xau', 'bye', 'goodbye'], phrases: ['ate logo', 'ate ja'] },
  about: {
    words: ['sobre', 'quem', 'historia', 'fundada', 'about', 'who', 'story'],
    phrases: ['quem sao', 'about you'],
  },
};

function score(norm) {
  const padded = ` ${norm} `;
  const result = {};
  for (const [name, def] of Object.entries(INTENTS)) {
    let s = 0;
    for (const w of def.words) if (padded.includes(` ${w} `)) s += w.includes(' ') ? 2 : 1;
    for (const p of def.phrases) if (padded.includes(` ${p} `)) s += 2.5;
    if (s > 0) result[name] = s;
  }
  return result;
}

function waUrl(settings, text) {
  const number = String(settings.whatsapp || '').replace(/\D/g, '');
  const q = encodeURIComponent(text);
  return number ? `https://wa.me/${number}?text=${q}` : `https://wa.me/?text=${q}`;
}

function money(v) {
  return Number(v).toFixed(2).replace('.', ',') + ' €';
}

const T = {
  pt: {
    chipsMain: ['Ementa de hoje', 'Horário', 'Como encomendar', 'Bolos de festa', 'Onde ficam?'],
    greeting: (s) => ({
      text: 'Olá! 🌙 Sou o assistente da Pastelaria Luar de Prata. Posso ajudar com a ementa do dia, horários, encomendas de bolos e muito mais. Em que posso ajudar?',
    }),
    hours: (s) => ({
      text: `O nosso horário:\n${s.hours}\n\nSe for um dia especial ou feriado, o melhor é confirmar connosco no WhatsApp.`,
      actions: [{ label: 'Confirmar no WhatsApp', url: waUrl(s, 'Olá! Queria confirmar o horário de hoje, por favor.') }],
    }),
    location: (s) => ({
      text: `Estamos na ${s.address}. 📍`,
      actions: [{ label: 'Abrir no mapa', url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address + ', Portugal') }],
    }),
    menuEmpty: (s) => ({
      text: 'A ementa de hoje ainda não está atualizada. Veja a nossa montra completa ou pergunte-nos no WhatsApp o que há fresquinho agora.',
      actions: [{ label: 'Ver ementa', url: '/ementa' }],
    }),
    menu: (s, items) => ({
      text:
        'Hoje temos:\n' +
        items.slice(0, 8).map((i) => `• ${i.name}${i.price != null ? ' — ' + money(i.price) : ''}`).join('\n') +
        (items.length > 8 ? `\n…e mais ${items.length - 8}.` : ''),
      actions: [{ label: 'Ver ementa completa', url: '/ementa' }],
    }),
    prices: (s, items) => ({
      text:
        'Os preços de cada produto estão na ementa. Para bolos de festa o preço depende do tamanho, recheio e decoração, por isso fazemos um orçamento à medida.' +
        (items.length ? '\n\nAlguns exemplos de hoje:\n' + items.filter((i) => i.price != null).slice(0, 4).map((i) => `• ${i.name} — ${money(i.price)}`).join('\n') : ''),
      actions: [
        { label: 'Pedir orçamento', url: '/encomendar' },
        { label: 'Ver ementa', url: '/ementa' },
      ],
    }),
    order: (s) => ({
      text: `Encomendar é fácil: preencha o pedido no site ou fale connosco diretamente no WhatsApp. ${s.order_notice}`,
      actions: [
        { label: 'Fazer encomenda', url: '/encomendar' },
        { label: 'Encomendar no WhatsApp', url: waUrl(s, 'Olá! Queria fazer uma encomenda, por favor.') },
      ],
    }),
    cakes: (s) => ({
      text: `Fazemos bolos de aniversário, batizado, casamento e festas, decorados à medida. Diga-nos a data, o número de pessoas e a ideia que tem. ${s.order_notice}`,
      actions: [
        { label: 'Ver galeria de bolos', url: '/bolos' },
        { label: 'Pedir bolo', url: '/encomendar' },
      ],
    }),
    contact: (s) => ({
      text: `Pode falar connosco por WhatsApp${s.phone ? ', telefone ' + s.phone : ''} ou email (${s.email}). Respondemos o mais depressa possível. 💬`,
      actions: [{ label: 'Abrir WhatsApp', url: waUrl(s, 'Olá! Gostava de falar com a Pastelaria Luar de Prata.') }],
    }),
    delivery: (s) => ({
      text: 'Para saber se conseguimos entregar na sua zona, o melhor é perguntar-nos por WhatsApp com a morada e a data. Levantamento na pastelaria é sempre possível.',
      actions: [{ label: 'Perguntar no WhatsApp', url: waUrl(s, 'Olá! Gostava de saber se fazem entregas na minha zona.') }],
    }),
    allergens: (s) => ({
      text: 'Se tem alergias ou intolerâncias (glúten, lactose, ovos, frutos secos…), diga-nos antes de encomendar. Os nossos produtos podem conter alergénios, por isso confirmamos sempre consigo o que é seguro.',
      actions: [{ label: 'Falar connosco', url: waUrl(s, 'Olá! Tenho uma dúvida sobre alergénios.') }],
    }),
    payment: () => ({ text: 'Para saber quais os métodos de pagamento aceites, pergunte-nos na pastelaria ou por WhatsApp. Nas encomendas combinamos o pagamento consigo ao confirmar o pedido.' }),
    promo: (s) => ({
      text: s.promo_active === '1' && s.promo_text ? `🎉 ${s.promo_title}: ${s.promo_text}` : 'De momento não temos nenhuma promoção ativa, mas fique atento, aparecem muitas vezes ao fim de semana!',
      actions: [{ label: 'Ver ementa', url: '/ementa' }],
    }),
    thanks: () => ({ text: 'De nada! Estamos aqui para o que precisar. 🌙' }),
    bye: () => ({ text: 'Até já! Esperamos por si na Luar de Prata. 🥐' }),
    about: (s) => ({ text: s.about, actions: [{ label: 'Conhecer a pastelaria', url: '/sobre' }] }),
    fallback: (s) => ({
      text: 'Não tenho a certeza de ter percebido. 🙈 Posso ajudar com ementa, horário, morada, encomendas ou bolos de festa. Se preferir, fale diretamente com a nossa equipa.',
      actions: [{ label: 'Falar no WhatsApp', url: waUrl(s, 'Olá! Tenho uma dúvida.') }],
    }),
  },
  en: {
    chipsMain: ["Today's menu", 'Opening hours', 'How to order', 'Celebration cakes', 'Where are you?'],
    greeting: () => ({ text: "Hello! 🌙 I'm the assistant for Pastelaria Luar de Prata. I can help with today's menu, opening hours, cake orders and more. How can I help?" }),
    hours: (s) => ({
      text: `Our opening hours:\n${s.hours}\n\nOn holidays it's best to confirm with us on WhatsApp.`,
      actions: [{ label: 'Confirm on WhatsApp', url: waUrl(s, 'Hello! I would like to confirm your opening hours today, please.') }],
    }),
    location: (s) => ({
      text: `We're at ${s.address}. 📍`,
      actions: [{ label: 'Open map', url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address + ', Portugal') }],
    }),
    menuEmpty: () => ({ text: "Today's menu hasn't been updated yet. See our full selection or ask us on WhatsApp what's fresh right now.", actions: [{ label: 'See menu', url: '/ementa' }] }),
    menu: (s, items) => ({
      text: 'Today we have:\n' + items.slice(0, 8).map((i) => `• ${i.name}${i.price != null ? ' — ' + money(i.price) : ''}`).join('\n') + (items.length > 8 ? `\n…and ${items.length - 8} more.` : ''),
      actions: [{ label: 'Full menu', url: '/ementa' }],
    }),
    prices: (s, items) => ({
      text: 'Prices for each item are on the menu. Celebration cakes depend on size, filling and decoration, so we quote each one.' +
        (items.length ? '\n\nA few examples from today:\n' + items.filter((i) => i.price != null).slice(0, 4).map((i) => `• ${i.name} — ${money(i.price)}`).join('\n') : ''),
      actions: [{ label: 'Request a quote', url: '/encomendar' }, { label: 'See menu', url: '/ementa' }],
    }),
    order: (s) => ({
      text: `Ordering is easy: fill in the request on the site or message us on WhatsApp. ${s.order_notice}`,
      actions: [{ label: 'Place an order', url: '/encomendar' }, { label: 'Order on WhatsApp', url: waUrl(s, 'Hello! I would like to place an order, please.') }],
    }),
    cakes: (s) => ({
      text: `We make birthday, baptism, wedding and party cakes, decorated to order. Tell us the date, number of guests and your idea. ${s.order_notice}`,
      actions: [{ label: 'Cake gallery', url: '/bolos' }, { label: 'Request a cake', url: '/encomendar' }],
    }),
    contact: (s) => ({
      text: `You can reach us on WhatsApp${s.phone ? ', phone ' + s.phone : ''} or email (${s.email}). 💬`,
      actions: [{ label: 'Open WhatsApp', url: waUrl(s, 'Hello! I would like to talk to Pastelaria Luar de Prata.') }],
    }),
    delivery: (s) => ({
      text: 'To check whether we can deliver to your area, message us on WhatsApp with the address and date. Pickup at the bakery is always available.',
      actions: [{ label: 'Ask on WhatsApp', url: waUrl(s, 'Hello! Do you deliver to my area?') }],
    }),
    allergens: (s) => ({
      text: 'If you have allergies or intolerances (gluten, lactose, eggs, nuts…), tell us before ordering. Our products may contain allergens, so we always confirm with you what is safe.',
      actions: [{ label: 'Talk to us', url: waUrl(s, 'Hello! I have a question about allergens.') }],
    }),
    payment: () => ({ text: 'Please ask us at the bakery or on WhatsApp about accepted payment methods. For orders we agree the payment with you when confirming.' }),
    promo: (s) => ({
      text: s.promo_active === '1' && s.promo_text ? `🎉 ${s.promo_title}: ${s.promo_text}` : "No active promotion right now, but they often appear at weekends!",
      actions: [{ label: 'See menu', url: '/ementa' }],
    }),
    thanks: () => ({ text: "You're welcome! 🌙" }),
    bye: () => ({ text: 'See you soon at Luar de Prata! 🥐' }),
    about: (s) => ({ text: 'A neighbourhood bakery in Pontinha, founded in 2024: warm bread, fresh coffee and cakes made with love.', actions: [{ label: 'About us', url: '/sobre' }] }),
    fallback: (s) => ({
      text: "I'm not sure I understood. 🙈 I can help with the menu, hours, address, orders or celebration cakes. Or talk straight to our team.",
      actions: [{ label: 'Chat on WhatsApp', url: waUrl(s, 'Hello! I have a question.') }],
    }),
  },
};

function reply(message, ctx) {
  const norm = normalize(message);
  const lang = detectLang(norm);
  const t = T[lang];
  const scores = score(norm);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  let intent = ranked.length ? ranked[0][0] : 'fallback';

  // "cakes" + "order" juntos → encomenda de bolo (mais útil)
  if (scores.cakes && scores.order) intent = 'cakes';
  // saudação só quando é só isso
  if (intent === 'greeting' && ranked.length > 1) intent = ranked[1][0];
  // tabela: "quanto custa o bolo" → prices
  if (scores.prices && scores.prices >= 1 && (scores.cakes || scores.menu)) intent = 'prices';

  const s = ctx.settings;
  let out;
  switch (intent) {
    case 'menu':
      out = ctx.todayItems.length ? t.menu(s, ctx.todayItems) : t.menuEmpty(s);
      break;
    case 'prices':
      out = t.prices(s, ctx.todayItems);
      break;
    default:
      out = (t[intent] || t.fallback)(s);
  }
  out.chips = t.chipsMain;
  out.lang = lang;
  out.intent = intent;
  return out;
}

module.exports = { reply, normalize, detectLang, waUrl };
