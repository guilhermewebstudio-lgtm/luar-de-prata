# Pastelaria Luar de Prata

Site em Node.js/Express/EJS + Neon (Postgres). Ementa do dia, galeria de bolos, encomendas, botão WhatsApp, bot de suporte local (sem APIs pagas) e painel de admin.

## Deploy (Render)
1. Repo no GitHub e projeto novo no Neon (Frankfurt).
2. Render > New Web Service. Build: `npm install`. Start: `npm start`.
3. Variáveis de ambiente (ver `.env.example`):
   - `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`
   - `WHATSAPP_NUMBER` (opcional, também se muda no admin)
4. cron-job.org: GET `https://O-TEU-SITE.onrender.com/health` de 10 em 10 minutos.

As tabelas e os dados de exemplo (ementa, definições) são criados no primeiro arranque.

## Admin
`/admin` (link «Área reservada» no rodapé). A conta é criada no 1.º arranque com `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
Se esqueceres a palavra-passe: define `ADMIN_RESET_PASSWORD=1` + nova `ADMIN_PASSWORD`, faz redeploy e depois remove o `ADMIN_RESET_PASSWORD`.

- **Encomendas**: pedidos do site, com estado (nova, confirmada, pronta…).
- **Ementa**: marcar «Hoje» nos produtos do dia (aparece no site e no bot).
- **Galeria**: upload de fotos (reduzidas e guardadas na BD).
- **Definições**: número de WhatsApp, horário, morada, promoção, textos.

## Notas
- Horário, preços e produtos de exemplo são **placeholders**: confirmar com a pastelaria.
- Sem email de aviso de novas encomendas (sem Brevo por agora): o dono vê no admin e confirma por WhatsApp.

## Contas e login
- `/entrar` é o login único: o email do admin (ADMIN_EMAIL) vai direto para `/admin`; clientes vão para `/conta`.
- `/registar` cria conta de cliente (guarda nome/telemóvel e as encomendas ficam associadas). Encomendar continua a funcionar sem conta.
- `/admin/clientes` lista as contas criadas.
