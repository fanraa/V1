// main.js
// WhatsApp Bot Runner — Optimized (Fanrabot v1.2)
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

// Ambil fungsi penting dari Baileys
function getBaileysFunction(key) { return lib[key] || lib.default?.[key] || lib.default?.default?.[key]; }
const makeWASocket = lib.default?.default || lib.default || lib;
const useMultiFileAuthState = getBaileysFunction('useMultiFileAuthState');
const DisconnectReason = getBaileysFunction('DisconnectReason');
const fetchLatestBaileysVersion = getBaileysFunction('fetchLatestBaileysVersion');
const jidNormalizedUser = getBaileysFunction('jidNormalizedUser');
const Browsers = getBaileysFunction('Browsers');
const downloadMediaMessage = getBaileysFunction('downloadMediaMessage'); // Helper download bawaan

const SESSION_DIR = process.env.SESSION_DIR || 'session';
// Ubah level ke 'info' atau 'error' agar log lebih bersih tapi tetap informatif
const localLogger = pino({ level: 'info' }); 

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// --- IMPROVED SERIALIZER (ANTI-CRASH) ---
const serialize = async (m, sock) => { // <<< --- DIUBAH MENJADI ASYNC ---
  if (!m || !m.messages?.[0]) return null;
  const msg = m.messages[0];
  if (!msg.message) return null;
  if (msg.key?.remoteJid === 'status@broadcast') return null;
  
  const key = msg.key;
  const chatId = key.remoteJid;
  const isGroup = chatId.endsWith('@g.us');
  let senderRaw = isGroup ? key.participant : chatId;
  const sender = jidNormalizedUser(senderRaw || ''); 
  
  // Deteksi tipe pesan lebih lengkap
  let type = Object.keys(msg.message).find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
  
  // Handle ViewOnce (pesan sekali lihat)
  if (type === 'viewOnceMessage' || type === 'viewOnceMessageV2') {
      msg.message = msg.message[type].message;
      type = Object.keys(msg.message).find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
  }

  let body = '';
  // Ekstrak text/caption berdasarkan tipe
  if (type === 'conversation') body = msg.message.conversation;
  else if (type === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text;
  else if (type === 'imageMessage') body = msg.message.imageMessage?.caption;
  else if (type === 'videoMessage') body = msg.message.videoMessage?.caption;
  else if (type === 'documentMessage') body = msg.message.documentMessage?.caption;
  // Sticker & Audio biasanya tidak punya body text, biarkan kosong atau isi penanda
  
  const quoted = msg.message?.extendedTextMessage?.contextInfo || 
                 msg.message?.imageMessage?.contextInfo || 
                 msg.message?.videoMessage?.contextInfo || null;
                 
  const quotedKey = quoted?.stanzaId ? { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant } : null;

    // --- [TAMBAHAN] Logika Admin Grup ---
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup && sock?.groupMetadata) {
        try {
            const groupMetadata = await sock.groupMetadata(chatId);
            const botId = sock.user.id;
            const groupAdmins = groupMetadata.participants.filter(p => p.admin);
            
            isAdmin = groupAdmins.some(p => p.id === sender);
            isBotAdmin = groupAdmins.some(p => p.id === botId);
        } catch (e) {
            // Jika gagal ambil metadata, anggap bukan admin
            localLogger.warn('SERIALIZER', `Failed to get group metadata for ${chatId}: ${e.message}`);
        }
    }
    // ------------------------------------

  return { 
    raw: msg, // Pesan asli (penting untuk download media)
    key, id: key.id, chatId, sender, 
    senderNumber: sender.split('@')[0], pushName: msg.pushName || 'User', 
    isGroup, fromMe: key.fromMe, type, body: body || '',
    quoted, quotedKey,
    // --- Data Baru untuk Core Engine ---
    isAdmin, // Apakah pengirim adalah Admin Grup
    isBotAdmin // Apakah Bot adalah Admin Grup
    // ------------------------------------
  };
};

class WhatsAppClient {
  constructor() { 
    this.sock = null; 
    this.qrShown = false;
    this.pairingPromptShown = false;
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    this.sock = makeWASocket({
      version, 
      logger: localLogger, 
      printQRInTerminal: false, 
      auth: state,
      browser: Browsers.ubuntu('FanraBot Manager'), 
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      // Tambahkan timeout agar tidak hang
      connectTimeoutMs: 60000, 
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (u) => this.handleConnection(u));
    this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
  }

  async handleConnection({ connection, lastDisconnect, qr }) {
    if (qr && !this.qrShown) {
        this.qrShown = true;
        console.clear();
        console.log(chalk.yellow('⚠️ SCAN QR CODE SEKARANG ⚠️'));
        qrcode.generate(qr, { small: true });

        setTimeout(() => {
            try {
                const creds = this.sock?.auth?.state?.creds;
                if (!creds?.registered && !this.pairingPromptShown) {
                    this.showManualPairingPrompt();
                }
            } catch (e) {}
        }, 20000); // Dipercepat ke 20 detik
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('❌ Sesi Logged Out. Hapus folder session dan scan ulang.'));
          process.exit(1);
      } else {
          console.log(chalk.yellow(`🔁 Koneksi terputus (${reason}), mencoba reconnect...`));
          if (!this.pairingPromptShown) this.showManualPairingPrompt();
          setTimeout(() => this.start(), 2000);
      }
    } else if (connection === 'open') {
      engine.logger.info('CONN', chalk.green('WhatsApp Connected! 🚀'));
      this.injectToEngine();
      this.pairingPromptShown = true; // Supaya tidak minta pairing lagi saat sudah connect

      // Notifikasi ke owner (Self Message)
      const settings = engine.settings; 
      if (settings.selfMessage !== false) {
          const botId = jidNormalizedUser(this.sock.user.id);
          const dashboardText = `
🤖 *FANRABOT ONLINE (v1.2)*
===================
✅ *Status System:*
• Group Mode: ${settings.groupMode ? 'ON' : 'OFF'}
• Private Mode: ${settings.privateMode ? 'ON' : 'OFF'}
• Serializer: Enhanced

_Bot berhasil terhubung dan siap digunakan._
          `.trim();
          try { await this.sock.sendMessage(botId, { text: dashboardText }); } catch (e) {}
      }
    }

