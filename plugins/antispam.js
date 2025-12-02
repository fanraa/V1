// plugins/antispam.js
// 🛡️ ANTI-SPAM (Text & Sticker) - v4.0 ADVANCED
// ==========================================

// Map untuk menyimpan data spam user
// Structure: chatId-sender -> { lastMsgType, count, msgKeys[], lastTime }
const spamMap = new Map();

// Batasan Waktu
const RAPID_FIRE_THRESHOLD_MS = 2000; // 2 detik untuk spam stiker/media cepat
const TEXT_SPAM_THRESHOLD_MS = 8000;  // 8 detik untuk spam teks yang sama

export default {
    name: "antispam",
    version: "4.0-ADV-STICKER",
    priority: 0, 

    events: {
        message: async (ctx) => {
            try {
                ctx.logger.debug('ANTISPAM', 'Anti-Spam module triggered.'); 

                // Periksa apakah ini Stiker atau Teks. Jika bukan keduanya, abaikan.
                const isSticker = !!ctx.raw.message?.stickerMessage; 
                const isText = !!ctx.body;

                if (!ctx.isGroup || (!isText && !isSticker)) return;

                const { sender, chatId, body } = ctx;
                const now = Date.now();
                const keyId = `${chatId}:${sender}`;
                
                // --- 1. ANTI-VIRTEX / VIRUS (High Priority) ---
                // Hanya periksa Virtex pada pesan Teks (karena Virtex tidak mungkin berupa stiker)
                if (isText) {
                    const isVirtex = 
                      body.length > 10000 || 
                      /(.)\1{50,}/.test(body) || 
                      /[\u0300-\u036f]{15,}/.test(body) || 
                      /[\u202a-\u202e]/.test(body); 

                    if (isVirtex) {
                        ctx.logger.warn('SECURITY', `☣️ VIRTEX detected from ${ctx.pushName} -> KICKING`);
                        
                        try { await ctx.deleteMessage(ctx.key); } catch (e) {}
                        
                        await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {});
                        
                        await ctx.sendMessage({ 
                            text: `☣️ *VIRTEX DETECTED* (@${ctx.senderNumber})\nUser was removed and the message deleted for group safety.`, 
                            mentions: [sender] 
                        });
                        return; 
                    }
                }

                // --- 2. ANTI-SPAM LOGIC ---
                
                let userData = spamMap.get(keyId) || { 
                    lastMsg: '', 
                    count: 0, 
                    msgKeys: [], 
                    lastTime: 0 
                };

                const timeGap = now - userData.lastTime;
                
                let isSpamming;
                const currentMsgContent = isSticker ? '__STICKER__' : body; // Gunakan placeholder untuk stiker

                if (isSticker) {
                    // Kriteria STICKER SPAM: Cukup cepat (2 detik)
                    isSpamming = timeGap <= RAPID_FIRE_THRESHOLD_MS;
                } else { 
                    // Kriteria TEXT SPAM: Sama persis DAN cepat (8 detik)
                    isSpamming = userData.lastMsg === currentMsgContent && timeGap <= TEXT_SPAM_THRESHOLD_MS;
                }
                
                // Reset jika TIDAK SPAMMING
                if (!isSpamming) {
                    
                    // DELAYED WARNING LOGIC: Beri tahu user yang sudah dihukum bahwa dia aman
                    if (userData.count >= 5) {
                        ctx.logger.warn('SPAM', `✅ User ${ctx.pushName} stopped spamming after ${userData.count} messages. Cleared.`);
                        
                        await ctx.sendMessage({
                            text: `✅ *SPAM WARNING CLEARED* (@${ctx.senderNumber})\nYour messages are no longer being deleted. Please maintain a moderate chat speed.`,
                            mentions: [sender]
                        });
                        
                        spamMap.delete(keyId); 
                        return; 
                    }

                    // Standard Reset Data Spam
                    userData = { 
                        lastMsg: currentMsgContent, 
                        count: 1, 
                        msgKeys: [ctx.key], 
                        lastTime: now 
                    };
                } else {
                    // Jika SPAMMING
                    userData.count++;
                    userData.lastTime = now;
                    userData.msgKeys.push(ctx.key); 
                }

                spamMap.set(keyId, userData);

                // --- LOGIKA HUKUMAN ---

                // C. Pesan ke 6-9: HAPUS LANGSUNG
                if (userData.count > 5 && userData.count < 10) {
                    try { 
                        await ctx.deleteMessage(ctx.key); 
                        ctx.logger.info('SPAM', `Deleted incoming message (${userData.count}x) from ${ctx.pushName}`);
                    } catch (e) {}
                    return;
                }
                
                // A. Pesan ke-5: BATCH DELETE SEMUA (TIDAK ADA PESAN WARNING)
                if (userData.count === 5) {
                    ctx.logger.warn('SPAM', `⚠️ SPAM COUNT REACHED (5x) for ${ctx.pushName} - Batch Deleting...`);
                    
                    // Delete ALL stored messages in the batch (Pesan ke 1-5)
                    for (const key of userData.msgKeys) {
                        try { await ctx.deleteMessage(key); } catch (e) {}
                    }
                    
                    // Reset keys (sudah dihapus), tapi count tetap 5 untuk memicu Delayed Warning
                    userData.msgKeys = []; 
                    spamMap.set(keyId, userData);
                    return;
                }

                // D. Pesan ke-10: KICK
                if (userData.count >= 10) {
                    ctx.logger.warn('SPAM', `🚫 EXTREME SPAM (10x) from ${ctx.pushName} -> KICK`);
                    
                    try { await ctx.deleteMessage(ctx.key); } catch (e) {}
                    
                    await ctx.sendMessage({ 
                        text: `🚫 *LIMIT EXCEEDED* (@${ctx.senderNumber})\nUser has been removed from the group. 👋`,
                        mentions: [sender]
                    });
                    
                    await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {
                        ctx.reply('❌ Failed to remove member (Bot is not Admin?)');
                    });
                    
                    spamMap.delete(keyId);
                    return;
                }

            } catch (e) {
                ctx.logger.error('ANTISPAM', `System Error: ${e.message}`);
            }
        }
    }
}