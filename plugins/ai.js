import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai'; 
import 'dotenv/config'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AI_DATA_PATH = path.join(ROOT, 'data', 'ai.json');

// --- KATA KUNCI PEMICU (TRIGGER) ---
const TRIGGER_KEYWORDS = ['fanra', 'fanrabot', 'bot', 'assistant'];

// 🔥 KEY ROTATION GLOBAL STATE 🔥
let GEMINI_CLIENTS = []; 
let currentKeyIndex = 0;   

let aiData = { 
    botName: 'FanraBot', 
    config: { active: true, groupAutoReply: false }, // <-- NEW CONFIG ADDED
    stats: { totalRequests: 0, todayRequests: 0, lastResetDate: '' }
};

let lastUserTime = new Map();

async function saveData() {
    try { await fs.writeFile(AI_DATA_PATH, JSON.stringify(aiData, null, 2)); } catch (e) {}
}

function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0]; 
    if (aiData.stats.lastResetDate !== today) {
        aiData.stats.todayRequests = 0;
        aiData.stats.lastResetDate = today;
        saveData();
    }
}

async function getGeminiResponse(query, logger) {
    if (GEMINI_CLIENTS.length === 0) {
        logger.error('AI', 'Semua Client Gemini tidak tersedia.');
        return null;
    }
    
    const totalKeys = GEMINI_CLIENTS.length;
    let attempts = 0;

    while (attempts < totalKeys) {
        const clientIndex = currentKeyIndex;
        const currentClient = GEMINI_CLIENTS[clientIndex];
        attempts++;
        
        try {
            const systemInstruction = `You are ${aiData.botName}, a cool and helpful AI Assistant. Your default language is English. However, if the user speaks Indonesian or any other language, you MUST reply in that language. Keep your answers concise and helpful.`;

            const response = await currentClient.models.generateContent({
                model: 'gemini-2.0-flash', 
                contents: [{ role: "user", parts: [{ text: query }] }],
                config: { systemInstruction, maxOutputTokens: 300 }
            });
            
            currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
            
            return response.text || "Sorry, I can't answer that right now."; 

        } catch (e) {
            logger.warn('AI', `Key #${clientIndex + 1} failed (${e.message.slice(0, 50)}...). Attempting next key.`);
            
            currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
            
            if (attempts === totalKeys) {
                logger.error('AI', 'All available API keys failed or hit rate limits.');
                break;
            }
        }
    }
    
    return 'Sorry, all AI resources are currently exhausted. Please try again later.';
}

