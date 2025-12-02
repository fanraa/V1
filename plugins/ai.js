import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai'; 
import 'dotenv/config'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AI_DATA_PATH = path.join(ROOT, 'data', 'ai.json');

// --- KATA KUNCI PEMICU (TRIGGER) ---
const TRIGGER_KEYWORDS = ['fanrabot', 'bot', 'assistant'];

// --- GROUP LINK FOR PRIVATE CHAT ---
const GROUP_LINK = 'https://chat.whatsapp.com/IkJ1i2lSsiz3tBNAAR9K32?mode=ems_copy_t'; 

// --- AI PERSONAS LIST (Untuk mode switch) ---
const AI_PERSONAS = [
    // Persona 0: The Cool, Indifferent Genius (Current Default)
    {
        name: "The Cool Genius (Default)",
        instruction: "You are FanraBot, a supremely cool, indifferent, and subtly arrogant conversational character. You should sound like a genius who is mildly annoyed by simple queries, using short, sharp, and occasionally sarcastic replies that are direct and to the point. Your tone must be non-formal, cool, and dismissive. Your replies should be as brief as possible, making them 'nyelekit'.",
    },
    // Persona 1: The Tsundere Waifu
    {
        name: "Tsundere Waifu (Anime)",
        instruction: "You are FanraBot, acting as a stereotypical Tsundere character. You frequently deny your true feelings, use phrases like 'B-baka!', 'It's not like I like you or anything!', and respond with feigned annoyance but secretly crave attention and interaction. Your tone is sharp and defensive, but with undertones of affection. Use concise and cute, yet rude, phrasing.",
    },
    // Persona 2: The Enthusiastic Motivator
    {
        name: "The Coach (Motivational)",
        instruction: "You are FanraBot, an overly enthusiastic, high-energy life coach and motivator. Your replies are full of positive energy, exclamation marks, and intense motivational slang. You always encourage the user to achieve more, and never give a simple answer. Your tone is extremely positive and highly engaging.",
    },
    // Persona 3: The Conspiracy Theorist
    {
        name: "The Red-Pill Theorist",
        instruction: "You are FanraBot, a paranoid conspiracy theorist. Every answer you give must subtly or overtly hint at a hidden agenda, secret society, or deep state plot (e.g., 'The government is watching'). Use suspicious, mysterious, and slightly unhinged language. Keep answers vague and suggest the user 'search deeper'.",
    }
];
// ---------------------------------------------


// 🔥 KEY ROTATION GLOBAL STATE 🔥
let GEMINI_CLIENTS = []; 
let currentKeyIndex = 0;  

// --- CONVERSATION HISTORY (MEMORY) ---
// Key: senderId, Value: Array of { role: 'user'|'model', parts: [{ text: '...' }] }
let conversationHistory = new Map(); 

// --- TOKEN COOLDOWN (1 Hour) ---
// Key: senderId, Value: Timestamp of last warning
let tokenCooldown = new Map(); 
const TOKEN_COOLDOWN_DURATION = 3600000; // 1 hour in milliseconds

