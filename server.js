/**
 * Филькоин — один сервис на Railway.
 * 1) Отдаёт philcoin.html как веб-страницу (Telegram Mini App).
 * 2) Опрашивает Telegram — на /start шлёт кнопку с открытием страницы.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const BOT_TOKEN = '8669803367:AAHv05kMGaL9oHTSm4nXEXq1qjOyEiRcNqM';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const APP_URL = process.env.APP_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : null);

const HTML_PATH  = path.join(__dirname, 'philcoin.html');
const htmlBuffer = fs.readFileSync(HTML_PATH);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlBuffer);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Веб-сервер запущен на порту', PORT);
  console.log('APP_URL:', APP_URL || '(не определён)');
});

async function sendWelcome(chatId) {
  if (!APP_URL) {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'Приложение почти готово 🐷' })
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
  const res  = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
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
    try { offset = await poll(offset); }
    catch (e) {
      console.error('Ошибка опроса Telegram:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

runBot();
