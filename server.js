/**
 * Филькоин — один сервис на Railway, который делает две вещи:
 *  1) Отдаёт philcoin.html как веб-страницу (это и есть Telegram Mini App).
 *  2) Опрашивает Telegram и на /start шлёт кнопку с открытием этой страницы.
 *
 * Ничего устанавливать не нужно — используется только встроенный в
 * Node.js модуль http и глобальный fetch (Node 18+, Railway это умеет
 * из коробки).
 *
 * ЕДИНСТВЕННОЕ, что может понадобиться сделать руками — см. "APP_URL" ниже.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8669803367:AAHv05kMGaL9oHTSm4nXEXq1qjOyEiRcNqM';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/* Railway сам подставляет публичный домен сервиса в переменную окружения
   RAILWAY_PUBLIC_DOMAIN, как только вы нажмёте "Generate Domain" в
   настройках сервиса (Settings → Networking). Если по какой-то причине
   он не появится — задайте переменную APP_URL вручную в Railway
   (Variables → + New Variable → APP_URL = https://ваш-домен.up.railway.app). */
const APP_URL = process.env.APP_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : null);

/* ---------- 1) веб-сервер, отдающий Mini App ---------- */
const HTML_PATH = path.join(__dirname, 'philcoin.html');
const htmlBuffer = fs.readFileSync(HTML_PATH);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlBuffer);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Веб-сервер запущен на порту', PORT);
  console.log('APP_URL:', APP_URL || '(ещё не определён — см. комментарий в server.js)');
});

/* ---------- 2) бот: одна кнопка "Открыть Филькоин" ---------- */
async function sendWelcome(chatId) {
  if (!APP_URL) {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Приложение почти готово, создатель ещё не включил публичный домен на хостинге 🐷'
      })
    });
    return;
  }
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: 'Привет! Жми на кнопку ниже, чтобы открыть Филькоин 🐷',
      reply_markup: {
        inline_keyboard: [[
          { text: '🐷 Открыть Филькоин', web_app: { url: APP_URL } }
        ]]
      }
    })
  });
}

async function poll(offset) {
  const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
  const data = await res.json();
  let nextOffset = offset;

  if (data.ok) {
    for (const update of data.result) {
      nextOffset = update.update_id + 1;
      const msg = update.message;
      if (msg && msg.text && msg.text.startsWith('/start')) {
        await sendWelcome(msg.chat.id);
      }
    }
  }
  return nextOffset;
}

async function runBot() {
  console.log('Бот запущен, жду сообщений...');
  let offset = 0;
  for (;;) {
    try {
      offset = await poll(offset);
    } catch (e) {
      console.error('Ошибка опроса Telegram:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

runBot();
