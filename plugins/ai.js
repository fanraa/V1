import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai'; 
import 'dotenv/config'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AI_DATA_PATH = path.join(ROOT, 'data', 'ai.json');

// --- TRIGGER KEYWORDS ---
const TRIGGER_KEYWORDS = ['fanrabot', 'bot', 'assistant'];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

let aiData = { 
    botName: 'FanraBot', 
    config: { active: true }, 
    stats: { totalRequests: 0, todayRequests: 0, lastResetDate: '' }
};

let geminiClient; 
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
    if (!geminiClient) {
        logger.error('AI', 'Gemini Client Not Ready.');
        return null;
    }
    try {
        const systemInstruction = `You are ${aiData.botName}, a cool and helpful AI Assistant. 
        Your default language is English. However, if the user speaks Indonesian or any other language, you MUST reply in that language. 
        Keep your answers concise and helpful.`;

        const response = await geminiClient.models.generateContent({
            model: 'gemini-2.0-flash', 
            contents: [{ role: "user", parts: [{ text: query }] }],
            config: { systemInstruction, maxOutputTokens: 300 }
        });
        
        return response.text || "Sorry, I can't answer that right now."; 
    } catch (e) {
        logger.error('AI', `API Error: ${e.message}`);
        return null;
    }
}

export default {
    name: "ai_controller",
    version: "6.3-OWNER-FIX",
    cmd: ['ai'],
    type: 'command', 

    load: async (logger) => {
        try {
            try { await fs.access(AI_DATA_PATH); } catch {
                await fs.mkdir(path.dirname(AI_DATA_PATH), { recursive: true });
                await saveData();
            }
            const raw = await fs.readFile(AI_DATA_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            aiData = { ...aiData, ...parsed };
            if (!aiData.stats) aiData.stats = { totalRequests: 0, todayRequests: 0, lastResetDate: '' };
            checkDailyReset();

            if (GEMINI_API_KEY) {
                geminiClient = new GoogleGenAI(GEMINI_API_KEY);
                logger.info('AI', `✅ GEMINI CONNECTED. Status: ${aiData.config.active ? 'ON' : 'OFF'}`);
            } else {
                logger.warn('AI', '❌ GEMINI API KEY MISSING.');
            }
        } catch (e) { logger.error('AI', `Load Failed: ${e.message}`); }
    },

    run: async (ctx) => {
        const { args, reply } = ctx;
        const mode = args[0]?.toLowerCase();
        checkDailyReset();

        if (mode === 'on') {
            aiData.config.active = true;
            await saveData();
            return reply('🤖 *AI ONLINE*\nSystem is active. Just reply to my message or say "Fanra" to chat!');
        } else if (mode === 'off') {
            aiData.config.active = false;
            await saveData();
            return reply('💤 *AI OFFLINE*\nSystem deactivated.');
        }
        
        const statusIcon = aiData.config.active ? '✅ ON' : '❌ OFF';
        return reply(`📊 *AI STATISTICS*\n\n• Status: ${statusIcon}\n• Total Requests: ${aiData.stats.totalRequests}\n• Requests Today: ${aiData.stats.todayRequests}\n\n*Usage Cost:*\n• User: 1 Token / Reply\n• Premium/Owner: Free (Unlimited)`);
    },

    events: {
        'message': async (ctx) => {
            if (!aiData.config.active) return;
            
            const query = ctx.body || '';
            const lowerQuery = query.toLowerCase();
            if (query.length < 2 || ctx.command) return;

            // --- TRIGGER DETECTION ---
            const isCalledByName = TRIGGER_KEYWORDS.some(word => lowerQuery.includes(word));
            
            const rawMsg = ctx.raw.message;
            const contextInfo = rawMsg?.extendedTextMessage?.contextInfo || 
                                rawMsg?.imageMessage?.contextInfo || 
                                rawMsg?.videoMessage?.contextInfo || 
                                rawMsg?.stickerMessage?.contextInfo ||
                                rawMsg?.audioMessage?.contextInfo;
            const replyParticipant = contextInfo?.participant || '';
            const user = ctx.bot.sock.user;
            const myNumber = user.id.split(':')[0].split('@')[0]; 
            const myLid = user.lid ? user.lid.split(':')[0].split('@')[0] : ''; 
            const isReplied = replyParticipant.includes(myNumber) || (myLid && replyParticipant.includes(myLid));
            const isPrivate = !ctx.isGroup;

            if (isCalledByName || isReplied || isPrivate) {
                
                // --- 🔥 FIX LOGIKA OWNER DI SINI 🔥 ---
                const senderId = ctx.sender;
                
                // 1. Cek Config Owner (Hardcoded)
                const isConfigOwner = ctx.isOwner(senderId);
                
                // 2. Cek Database Role (Hasil .ownerkey)
                const isDbOwner = ctx.user && ctx.user.role === 'owner';
                
                // Gabungkan: Jika salah satu benar, maka dia OWNER
                const isRealOwner = isConfigOwner || isDbOwner;
                
                const isPremium = ctx.isPremium(senderId);
                
                // Logika: Jika BUKAN Owner DAN BUKAN Premium, baru cek token
                if (!isRealOwner && !isPremium) {
                    if (ctx.user.tokens < 1) {
                        await ctx.react('❌'); 
                        return ctx.reply(`🚫 *Out of Tokens!*\nYou have run out of tokens to chat with AI.\nRemaining Balance: ${ctx.user.tokens}\nType \`.hel\` to know how to get token!.`);
                    }
                }

                // Cooldown
                const now = Date.now();
                if (now - (lastUserTime.get(ctx.sender) || 0) < 3000) return;

                await ctx.bot.sock.sendPresenceUpdate('composing', ctx.chatId);
                const answer = await getGeminiResponse(query, ctx.logger);
                await ctx.bot.sock.sendPresenceUpdate('paused', ctx.chatId);

                if (answer) {
                    // Potong token HANYA jika bukan Owner/Premium
                    if (!isRealOwner && !isPremium) {
                        ctx.user.tokens -= 1;
                        await ctx.saveUsers(); 
                    }

                    checkDailyReset();
                    aiData.stats.totalRequests += 1;
                    aiData.stats.todayRequests += 1;
                    await saveData();

                    await ctx.reply(answer);
                    lastUserTime.set(ctx.sender, now);
                }
            }
        }
    }
};