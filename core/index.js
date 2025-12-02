// core/index.js
// FanraBot Core Engine — Ultimate Version (Original Features + AI Fix)
// ====================================================================
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { EventEmitter } from 'events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

class Logger {
  constructor() {
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.level = this.levels.debug; 
    this.logDir = path.join(ROOT, 'logs');
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
  }

  getTime() { return new Date().toLocaleTimeString('id-ID', { hour12: false }); }
  stripAnsi(str) { return String(str).replace(/\x1B\[[0-9;]*[mK]/g, ''); }

  print(level, tag, message) {
    const time = chalk.gray(`[${this.getTime()}]`);
    let tagStyle; 
    let emoji = ' ';

    // [RESTORED] Mengembalikan semua tag warna-warni aslimu
    switch (tag) {
      case 'DB': tagStyle = chalk.bgBlue.white.bold; emoji = '💾'; break;
      case 'CORE': tagStyle = chalk.bgWhite.black.bold; emoji = '⚙️'; break;
      case 'PLUGIN': tagStyle = chalk.bgCyan.black.bold; emoji = '🧩'; break;
      case 'CMD': tagStyle = chalk.bgGreen.black.bold; emoji = '🕹️'; break;
      
      // Tag Spesifik Plugin
      case 'BADWORDS': tagStyle = chalk.bgMagenta.white.bold; emoji = '🛡️'; break;
      case 'ANTILINK': tagStyle = chalk.bgBlue.white.bold; emoji = '🔗'; break;
      case 'ANTISPAM': tagStyle = chalk.bgRed.white.bold; emoji = '🚫'; break;
      case 'OWNERKEY': tagStyle = chalk.bgYellow.black.bold; emoji = '👑'; break;
      case 'DL': 
      case 'DL-IG': 
      case 'DL-TT': tagStyle = chalk.bgBlue.white.bold; emoji = '⬇️'; break;
      
      // [NEW] Tambahan Tag untuk AI
      case 'AI': tagStyle = chalk.bgMagenta.white.bold; emoji = '🤖'; break;

      default: tagStyle = chalk.bgBlack.white; emoji = '💡';
    }

    if (level === 'error') { tagStyle = chalk.bgRed.white.bold; emoji = '❌'; }
    else if (level === 'warn') { tagStyle = chalk.bgYellow.black.bold; emoji = '⚠️'; }

    const tagString = tagStyle(` ${emoji} ${tag} `);
    const msgStr = Array.isArray(message) ? message.join(' ') : message;
    
    console.log(`${time} ${tagString} ${msgStr}`);
    this.writeToFile(level, tag, msgStr);
  }

  writeToFile(level, tag, msg) {
    try {
      const cleanMsg = this.stripAnsi(msg);
      const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${tag}] ${cleanMsg}\n`;
      const fileName = `${new Date().toISOString().split('T')[0]}.log`;
      fs.appendFileSync(path.join(this.logDir, fileName), line);
    } catch (e) {}
  }

  info(tag, ...msg) { if (this.level <= this.levels.info) this.print('info', tag, msg); }
  warn(tag, ...msg) { if (this.level <= this.levels.warn) this.print('warn', tag, msg); }
  error(tag, ...msg) { if (this.level <= this.levels.error) this.print('error', tag, msg); }
  debug(tag, ...msg) { if (this.level <= this.levels.debug) this.print('debug', tag, msg); }
}

class ConfigManager {
  constructor() {
    this.botConfigPath = path.join(ROOT, 'config', 'bot.json');
    this.pluginConfigPath = path.join(ROOT, 'config', 'plugins.json');
    this.bot = {}; this.plugins = {};
  }
  
  async load() {
    try { this.bot = JSON.parse(await fsPromises.readFile(this.botConfigPath, 'utf-8')); } catch { this.bot = {}; }
    try { this.plugins = JSON.parse(await fsPromises.readFile(this.pluginConfigPath, 'utf-8')); } catch { this.plugins = {}; }
  }

  get(key, defaultValue = null) {
    const keys = key.split('.');
    let current = this.bot;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) current = current[k];
      else return defaultValue;
    }
    return current ?? defaultValue;
  }
}

class PluginRegistry {
  constructor(logger) { 
    this.plugins = new Map(); 
    this.logger = logger; 
    this.modulePaths = new Map(); 
  }

  register(pluginObj, sourcePath = null) {
    if (!pluginObj || typeof pluginObj !== 'object' || !pluginObj.name) return false;
    const { name, version = '1.0.0', type = 'utility', priority = 10 } = pluginObj;
    this.plugins.set(name, { ...pluginObj, version, type, priority, enabled: true });
    if (sourcePath) this.modulePaths.set(name, sourcePath);
    this.logger.info('PLUGIN', `Loaded: ${name} v${version}`);
    return true;
  }

  unregister(name) {
    if (this.plugins.has(name)) {
      this.plugins.delete(name);
      this.modulePaths.delete(name);
      this.logger.info('PLUGIN', `Unregistered: ${name}`);
      return true;
    }
    return false;
  }

  list() { return Array.from(this.plugins.values()).sort((a,b) => (a.priority||10)-(b.priority||10)); }
  get(name) { return this.plugins.get(name); }
}

export class BotCoreEngine {
  constructor() {
    this.logger = new Logger();
    this.config = new ConfigManager();
    this.registry = new PluginRegistry(this.logger);
    this.eventBus = new EventEmitter();
    this.cooldowns = new Map();
    
    this.usersFile = path.join(ROOT, 'data', 'users.json');
    this.settingsFile = path.join(ROOT, 'data', 'settings.json');

    this.users = new Map();
    this.settings = {}; 
    this.saveTimeout = null;

    this.mockWA = {}; 
    this.utils = { sleep: (ms) => new Promise(r => setTimeout(r, ms)) };

    this.startFileWatcher();
  }

  async loadDatabases() {
    try {
        if (!fs.existsSync(path.dirname(this.usersFile))) fs.mkdirSync(path.dirname(this.usersFile), { recursive: true });
        if (!fs.existsSync(this.usersFile)) await fsPromises.writeFile(this.usersFile, '{}');
        const raw = await fsPromises.readFile(this.usersFile, 'utf-8');
        const obj = JSON.parse(raw || '{}');
        for (const [k, v] of Object.entries(obj)) this.users.set(k, v);
        this.logger.info('DB', `Users Loaded: ${this.users.size}`);
    } catch(e) { this.users = new Map(); this.logger.warn('DB', 'Failed loading users, starting fresh.'); }

    try {
        if (!fs.existsSync(this.settingsFile)) {
            this.settings = { groupMode: true, privateMode: true, selfMessage: true };
            await fsPromises.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
        } else {
            const raw = await fsPromises.readFile(this.settingsFile, 'utf-8');
            this.settings = JSON.parse(raw || '{}');
        }
        this.logger.info('DB', `Settings Loaded.`);
    } catch(e) { 
        this.settings = { groupMode: true, privateMode: true, selfMessage: true }; 
        this.logger.warn('DB', 'Failed loading settings, using defaults.');
    }
  }

  async saveData(force = false) {
    if (this.saveTimeout && !force) clearTimeout(this.saveTimeout);
    const doSave = async () => {
      try {
        await fsPromises.writeFile(this.usersFile, JSON.stringify(Object.fromEntries(this.users), null, 2));
        await fsPromises.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
        this.logger.debug('DB', 'Saved users & settings to disk.');
      } catch (err) { this.logger.error('DB', 'Save failed:', err.message); }
    };
    if (force) await doSave(); else this.saveTimeout = setTimeout(doSave, 2000);
  }

  // [NEW] Fungsi cek owner agar plugin AI tidak error
  isOwner(sender) {
    if (!sender) return false;
    const id = sender.replace(/\D/g, '');
    const CONFIG_OWNER = '62881011264063'; // Nomor Owner Utama
    return id.includes(CONFIG_OWNER);
  }

  async registerUser(ctx) {
    if (!ctx || !ctx.senderNumber) return;
    const id = ctx.senderNumber;
    let user = this.users.get(id);
    const now = new Date().toISOString();
    
    // Logic Owner Check
    let isOwner = this.isOwner(id);

    if (!user) {
        user = { id, name: ctx.pushName||'User', role: 'member', tokens: 10, interactions: 0, createdAt: now, premium: false, premiumUntil: null };
        this.users.set(id, user);
    }
    user.lastSeen = now;
    user.interactions = (user.interactions||0) + 1;
    
    if (isOwner) user.role = 'owner';
    else if (ctx.fromMe) user.role = 'bot';
    
    this.saveData();
    return user;
  }

  isPremium(userId) {
    const u = this.users.get(userId);
    if (!u) return false;
    if (u.premium === true) return true;
    if (u.premiumUntil) {
      const until = new Date(u.premiumUntil);
      if (!isNaN(until) && until > new Date()) return true;
    }
    return false;
  }

  buildContext(rawEvent) {
    return {
      ...rawEvent,
      bot: this.mockWA,
      reply: async (text) => {
        try { return await this.mockWA.reply(rawEvent.chatId, text, { quoted: rawEvent.raw }); }
        catch(e) { this.logger.error('REPLY', `Failed: ${e.message}`); }
      },
      sendMessage: async (content) => {
         try { return await this.mockWA.sendMessage(rawEvent.chatId, content); }
         catch(e) { this.logger.error('SEND', `Failed: ${e.message}`); }
      },
      react: async (emoji) => {
         try { return await this.mockWA.react(rawEvent.chatId, emoji, rawEvent.raw); }
         catch(e) { this.logger.error('REACT', `Failed: ${e.message}`); }
      },
      deleteMessage: async (key) => {
          try {
              return await this.mockWA.sock.sendMessage(rawEvent.chatId, { delete: key }); 
          } catch(e) { 
              this.logger.error('DELETE', `Failed to delete message: ${e.message}`);
              throw e;
          }
      },
      
      saveUsers: async () => { await this.saveData(true); },
      
      config: this.config, logger: this.logger,
      user: this.users.get(rawEvent.senderNumber),
      settings: this.settings,
      updateSettings: (key, value) => {
          this.settings[key] = value;
          this.saveData(true); 
      },
      listPlugins: () => this.registry.list(),
      isPremium: (userId) => this.isPremium(userId),
      // [NEW] Expose isOwner ke plugin
      isOwner: (id) => this.isOwner(id),
      // [TAMBAHAN] Expose Admin status
      isAdmin: rawEvent.isAdmin || false, 
      isBotAdmin: rawEvent.isBotAdmin || false
    };
  }

  async dispatchEvent(eventName, rawData) {
    let ctx;
    
    if (eventName === 'message') {
        ctx = this.buildContext(rawData);
        try { ctx.user = await this.registerUser(ctx); } catch {}

        // 1. Jalankan Plugin Event (AI, Antilink, dll)
        const eventPlugins = this.registry.list().filter(p => p.enabled && p.events && p.events[eventName]);

        for (const p of eventPlugins) {
            try {
                // Pass ctx ke plugin
                await p.events[eventName]({ ...ctx, plugin: p });
            } catch (e) {
                this.logger.error('EVENT', `Error in ${p.name}:${eventName}: ${e.message}`);
            }
        }

        // 2. Jalankan Plugin Command
        const body = (ctx.body || '').trim();
        const isCommand = /^[.!/#]/.test(body);
        const isOwner = ctx.user?.role === 'owner';
      
        if (isCommand) {
            const parts = body.slice(1).trim().split(/\s+/);
            const cmdName = parts[0].toLowerCase();
            ctx.command = cmdName;
            ctx.args = parts.slice(1);
            
            // [RESTORED] Strict Mode Filter
            const rescueCmds = ['setting', 'settings', 'mode', 'setup', 'ai']; // + AI agar aman

            if (ctx.isGroup && this.settings.groupMode === false) {
                if (isOwner) { if (!rescueCmds.includes(cmdName)) return; } else { return; }
            }
            if (!ctx.isGroup && this.settings.privateMode === false) {
                if (isOwner) { if (!rescueCmds.includes(cmdName)) return; } else { return; }
            }

            this.logger.info('CMD', `${cmdName} | ${ctx.pushName} | ${isOwner ? 'OWNER' : 'USER'}`);

            if (!isOwner) {
                const cdKey = `${ctx.senderNumber}:${cmdName}`;
                const now = Date.now();
                if (this.cooldowns.has(cdKey) && now - this.cooldowns.get(cdKey) < 2000) return;
                this.cooldowns.set(cdKey, now);
            }

            const plugins = this.registry.list().filter(p => p.enabled && p.type === 'command');
            for (const p of plugins) {
                try {
                  const cmds = Array.isArray(p.cmd) ? p.cmd : [p.cmd];
                  if (cmds.includes(cmdName)) {
                        // --- [MODIFIKASI] Cek Hak Akses Plugin ---
                        const access = p.access || {}; 
                        
                        // 1. Cek OWNER (Prioritas tertinggi)
                        // Jika plugin mengharuskan isOwner, blokir non-owner.
                        if (access.isOwner === true && ctx.user?.role !== 'owner') {
                            ctx.reply(`❌ Perintah *${cmdName}* hanya untuk Owner Bot.`);
                            return;
                        }
                        
                        // 2. Cek ADMIN GRUP
                        // Blokir jika: Ini Grup AND memerlukan Admin AND (bukan Admin Grup AND bukan Owner Bot)
                        if (ctx.isGroup && access.isAdmin === true && ctx.isAdmin !== true && ctx.user?.role !== 'owner') {
                            ctx.reply(`🛠️ Perintah *${cmdName}* hanya untuk Admin Grup.`);
                            return;
                        }

                        // 3. Cek PREMIUM
                        if (access.isPremium === true && !this.isPremium(ctx.senderNumber)) {
                            ctx.reply(`💎 Perintah *${cmdName}* hanya untuk pengguna Premium.`);
                            return;
                        }

                        // 4. Cek Group/Private Mode
                        if (access.isGroup === false && ctx.isGroup) {
                            ctx.reply(`👤 Perintah *${cmdName}* hanya bisa digunakan di Private Chat.`);
                            return;
                        }
                        
                        if (access.isGroup === true && !ctx.isGroup) {
                             ctx.reply(`🌐 Perintah *${cmdName}* hanya bisa digunakan di Grup Chat.`);
                             return;
                        }
                        // -----------------------------------------
                        
                    // [FIX] Kirim ctx dengan benar
                    await p.run({ ...ctx, plugin: p });
                  }
                } catch (e) { 
                    this.logger.error('PLUGIN', `Error in ${p.name}: ${e.message}`); 
                    try { ctx.reply(`❌ System Error: ${e.message}`); } catch {}
                }
            }
        }
    } else {
        ctx = { ...rawData, bot: this.mockWA };
    }
  }

  async loadPlugins() {
    const pluginsDir = path.join(ROOT, 'plugins');
    if (!fs.existsSync(pluginsDir)) return;
    const files = await fsPromises.readdir(pluginsDir).then(f => f.filter(x => x.endsWith('.js')));
    for (const f of files) {
        try {
            const module = await import(pathToFileURL(path.join(pluginsDir, f)).href);
            const plugin = module.default || module;
            if (plugin?.name) {
                this.registry.register(plugin, path.join(pluginsDir, f));
                // [FIX FATAL] Jalankan fungsi load() jika ada (INI YANG BIKIN AI NYALA)
                if (typeof plugin.load === 'function') await plugin.load(this.logger);
            }
        } catch (e) { this.logger.error('LOAD', `Fail ${f}: ${e.message}`); }
    }
  }

  startFileWatcher() {
    chokidar.watch(path.join(ROOT, 'config')).on('change', () => this.config.load());
    this.logger.debug('CORE', 'Config watcher started.');
  }

  // [RESTORED] Mengembalikan fungsi Watcher yang canggih (add/change/unlink)
  startPluginWatcher() {
    const pluginsDir = path.join(ROOT, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      this.logger.info('CORE', 'Plugin directory missing, skipping plugin watcher.');
      return;
    }

    const watcher = chokidar.watch(pluginsDir, { ignoreInitial: true, persistent: true });
    
    // Handler File Baru
    watcher.on('add', async (file) => {
      const name = path.basename(file);
      try {
        const fileURL = pathToFileURL(file).href;
        const module = await import(fileURL + `?t=${Date.now()}`);
        const plugin = module.default || module;
        if (plugin?.name) {
          this.registry.register(plugin, file);
          // [FIX] Load saat file baru ditambahkan
          if (typeof plugin.load === 'function') await plugin.load(this.logger);
          this.logger.info('PLUGIN', `+ Added: ${plugin.name}`);
        } else this.logger.warn('PLUGIN', `Added file ${name} but not a valid plugin.`);
      } catch (e) { this.logger.error('PLUGIN', `Add failed (${name}): ${e.message}`); }
    });

    // Handler File Berubah (Hot Reload)
    watcher.on('change', async (file) => {
      const name = path.basename(file);
      try {
        const fileURL = pathToFileURL(file).href;
        const module = await import(fileURL + `?update=${Date.now()}`);
        const plugin = module.default || module;
        if (plugin?.name) {
          this.registry.register(plugin, file);
          // [FIX] Load ulang saat file diedit
          if (typeof plugin.load === 'function') await plugin.load(this.logger);
          this.logger.info('PLUGIN', `♻ Reloaded: ${plugin.name}`);
        } else {
          this.logger.warn('PLUGIN', `Changed file ${name} but plugin invalid.`);
        }
      } catch (e) {
        this.logger.error('PLUGIN', `Reload failed (${name}): ${e.message}`);
      }
    });

    // Handler File Dihapus
    watcher.on('unlink', (file) => {
      const name = path.basename(file, '.js');
      if (this.registry.get(name)) {
        this.registry.unregister(name);
        this.logger.info('PLUGIN', `- Removed: ${name}`);
      } else {
        this.logger.info('PLUGIN', `File removed: ${name}`);
      }
    });

    this.logger.info('CORE', 'Plugin Watcher Activated ✔');
  }

  async start() {
    console.clear();
    this.logger.info('CORE', 'Starting Engine v5.5 (Original + AI Fix)...');
    await this.config.load();
    await this.loadDatabases(); 
    await this.loadPlugins();
    this.startPluginWatcher();
    this.logger.info('CORE', 'Engine Ready!');
  }
}

const engine = new BotCoreEngine();
export default engine;
if (import.meta.url === `file://${process.argv[1]}`) engine.start();