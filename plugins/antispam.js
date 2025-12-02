// plugins/antispam.js
// 🛡️ ANTI-SPAM (Batch Delete) & ANTI-VIRTEX (Auto Kick Enabled)
// ==========================================

// Map untuk menyimpan data spam user
// Structure: chatId-sender -> { lastMsg, count, msgKeys[], timer, lastTime }
const spamMap = new Map();

export default {
  name: "antispam",
  version: "2.2.0-FINAL",
  priority: 0, // Jalankan paling awal

  events: {
    message: async (ctx) => {
      try {
            ctx.logger.debug('ANTISPAM', 'Modul Anti-Spam terpicu.'); // 🚀 LOGGING AWAL

        if (!ctx.isGroup || !ctx.body) return;

        const { sender, chatId, body } = ctx;
        const now = Date.now();
        const keyId = `${chatId}:${sender}`;
        
        // --- ADMIN BYPASS DIHAPUS, SEMUA ORANG TERKENA CHECK ---
        
        // ==========================================
        // 1. ANTI-VIRTEX / VIRUS (Prioritas Utama)
        // ==========================================
        const isVirtex = 
          body.length > 10000 || // 1. Teks kepanjangan (Overload buffer)
          /(.)\1{50,}/.test(body) || // 2. Karakter berulang 50x (Lagging UI)
          /[\u0300-\u036f]{15,}/.test(body) || // 3. Simbol Zalgo/Setan (Stacking height)
          /[\u202a-\u202e]/.test(body); // 4. RTL Override (Crash rendering)

        if (isVirtex) {
           ctx.logger.warn('SECURITY', `☣️ VIRTEX detected from ${ctx.pushName}`);
           
           // A. Hapus pesan virusnya langsung (Upaya Paksa)
            try {
                await ctx.deleteMessage(ctx.key);
                ctx.logger.info('SECURITY', 'Pesan Virtex berhasil dihapus.');
            } catch (e) {
                ctx.logger.warn('SECURITY', `Gagal menghapus pesan virtex: ${e.message}`);
            }
           
           // B. KICK PELAKU (Upaya Paksa)
           await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch((e)=>{
               ctx.logger.error('SECURITY', `Failed to kick virtex sender: ${e.message}`);
           });
           
           // C. Beritahu Grup
           await ctx.sendMessage({ 
             text: `☣️ @${ctx.senderNumber} *VIRUS DETECTED* \nUser telah dikeluarkan dan pesan dihapus untuk keamanan.`, 
             mentions: [sender] 
           });
           return; 
        }

        // ==========================================
        // 2. ANTI-SPAM (Batch Logic)
        // ==========================================
        
        // Admin bypass logic removed per user request.

        // Ambil data user dari RAM
        let userData = spamMap.get(keyId) || { 
            lastMsg: '', 
            count: 0, 
            msgKeys: [], 
            lastTime: 0 
        };

        const timeGap = now - userData.lastTime;
        const isSpammingSameMessage = userData.lastMsg === body && timeGap <= 8000;
        
        // Reset jika pesan BEDA atau jeda waktu > 8 detik
        if (!isSpammingSameMessage) {
            // 🚀 PERBAIKAN: NOTIFIKASI COOLDOWN/RESET
            if (userData.count > 1 && timeGap > 8000) {
                ctx.logger.info('SPAM', `User ${ctx.pushName} spam count reset due to inactivity.`);
            }

            userData = { 
                lastMsg: body, 
                count: 1, 
                msgKeys: [ctx.key], 
                lastTime: now 
            };
        } else {
            // Jika pesan SAMA dan CEPAT
            userData.count++;
            userData.lastTime = now;
            userData.msgKeys.push(ctx.key); 
        }

        // Update memori
        spamMap.set(keyId, userData);

        // --- LOGIKA HUKUMAN ---

        // A. Pesan ke 1-4: BIARKAN (Hanya disimpan di msgKeys)
        if (userData.count < 5) {
            return; 
        }

        // B. Pesan ke-5: WARNING + HAPUS DARI AWAL
        if (userData.count === 5) {
            ctx.logger.warn('SPAM', `⚠️ SPAM WARNING (5x) to ${ctx.pushName} - Batch Deleting...`);
            
            // Hapus semua pesan sebelumnya (Upaya Paksa)
            for (const key of userData.msgKeys) {
                try { await ctx.deleteMessage(key); } catch (e) { 
                    ctx.logger.error('SPAM', `Failed to delete message in batch: ${e.message}`);
                }
            }
            
            userData.msgKeys = []; 
            spamMap.set(keyId, userData);

            await ctx.sendMessage({
                text: `⚠️ *ANTI-SPAM WARNING* (@${ctx.senderNumber})\nAnda telah spam 5 kali.\nSemua pesan sebelumnya telah dihapus.\nLangkah selanjutnya: *KICK*.`,
                mentions: [sender]
            });
            return;
        }

        // C. Pesan ke 6-9: HAPUS LANGSUNG
        if (userData.count > 5 && userData.count < 10) {
            try { 
                await ctx.deleteMessage(ctx.key); 
            } catch (e) {
                ctx.logger.error('SPAM', `Failed to delete message (6-9): ${e.message}`);
            }
            return;
        }

        // D. Pesan ke-10: KICK
        if (userData.count >= 10) {
            ctx.logger.warn('SPAM', `🚫 EXTREME SPAM (10x) from ${ctx.pushName} -> KICK`);
            
            try { 
                await ctx.deleteMessage(ctx.key);
            } catch (e) {
                ctx.logger.error('SPAM', `Failed to delete message (10x): ${e.message}`);
            }
            
            await ctx.sendMessage({ 
                text: `🚫 *LIMIT EXCEEDED*\nSelamat tinggal @${ctx.senderNumber}! 👋`,
                mentions: [sender]
            });
            
            // Eksekusi Kick (Upaya Paksa)
            await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {
                 ctx.reply('❌ Gagal mengeluarkan anggota (Bot bukan Admin?)');
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