    // Auto Pairing Code Trigger
    try {
      const creds = this.sock?.auth?.state?.creds;
      if (!creds?.registered && !this.pairingPromptShown) {
        setTimeout(() => {
          if (typeof this.sock?.generatePairingCode === 'function') {
            this.showPairingCodeIfAvailable();
          }
        }, 1500);
      }
    } catch (e) {}
  }

  async showPairingCodeIfAvailable() {
    try {
      if (!this.sock) return;
      // Memastikan kita tidak generate code terus menerus
      if (this.pairingPromptShown) return;
      
      const code = await this.sock.generatePairingCode();
      if (code) {
        console.log(chalk.green('\n🔐 Pairing Code (Otomatis):'));
        console.log(chalk.cyan(`  ${code}\n`));
      }
    } catch (e) {}
  }

  showManualPairingPrompt() {
    if (this.pairingPromptShown) return;
    this.pairingPromptShown = true;

    console.log(chalk.yellow('\n⚠️  Gunakan Pairing Code jika QR tidak muncul.'));
    console.log(chalk.gray('Masukkan Nomor HP (format: 628xxx) untuk mendapatkan kode pairing, atau tekan Enter untuk skip.\n'));

    rl.question('Nomor HP Bot: ', async (input) => {
      const number = (input || '').toString().trim().replace(/[^0-9]/g, '');
      if (!number) {
        console.log(chalk.red('❌ Batal. Menunggu QR...'));
        this.pairingPromptShown = false; // Reset agar bisa muncul lagi jika perlu
        return;
      }

      try {
        const code = await this.sock.requestPairingCode(number);
        console.log(chalk.green('\n🔐 Kode Pairing Anda:'));
        console.log(chalk.bold.cyan(`  ${code?.match(/.{1,4}/g)?.join('-') || code}\n`));
        console.log(chalk.gray('Masukkan kode ini di HP: Perangkat Tertaut > Tautkan > Masukkan No HP.\n'));
      } catch (e) {
        console.log(chalk.red('Gagal request pairing code: ' + e.message));
        this.pairingPromptShown = false;
      }
    });
  }

  async handleMessages({ messages, type }) {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        // Logika serialize dipanggil di sini, kini dengan 'this.sock'
        const meta = await serialize({ messages: [m] }, this.sock); // <<< --- DIUBAH MENJADI AWAIT ---
        if (meta) await engine.dispatchEvent('message', meta);
      } catch (e) {
        console.error(chalk.red('Error handling message:'), e);
      }
    }
  }

  injectToEngine() {
    engine.mockWA = {
      sock: this.sock,
      reply: (jid, text, opts = {}) => this.sock.sendMessage(jid, { text }, { quoted: opts.quoted }),
      sendMessage: (jid, content, opts = {}) => this.sock.sendMessage(jid, content, opts),
      react: (jid, emoji, quoted) => this.sock.sendMessage(jid, { react: { text: emoji, key: quoted?.key } }),
      deleteMessage: (key) => this.sock.sendMessage(key.remoteJid, { delete: key }),
      
      // --- NEW FEATURE: Media Downloader Helper ---
      // Cara pakai di plugin: const buffer = await engine.mockWA.downloadMedia(msg);
      downloadMedia: async (msg) => {
          try {
             // Pastikan mengambil raw message (msg.raw) jika yang dikirim adalah objek serialize
             const rawMessage = msg.raw || msg; 
             const buffer = await downloadMediaMessage(
                rawMessage,
                'buffer',
                { },
                { logger: localLogger, reuploadRequest: this.sock.updateMediaMessage }
             );
             return buffer;
          } catch (e) {
             console.error('Download media failed:', e);
             return null;
          }
      }
    };
  }
}

// --- GLOBAL ERROR HANDLING (Supaya Bot Gak Mati Sendiri) ---
process.on('uncaughtException', (err) => {
    console.error(chalk.red('🔥 Uncaught Exception:'), err);
    // Jangan process.exit() agar bot tetap jalan
});

process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('🔥 Unhandled Rejection:'), reason);
});

(async () => { 
  console.log(chalk.blue('Memulai FanraBot Engine...'));
  await engine.start(); 
  await new WhatsAppClient().start(); 
})();