import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Konfigurasi Reward
const CONFIG = {
    CHATS_REQUIRED: 5,      // Butuh 5 chat
    REWARD_CHAT: 3,         // Dapat 3 token
    REWARD_WELCOME: 3,      // Dapat 3 token (Menyambut)
    REWARD_ADD_MEMBER: 5,   // Dapat 5 token (Menambahkan Orang)
    MIN_CHAR_LENGTH: 4,     // Minimal panjang chat 4 huruf
    WELCOME_TIMEOUT: 3 * 60 * 1000, 
    CHAT_COOLDOWN_MS: 2000  // 🔥 COOLDOWN BARU: 2 detik
};

// Update: userChatCounter sekarang menyimpan { count: number, lastRewardTime: number }
let userChatCounter = new Map(); 
let newMembersCache = [];        

export default {
    name: "token_earner",
    version: "3.0-COOLDOWN-FIX",
    
    load: async (logger) => {
        try {
            setInterval(() => {
                const now = Date.now();
                // Bersihkan cache member baru yang sudah expired (lewat 3 menit)
                newMembersCache = newMembersCache.filter(m => now - m.joinTime < CONFIG.WELCOME_TIMEOUT);
            }, 60000);
        } catch (e) {}
    },

    // Dipanggil saat ada member baru masuk
    registerNewMember: (memberId) => {
        const now = Date.now();
        newMembersCache.push({ id: memberId, joinTime: now, rewarded: [] });
    },

    // --- PROSES REWARD ADD MEMBER ---
    processAddReward: async (engine, authorId, count) => {
        if (!authorId || count < 1) return;

        let user = engine.users.get(authorId);
        
        if (!user) {
            user = { 
                id: authorId, 
                name: 'User', 
                role: 'member', 
                tokens: 10, 
                interactions: 0, 
                createdAt: new Date().toISOString() 
            };
            engine.users.set(authorId, user);
        }

        const bonus = count * CONFIG.REWARD_ADD_MEMBER;
        user.tokens = (user.tokens || 0) + bonus;
        
        await engine.saveData();
        
        return { bonus, totalTokens: user.tokens };
    },

    events: {
        'message': async (ctx) => {
            if (!ctx.isGroup || ctx.fromMe) return; 

            const userId = ctx.sender;
            const msgText = ctx.body || '';
            const msgLower = msgText.toLowerCase();
            const now = Date.now(); // Ambil waktu saat ini

            // A. LOGIKA REWARD WELCOME (Menyambut) - (Unchanged)
            const isWelcomeMsg = ['welcome', 'welcomee', 'selamat datang', 'salken', 'halo', 'hai', 'woi'].some(w => msgLower.includes(w));
            const mentioned = ctx.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

            if (isWelcomeMsg && mentioned.length > 0) {
                let gotReward = false;

                for (const tagId of mentioned) {
                    const targetMember = newMembersCache.find(m => m.id === tagId);
                    if (targetMember) {
                        if (now - targetMember.joinTime > CONFIG.WELCOME_TIMEOUT) continue;
                        if (!targetMember.rewarded.includes(userId)) {
                            targetMember.rewarded.push(userId);
                            gotReward = true;
                        }
                    }
                }

                if (gotReward) {
                    ctx.user.tokens += CONFIG.REWARD_WELCOME;
                    await ctx.saveUsers();
                    await ctx.react('🪙'); 
                }
            }

            // B. LOGIKA REWARD CHAT AKTIF (COOLDOWN FIX)
            // Syarat minimal: Panjang >= 4, Bukan Command
            if (msgText.length >= CONFIG.MIN_CHAR_LENGTH && !ctx.command) {
                
                let userData = userChatCounter.get(userId) || { count: 0, lastRewardTime: 0 };
                
                const timeSinceLastCount = now - userData.lastRewardTime;
                
                // 🔥 HANYA hitung jika sudah lewat cooldown 2 detik
                if (timeSinceLastCount >= CONFIG.CHAT_COOLDOWN_MS) {
                    
                    userData.count++;
                    userData.lastRewardTime = now; // Update waktu hitungan terakhir
                    
                    if (userData.count >= CONFIG.CHATS_REQUIRED) {
                        ctx.user.tokens += CONFIG.REWARD_CHAT;
                        await ctx.saveUsers();
                        
                        // Reset count, tapi lastRewardTime tetap di-update di atas
                        userData.count = 0;
                        
                        await ctx.react('💰'); 
                        ctx.logger.info('TOKEN_EARNER', `User ${ctx.pushName} earned ${CONFIG.REWARD_CHAT} tokens via chat.`);
                    } 
                    
                    // Simpan data counter yang baru
                    userChatCounter.set(userId, userData);
                    
                } else {
                    // Jika cooldown belum selesai, log dan abaikan hitungan
                    ctx.logger.debug('TOKEN_EARNER', `Chat from ${ctx.pushName} ignored due to cooldown (${timeSinceLastCount}ms).`);
                }
            }
        }
    }
};