export default {
    name: "ai_controller",
    version: "7.3-CONV-MODE", 
    cmd: ['ai', 'aii'], // <-- Tambahkan perintah .aii
    type: 'command', 

    load: async (logger) => {
        try {
            try { await fs.access(AI_DATA_PATH); } catch {
                await fs.mkdir(path.dirname(AI_DATA_PATH), { recursive: true });
                await saveData();
            }
            const raw = await fs.readFile(AI_DATA_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            
            // Gabungkan data yang ada, pastikan config baru (groupAutoReply) ada
            aiData = { ...aiData, ...parsed, config: { ...aiData.config, ...parsed.config } };
            
            if (!aiData.stats) aiData.stats = { totalRequests: 0, todayRequests: 0, lastResetDate: '' };
            checkDailyReset();

            const keysStr = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY; 
            
            if (keysStr) {
                const keyArray = keysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
                GEMINI_CLIENTS = keyArray.map(key => new GoogleGenAI({ apiKey: key }));
                logger.info('AI', `✅ Loaded ${GEMINI_CLIENTS.length} Gemini API keys for rotation.`);
            } else {
                logger.warn('AI', '❌ GEMINI API KEY(s) MISSING. Please set GEMINI_KEYS in .env.');
            }
            
            const status = GEMINI_CLIENTS.length > 0 ? (aiData.config.active ? 'ON' : 'OFF') : 'INACTIVE';
            logger.info('AI', `Status: ${status}`);

        } catch (e) { logger.error('AI', `Load Failed: ${e.message}`); }
    },

    run: async (ctx) => {
        const { args, reply } = ctx;
        const totalKeys = GEMINI_CLIENTS.length;
        const commandUsed = ctx.command;
        const mode = args[0]?.toLowerCase();
        
        // --- Cek Owner (untuk .aii) ---
        const senderId = ctx.sender;
        const isOwner = ctx.isOwner(senderId) || ctx.user && ctx.user.role === 'owner';

        // --- LOGIC UNTUK PERINTAH .AII (Conversation Mode) ---
        if (commandUsed === 'aii') {
            if (!isOwner) return reply("❌ This command is restricted to **Bot Owner**.");
            
            if (mode === 'open' || mode === 'on') {
                aiData.config.groupAutoReply = true;
                await saveData();
                return reply('🤖 *AI Conversation Mode ON*\nThe bot will now respond to general group messages.');
            } else if (mode === 'close' || mode === 'off') {
                aiData.config.groupAutoReply = false;
                await saveData();
                return reply('💤 *AI Conversation Mode OFF*\nThe bot will only reply when called by name or replied to.');
            }
            return reply(`*AI Conversation Mode Status: ${aiData.config.groupAutoReply ? '✅ ON' : '❌ OFF'}*\nUsage: .aii open | .aii close`);
        }
        
        // --- LOGIC UNTUK PERINTAH .AI (System Status) ---
        if (commandUsed === 'ai') {
            checkDailyReset();
            
            if (mode === 'on') {
                if (totalKeys === 0) return reply('❌ Cannot activate. No valid GEMINI_KEYS found in .env.');
                aiData.config.active = true;
                await saveData();
                return reply(`🤖 *AI SYSTEM ONLINE*\nSystem is active with ${totalKeys} keys.`);
            } else if (mode === 'off') {
                aiData.config.active = false;
                await saveData();
                return reply('💤 *AI SYSTEM OFFLINE*\nSystem deactivated.');
            }
            
            const statusIcon = aiData.config.active ? '✅ ON' : '❌ OFF';
            return reply(`📊 *AI STATS*\n\n• Status: ${statusIcon} (Keys available: ${totalKeys})\n• Conversation Mode: ${aiData.config.groupAutoReply ? '✅ ON' : '❌ OFF'}\n• Total Requests: ${aiData.stats.totalRequests}\n• Requests Today: ${aiData.stats.todayRequests}\n\n*Usage Cost:*\n• User: 1 Token / Reply\n• Premium/Owner: Free (Unlimited)`);
        }
    },

    events: {
        'message': async (ctx) => {
            if (!aiData.config.active || GEMINI_CLIENTS.length === 0) return;
            
            const query = ctx.body || '';
            const lowerQuery = query.toLowerCase();
            if (query.length < 2 || ctx.command) return;
            
            // --- VARIABEL UNTUK TRIGGER & TOKEN ---
            const senderId = ctx.sender;
            const isOwner = ctx.isOwner(senderId) || ctx.user && ctx.user.role === 'owner';
            const isPremium = ctx.isPremium(senderId);

            // 1. Panggil Nama
            const isCalledByName = TRIGGER_KEYWORDS.some(word => lowerQuery.includes(word));

            // 2. Reply Detection
            const rawMsg = ctx.raw.message;
            const contextInfo = rawMsg?.extendedTextMessage?.contextInfo || rawMsg?.imageMessage?.contextInfo || rawMsg?.videoMessage?.contextInfo || rawMsg?.stickerMessage?.contextInfo || rawMsg?.audioMessage?.contextInfo;
            const replyParticipant = contextInfo?.participant; // Participant yang mengirim pesan yang di-reply

            // Cek apakah pesan ini adalah REPLY ke BOT?
            const user = ctx.bot.sock.user;
            const myNumber = user.id.split(':')[0].split('@')[0]; 
            const myLid = user.lid ? user.lid.split(':')[0].split('@')[0] : ''; 
            const isRepliedToBot = replyParticipant && (replyParticipant.includes(myNumber) || (myLid && replyParticipant.includes(myLid)));
            
            // Cek apakah pesan ini adalah REPLY ke ORANG LAIN?
            const isReplyToAnyone = !!replyParticipant;
            const isReplyToAnotherUser = isReplyToAnyone && !isRepliedToBot;

            // 3. Chat Pribadi
            const isPrivate = !ctx.isGroup;

            // 4. Conversation Mode Trigger
            // Trigger jika mode ON, DAN itu BUKAN reply ke orang lain, DAN BUKAN private chat (karena private sudah di handle isPrivate)
            const isGroupConversation = aiData.config.groupAutoReply && !isPrivate && !isReplyToAnotherUser;

            // --- LOGIKA UTAMA TRIGGER ---
            if (isCalledByName || isRepliedToBot || isPrivate || isGroupConversation) {
                
                // Cek Token
                if (!isOwner && !isPremium) {
                    if (ctx.user.tokens < 1) {
                        await ctx.react('❌'); 
                        return ctx.reply(`🚫 *Out of Tokens!*\nYou have run out of tokens to chat with AI.\nRemaining Balance: ${ctx.user.tokens}\nType \`.help\` to know how to get token!`);
                    }
                }

                // Cooldown (Anti-spam)
                const now = Date.now();
                if (now - (lastUserTime.get(ctx.sender) || 0) < 3000) return;

                await ctx.bot.sock.sendPresenceUpdate('composing', ctx.chatId);
                const answer = await getGeminiResponse(query, ctx.logger);
                await ctx.bot.sock.sendPresenceUpdate('paused', ctx.chatId);

                if (answer) {
                    if (answer !== 'Sorry, all AI resources are currently exhausted. Please try again later.') {
                        // Potong Token hanya jika berhasil dan bukan Owner/Premium
                        if (!isOwner && !isPremium) {
                            ctx.user.tokens -= 1;
                            await ctx.saveUsers(); 
                        }

                        checkDailyReset();
                        aiData.stats.totalRequests += 1;
                        aiData.stats.todayRequests += 1;
                        await saveData();
                    }

                    await ctx.reply(answer);
                    lastUserTime.set(ctx.sender, now);
                }
            }
        }
    }
};