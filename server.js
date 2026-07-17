/**
 * Филькоин — Telegram Mini App + бот + общее API-хранилище.
 *
 * API (всё на том же домене):
 *   GET  /api/shared              — достижения, товары, рейтинг, forceBalances
 *   PUT  /api/shared              — полная запись (админ: achievements + market)
 *   POST /api/score               — обновить свой счёт в рейтинге {id,name,score}
 *   POST /api/force-balance       — админ: принудительный баланс {id,balance}
 *
 * Данные лежат в data.json рядом с сервером.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const BOT_TOKEN = '8669803367:AAHv05kMGaL9oHTSm4nXEXq1qjOyEiRcNqM';
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const APP_URL = process.env.APP_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : null);

const DATA_PATH = path.join(__dirname, 'data.json');
const HTML_PATH = path.join(__dirname, 'philcoin.html');
const htmlBuffer = fs.readFileSync(HTML_PATH);

function defaultShared() {
  return {
    achievements: [],
    market: [],
    skins: [],
    clans: [],
    leaderboard: [],
    forceBalances: {}
  };
}

let shared = defaultShared();

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      shared = {
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        market: Array.isArray(parsed.market) ? parsed.market : [],
        skins: Array.isArray(parsed.skins) ? parsed.skins : [],
        clans: Array.isArray(parsed.clans) ? parsed.clans : [],
        leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard : [],
        forceBalances: (parsed.forceBalances && typeof parsed.forceBalances === 'object')
          ? parsed.forceBalances : {}
      };
      console.log('data.json загружен:', {
        ach: shared.achievements.length,
        market: shared.market.length,
        lb: shared.leaderboard.length
      });
    }
  } catch (e) {
    console.error('Ошибка чтения data.json:', e.message);
    shared = defaultShared();
  }
}

let saveTimer = null;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_PATH, JSON.stringify(shared, null, 2), 'utf8');
    } catch (e) {
      console.error('Ошибка записи data.json:', e.message);
    }
  }, 200);
}

loadData();

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (pathname === '/api/shared' && req.method === 'GET') {
      sendJson(res, 200, shared);
      return;
    }

    if (pathname === '/api/shared' && req.method === 'PUT') {
      const body = await readBody(req);
      if (Array.isArray(body.achievements)) shared.achievements = body.achievements;
      if (Array.isArray(body.market)) shared.market = body.market;
      if (Array.isArray(body.skins)) shared.skins = body.skins;
      if (Array.isArray(body.clans)) shared.clans = body.clans;
      if (Array.isArray(body.leaderboard)) shared.leaderboard = body.leaderboard;
      if (body.forceBalances && typeof body.forceBalances === 'object') {
        shared.forceBalances = body.forceBalances;
      }
      saveData();
      sendJson(res, 200, { ok: true, shared });
      return;
    }

    if (pathname === '/api/score' && req.method === 'POST') {
      const body = await readBody(req);
      const id = String(body.id || '');
      const name = String(body.name || 'Игрок');
      const score = Math.max(0, Math.floor(Number(body.score) || 0));
      if (!id) {
        sendJson(res, 400, { ok: false, error: 'id required' });
        return;
      }
      if (!Array.isArray(shared.leaderboard)) shared.leaderboard = [];
      const idx = shared.leaderboard.findIndex(u => String(u.id) === id);
      const prev = idx >= 0 ? shared.leaderboard[idx] : {};
      const entry = {
        id,
        name,
        score,
        updated: Date.now(),
        photo: body.photo || prev.photo || null,
        username: body.username || prev.username || null,
        skins: Array.isArray(body.skins) ? body.skins : (prev.skins || []),
        activeSkin: body.activeSkin || prev.activeSkin || null,
        achievements: Array.isArray(body.achievements) ? body.achievements : (prev.achievements || []),
        public: body.public === true || body.public === false ? !!body.public : (prev.public !== false),
        clanId: body.clanId !== undefined ? body.clanId : (prev.clanId || null)
      };
      if (idx >= 0) shared.leaderboard[idx] = entry;
      else shared.leaderboard.push(entry);
      shared.leaderboard.sort((a, b) => b.score - a.score);
      shared.leaderboard = shared.leaderboard.slice(0, 100);
      saveData();
      sendJson(res, 200, { ok: true, leaderboard: shared.leaderboard });
      return;
    }

    if (pathname === '/api/force-balance' && req.method === 'POST') {
      const body = await readBody(req);
      const id = String(body.id || '');
      if (!id) {
        sendJson(res, 400, { ok: false, error: 'id required' });
        return;
      }
      if (!shared.forceBalances || typeof shared.forceBalances !== 'object') {
        shared.forceBalances = {};
      }
      const raw = Number(body.balance);
      // -1 or null => clear force flag (one-shot applied)
      if (body.balance === null || body.balance === undefined || raw < 0) {
        delete shared.forceBalances[id];
        saveData();
        sendJson(res, 200, { ok: true, forceBalances: shared.forceBalances, cleared: true });
        return;
      }
      const balance = Math.max(0, Math.floor(raw) || 0);
      shared.forceBalances[id] = balance;
      if (!Array.isArray(shared.leaderboard)) shared.leaderboard = [];
      const idx = shared.leaderboard.findIndex(u => String(u.id) === id);
      if (idx >= 0) {
        shared.leaderboard[idx].score = balance;
        shared.leaderboard[idx].updated = Date.now();
      } else {
        shared.leaderboard.push({ id, name: 'Игрок', score: balance, updated: Date.now() });
      }
      saveData();
      sendJson(res, 200, { ok: true, forceBalances: shared.forceBalances });
      return;
    }

    if (pathname === '/' || pathname === '/index.html' || pathname === '/philcoin.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(htmlBuffer);
      return;
    }


    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    console.error('request error:', e);
    sendJson(res, 500, { ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Веб-сервер + API на порту', PORT);
  console.log('APP_URL:', APP_URL || '(ещё не определён)');
});

async function sendWelcome(chatId) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: 'беги тапать фильку'
    })
  });
}

async function poll(offset) {
  const res = await fetch(`${TG_API}/getUpdates?timeout=30&offset=${offset}`);
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
