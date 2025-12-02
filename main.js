// main.js
// WhatsApp Bot Runner — Final Fix (Session Creator)
// ================================================
import 'dotenv/config';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import chalk from 'chalk';
import engine from './core/index.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-terminal');
const lib = require('@whiskeysockets/baileys');

function getBaileysFunction(key) { return lib[key] || lib.default?.[key] || lib.default?.default?.[key]; }
const makeWASocket = lib.default?.default || lib.default || lib;
const useMultiFileAuthState = getBaileysFunction('useMultiFileAuthState');
const DisconnectReason = getBaileysFunction('DisconnectReason');
const fetchLatestBaileysVersion = getBaileysFunction('fetchLatestBaileysVersion');
const jidNormalizedUser = getBaileysFunction('jidNormalizedUser');
const Browsers = getBaileysFunction('Browsers');

const SESSION_DIR = process.env.SESSION_DIR || 'session';
const localLogger = pino({ level: 'fatal' });

// readline for manual pairing input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ensure session dir exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Helper Serializer Pesan (Anti-Crash)
const serialize = (m, sock) => {
  if (!m || !m.messages?.[0]) return null;
  const msg = m.messages[0];
  if (!msg.message) return null; // Safety check
  if (msg.key?.remoteJid === 'status@broadcast') return null;
  
  const key = msg.key;
  const chatId = key.remoteJid;
  const isGroup = chatId.endsWith('@g.us');
  let senderRaw = isGroup ? key.participant : chatId;
  const sender = jidNormalizedUser(senderRaw || ''); 
  
  const type = Object.keys(msg.message).find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
  
  let body = '';
  if (type === 'conversation') body = msg.message.conversation;
  else if (type === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text;
  else if (type === 'imageMessage') body = msg.message.imageMessage?.caption;
  else if (type === 'videoMessage') body = msg.message.videoMessage?.caption;
  
  // include quoted context for plugins that may need it
  const quoted = msg.message?.extendedTextMessage?.contextInfo || null;
  const quotedKey = quoted?.stanzaId ? { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant } : null;

  return { 
    raw: msg, key, id: key.id, chatId, sender, 
    senderNumber: sender.split('@')[0], pushName: msg.pushName || 'User', 
    isGroup, fromMe: key.fromMe, type, body: body || '',
    quoted, quotedKey
  };
};

class WhatsAppClient {
  constructor() { 
    this.sock = null; 
    this.qrShown = false;
    this.pairingPromptShown = false;
  }

  async start() {
    // Session Auth
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    this.sock = makeWASocket({
      version, 
      logger: localLogger, 
      printQRInTerminal: false, 
      auth: state,
      browser: Browsers.ubuntu('FanraBot Manager'), 
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (u) => this.handleConnection(u));
    this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
  }

  async handleConnection({ connection, lastDisconnect, qr }) {
    // QR tampil — tampilkan sekali
    if (qr && !this.qrShown) {
        this.qrShown = true;
        console.clear();
        console.log(chalk.yellow('⚠️ SCAN QR CODE SEKARANG ⚠️'));
        qrcode.generate(qr, { small: true });

        // jika QR tidak discan dalam 25 detik -> minta manual pairing
        setTimeout(() => {
            try {
                const creds = this.sock?.auth?.state?.creds;
                const isRegistered = creds?.registered;
                if (!isRegistered && !this.pairingPromptShown) {
                    this.showManualPairingPrompt();
                }
            } catch (e) {}
        }, 25000);
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('❌ Sesi Logged Out. Hapus folder session dan scan ulang.'));
          process.exit(1);
      } else {
          // try reconnecting
          console.log(chalk.yellow('🔁 Connection closed, attempting reconnect...'));
          // on close, also prompt manual pairing (if not already shown)
          if (!this.pairingPromptShown) this.showManualPairingPrompt();
          setTimeout(() => this.start(), 1500);
      }
    } else if (connection === 'open') {
      engine.logger.info('CONN', chalk.green('WhatsApp Connected! 🚀'));
      this.injectToEngine();

      const settings = engine.settings; 
      if (settings.selfMessage !== false) {
          const botId = jidNormalizedUser(this.sock.user.id);
          const dashboardText = `
🤖 *FANRABOT ONLINE*
===================
✅ *Status System:*
• Group Mode: ${settings.groupMode ? 'ON' : 'OFF'}
• Private Mode: ${settings.privateMode ? 'ON' : 'OFF'}

_Bot berhasil terhubung dan siap digunakan._
          `.trim();
          
          try { await this.sock.sendMessage(botId, { text: dashboardText }); } catch (e) {}
      }
    }

    // If not registered (no saved credentials), proactively show pairing code when possible (one-time attempt)
    try {
      const creds = this.sock?.auth?.state?.creds;
      const isRegistered = creds?.registered;
      if (!isRegistered && !this.pairingPromptShown) {
        // small delay to let socket initialize methods
        setTimeout(() => {
          // Try library pairing helper first (if available), otherwise do nothing — QR will handle it
          if (typeof this.sock?.generatePairingCode === 'function') {
            // show library pairing code (if supported)
            this.showPairingCodeIfAvailable();
          }
          // don't auto open manual prompt here to avoid double prompts — we trigger manual prompt only on QR timeout or close
        }, 1200);
      }
    } catch (e) {}
  }

  async showPairingCodeIfAvailable() {
    try {
      if (!this.sock) return;
      if (typeof this.sock.generatePairingCode === 'function') {
        const code = await this.sock.generatePairingCode();
        if (code) {
          console.log(chalk.green('\n🔐 Pairing Code (gunakan di WhatsApp -> Perangkat Tertaut -> Tautkan Perangkat):'));
          console.log(chalk.cyan(`  ${code}\n`));
        }
      }
    } catch (e) {
      // ignore — fallback to manual prompt if necessary
    }
  }

  showManualPairingPrompt() {
    // Show once
    if (this.pairingPromptShown) return;
    this.pairingPromptShown = true;

    console.log(chalk.yellow('\n⚠️ QR CODE tidak ter-scan atau gagal. Silakan masukkan Pairing Code / SN secara manual.'));
    console.log(chalk.gray('Masukkan kode pairing (contoh: 123-456-789) lalu tekan Enter.\n'));

    rl.question('Masukkan Pairing Code / SN: ', (input) => {
      const code = (input || '').toString().trim();
      if (!code) {
        console.log(chalk.red('❌ Kode kosong — batal.'));
        // allow retry once after small delay
        this.pairingPromptShown = false;
        setTimeout(() => this.showManualPairingPrompt(), 800);
        return;
      }

      // Show instruction to user for where to input code on WhatsApp device
      console.log(chalk.green('\n🔐 Pairing Code yang dimasukkan:'));
      console.log(chalk.cyan(`  ${code}\n`));
      console.log(chalk.gray('Sekarang buka WhatsApp di ponsel → Perangkat Tertaut → Tautkan Perangkat → Masukkan Kode tersebut.\n'));
      console.log(chalk.gray('Jika pairing tidak berhasil, jalankan ulang proses dan scan QR atau masukkan kembali kode.\n'));
      // keep promptShown true to prevent duplicate prompts
    });
  }

  async handleMessages({ messages, type }) {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        const meta = serialize({ messages: [m] }, this.sock);
        if (meta) await engine.dispatchEvent('message', meta);
      } catch (e) {}
    }
  }

  injectToEngine() {
    engine.mockWA = {
      sock: this.sock,
      reply: (jid, text, opts = {}) => this.sock.sendMessage(jid, { text }, { quoted: opts.quoted }),
      sendMessage: (jid, content, opts = {}) => this.sock.sendMessage(jid, content, opts),
      react: (jid, emoji, quoted) => this.sock.sendMessage(jid, { react: { text: emoji, key: quoted?.key } }),
      deleteMessage: (key) => this.sock.sendMessage(key.remoteJid, { delete: key })
    };
  }
}

(async () => { 
  await engine.start(); 
  await new WhatsAppClient().start(); 
  // keep process running to accept manual input from readline
})();