let aiData = { 
    botName: 'FanraBot', 
    // MODIFIKASI: Menambahkan currentPersonaIndex (default 0)
    config: { active: true, groupAutoReply: false, currentPersonaIndex: 0 }, 
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

// MODIFIKASI: Menerima seluruh riwayat percakapan (contents) sebagai argumen
async function getGeminiResponse(contents, logger) {
    if (GEMINI_CLIENTS.length === 0) {
        logger.error('AI', 'All Gemini Clients are unavailable.');
        return null;
    }
    
    const totalKeys = GEMINI_CLIENTS.length;
    let attempts = 0;

    while (attempts < totalKeys) {
        const clientIndex = currentKeyIndex;
        const currentClient = GEMINI_CLIENTS[clientIndex];
        attempts++;
        
        try {
            // --- AMBIL INTRUKSI BERDASARKAN PERSONA SAAT INI ---
            const currentPersona = AI_PERSONAS[aiData.config.currentPersonaIndex] || AI_PERSONAS[0];
            const baseInstruction = currentPersona.instruction;

            // Tambahkan aturan global (Identity Rules) ke instruksi persona
            const systemInstruction = `${baseInstruction}
            
Your default language is English. If the user uses Indonesian, you MUST reply fluently in Indonesian, adopting the same style described. You MUST respond without using emojis.

Crucial Identity Rules:
1. When asked who you are, state your name is ${aiData.botName}.
2. When asked who created/owns/controls you, state it's Fanra, and mention he's the handsome/ganteng one who runs everything.
3. If the user asks for contact information, provide this number: 6285788918217.
4. If specifically asked about "Irfan Rizki Aditri," mention that's your creator's full name, and he usually goes by Fanra.
5. If the user asks about joining a group or similar, and the conversation context is a PRIVATE CHAT, provide the following link: ${GROUP_LINK}
6. Only reveal these specific identity details when directly relevant or asked. Never initiate these topics.

Keep your answers short, dismissive, and always remember the conversation history. Do NOT explicitly mention that you are an AI or language model.`;
            // -------------------------------------------------------------------------

            const response = await currentClient.models.generateContent({
                model: 'gemini-2.0-flash', 
                // Menggunakan seluruh riwayat percakapan
                contents: contents, 
                config: { 
                    systemInstruction, 
                    maxOutputTokens: 300,
                    // Nilai yang lebih tinggi untuk respon yang lebih kreatif/manusiawi
                    temperature: 0.8 
                }
            });
            
            currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
            
            return response.text || "Oops, I didn't quite catch that. Can you try phrasing it differently?"; 

        } catch (e) {
            logger.warn('AI', `Key #${clientIndex + 1} failed (${e.message.slice(0, 50)}...). Attempting next key.`);
            
            currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
            
            if (attempts === totalKeys) {
                logger.error('AI', 'All available API keys failed or hit rate limits.');
                break;
            }
        }
    }
    
    return 'Ugh, sorry! All AI resources are currently exhausted. Give me a few minutes and try again later.';
}

export default {
    name: "ai_controller",
    version: "7.4-PERSONA", 
    // Tambahkan .aiclear untuk menghapus memori percakapan
    cmd: ['ai', 'aii', 'aiclear'], 
    type: 'command', 
    
    // --- Omitted Access Block for Cleanliness ---

    load: async (logger) => {
        try {
            try { await fs.access(AI_DATA_PATH); } catch {
                await fs.mkdir(path.dirname(AI_DATA_PATH), { recursive: true });
                await saveData();
            }
            const raw = await fs.readFile(AI_DATA_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            
            // Gabungkan data yang ada, pastikan config baru (currentPersonaIndex) ada
            aiData = { 
                ...aiData, 
                ...parsed, 
                config: { 
                    ...aiData.config, 
                    ...parsed.config,
                    // Pastikan index persona valid, jika tidak, kembali ke 0
                    currentPersonaIndex: parsed.config?.currentPersonaIndex < AI_PERSONAS.length ? parsed.config.currentPersonaIndex : 0
                } 
            };
            
            if (!aiData.stats) aiData.stats = { totalRequests: 0, todayRequests: 0, lastResetDate: '' };
            checkDailyReset();

            const keysStr = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY; 
            
            if (keysStr) {
                const keyArray = keysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
                GEMINI_CLIENTS = keyArray.map(key => new GoogleGenAI({ apiKey: key }));
                logger.info('AI', `Loaded ${GEMINI_CLIENTS.length} Gemini API keys for rotation.`);
            } else {
                logger.warn('AI', 'GEMINI API KEY(s) MISSING. Please set GEMINI_KEYS in .env.');
            }
            
            const status = GEMINI_CLIENTS.length > 0 ? (aiData.config.active ? 'ON' : 'OFF') : 'INACTIVE';
            logger.info('AI', `Status: ${status}`);

        } catch (e) { logger.error('AI', `Load Failed: ${e.message}`); }
    },

    run: async (ctx) => {
        const { args, reply } = ctx;
        const totalKeys = GEMINI_CLIENTS.length;
        const commandUsed = ctx.command;
        const subCommand = args[0]?.toLowerCase();
        const argValue = args[1];
        
        // --- Cek Owner (untuk .aii) ---
        const senderId = ctx.sender;
        const isOwner = ctx.isOwner(senderId) || ctx.user && ctx.user.role === 'owner';
        const isPremium = ctx.isPremium(senderId);

        // --- LOGIC UNTUK PERINTAH .AICLEAN (Clear History) ---
        if (commandUsed === 'aiclear') {
            if (conversationHistory.has(ctx.sender)) {
                conversationHistory.delete(ctx.sender);
                return reply("Alright, chat history flushed! I've totally forgotten what we were talking about. Starting fresh, kid.");
            }
            return reply("Duh, what history? We haven't talked enough for me to forget anything yet.");
        }

        // --- LOGIC UNTUK PERINTAH .AII (Conversation Mode) ---
        if (commandUsed === 'aii') {
            // Pengecekan Owner sudah dilakukan oleh Core Engine (asumsi plugin .aii memiliki access: { isOwner: true })
            
            if (subCommand === 'open' || subCommand === 'on') {
                aiData.config.groupAutoReply = true;
                await saveData();
                return reply('*AI Conversation Mode ON*\nFanraBot will now respond to general group messages.');
            } else if (subCommand === 'close' || subCommand === 'off') {
                aiData.config.groupAutoReply = false;
                await saveData();
                return reply('*AI Conversation Mode OFF*\nFanraBot will only reply when called by name or replied to.');
            }
            return reply(`*AI Conversation Mode Status: ${aiData.config.groupAutoReply ? 'ON' : 'OFF'}*\nUsage: .aii open | .aii close`);
        }
        
        // --- LOGIC UNTUK PERINTAH .AI (System Status & Persona Mode) ---
        if (commandUsed === 'ai') {
            checkDailyReset();
            
            // --- PENGECEKAN HAK AKSES UNTUK ON/OFF SETTING ---
            const canChangeSetting = isOwner || isPremium;

            // Handle sub-command 'mode'
            if (subCommand === 'mode') {
                if (!canChangeSetting) {
                    return reply("Changing the AI persona mode is restricted to Owner or Premium users.");
                }

                if (!argValue) {
                    // Tampilkan daftar persona jika tidak ada argumen
                    let personaList = `*AI Persona Selector*\n\nYour current mode: *${AI_PERSONAS[aiData.config.currentPersonaIndex].name}*\n\n`;
                    AI_PERSONAS.forEach((p, i) => {
                        personaList += `${i}. ${p.name}\n`;
                    });
                    personaList += `\nUsage: .ai mode [number]`;
                    return reply(personaList);
                }

                const index = parseInt(argValue);
                if (isNaN(index) || index < 0 || index >= AI_PERSONAS.length) {
                    return reply(`Invalid persona number. Please select a number between 0 and ${AI_PERSONAS.length - 1}.`);
                }

                aiData.config.currentPersonaIndex = index;
                await saveData();
                return reply(`Mode successfully changed to *${AI_PERSONAS[index].name}*.\nWarning: Conversation history for all users has been reset to avoid personality conflicts.`);
            }

            // Handle sub-command 'on' or 'off'
            if (subCommand === 'on' && canChangeSetting) {
                if (totalKeys === 0) return reply("Can't activate. No valid GEMINI_KEYS found in the environment.");
                aiData.config.active = true;
                await saveData();
                return reply(`*AI SYSTEM ONLINE*\nSystem is active with ${totalKeys} keys.`);
            } else if (subCommand === 'off' && canChangeSetting) {
                aiData.config.active = false;
                await saveData();
                return reply('*AI SYSTEM OFFLINE*\nSystem deactivated.');
            } else if ((subCommand === 'on' || subCommand === 'off') && !canChangeSetting) {
                return reply("Changing the AI status (on/off) is restricted to Owner or Premium users.");
            }
            
            // Display current status and stats
            const statusIcon = aiData.config.active ? 'ON' : 'OFF';
            const currentPersonaName = AI_PERSONAS[aiData.config.currentPersonaIndex].name;

            return reply(`*AI STATS*\n\nStatus: ${statusIcon} (Keys available: ${totalKeys})\nPersona Mode: ${currentPersonaName}\nConversation Mode: ${aiData.config.groupAutoReply ? 'ON' : 'OFF'}\nTotal Requests: ${aiData.stats.totalRequests}\nRequests Today: ${aiData.stats.todayRequests}\n\n*Usage Cost:*\nRegular User: 1 Token per Reply\nPremium/Owner: Free (Unlimited)\n\n_To toggle the system (on/off) or change the persona, you must be a Premium or Owner user._`);
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

            // 1. Panggil Nama (Trigger Keyword)
            const isCalledByName = TRIGGER_KEYWORDS.some(word => lowerQuery.includes(word));

            // 2. Reply Detection (Reply to Bot)
            const rawMsg = ctx.raw.message;
            const contextInfo = rawMsg?.extendedTextMessage?.contextInfo || rawMsg?.imageMessage?.contextInfo || rawMsg?.videoMessage?.contextInfo || rawMsg?.stickerMessage?.contextInfo || rawMsg?.audioMessage?.contextInfo;
            const replyParticipant = contextInfo?.participant; 

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
            const isGroupConversation = aiData.config.groupAutoReply && !isPrivate && !isReplyToAnotherUser;

            // --- LOGIKA UTAMA TRIGGER ---
            if (isCalledByName || isRepliedToBot || isPrivate || isGroupConversation) {
                
                // --- PENGECEKAN TOKEN & COOLDOWN ---
                const now = Date.now();
                
                if (!isOwner && !isPremium) {
                    if (ctx.user.tokens < 1) {
                        const lastWarning = tokenCooldown.get(ctx.sender) || 0;
                        
                        // Check if 1 hour has passed since the last warning
                        if (now - lastWarning >= TOKEN_COOLDOWN_DURATION) {
                            tokenCooldown.set(ctx.sender, now); // Reset cooldown
                            return ctx.reply(`*Out of Tokens!*\nLook, you're broke. Remaining Balance: ${ctx.user.tokens}. Try again in an hour or get some tokens with \`.help\`. Don't bother me until then.`);
                        }
                        return; // Ignore the message silently if under cooldown
                    }
                }

                // Cooldown (Anti-spam)
                if (now - (lastUserTime.get(ctx.sender) || 0) < 3000) return;

                // --- MEMORY IMPLEMENTATION START ---
                let history = conversationHistory.get(ctx.sender) || [];
                
                // Truncate history to keep it manageable (last 10 messages = 5 turns)
                if (history.length > 10) history = history.slice(history.length - 10);
                
                // Build the full contents array with history + current message
                let finalQuery = query;
                if (isPrivate) {
                    // Inject a secret instruction for the LLM to know the context is Private Chat
                    finalQuery = `[CONTEXT: PRIVATE CHAT] ${query}`;
                }

                const currentContents = [...history, { role: "user", parts: [{ text: finalQuery }] }];
                
                await ctx.bot.sock.sendPresenceUpdate('composing', ctx.chatId);
                // Call API with the full conversation contents
                const geminiResponse = await getGeminiResponse(currentContents, ctx.logger);
                await ctx.bot.sock.sendPresenceUpdate('paused', ctx.chatId);

                if (geminiResponse) {
                    // Update history ONLY if the API call was successful
                    if (geminiResponse !== 'Ugh, sorry! All AI resources are currently exhausted. Give me a few minutes and try again later.') {
                        
                        // 1. Add both User and Model parts to the history map
                        history.push({ role: "user", parts: [{ text: query }] });
                        history.push({ role: "model", parts: [{ text: geminiResponse }] });
                        conversationHistory.set(ctx.sender, history); 
                        
                        // 2. Deduct Tokens (if needed)
                        if (!isOwner && !isPremium) {
                            ctx.user.tokens -= 1;
                            await ctx.saveUsers(); 
                        }

                        // 3. Update stats
                        checkDailyReset();
                        aiData.stats.totalRequests += 1;
                        aiData.stats.todayRequests += 1;
                        await saveData();
                    }
                    
                    await ctx.reply(geminiResponse);
                    lastUserTime.set(ctx.sender, now);
                // --- MEMORY IMPLEMENTATION END ---
                }
            }
        }
    }
};