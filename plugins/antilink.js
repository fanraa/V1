export default {
  name: "antilink",
  version: "6.0.3-DIAG",
  priority: 0, // Prioritas tinggi agar event ini diproses duluan

  events: {
    message: async (ctx) => {
      try {
        // --- LOGGING SEDERHANA UNTUK DIAGNOSA ---
        ctx.logger.debug('ANTILINK', 'Modul Anti-Link terpicu.');

        if (!ctx.isGroup || !ctx.body) {
            ctx.logger.info('ANTILINK', 'Diabaikan: Bukan grup atau tidak ada teks pesan.');
            return;
        }

        const text = ctx.body.trim().toLowerCase();

        // --- LINK DETECTION ---
        const waGroupLink = /chat\.whatsapp\.com\/[A-Za-z0-9-]{5,}/i;
        const isWaGroup = waGroupLink.test(text);
        // Deteksi semua jenis link (https://, www., t.me/, ftp://)
        const anyLink = /(https?:\/\/|www\.|ftp:\/\/|t\.me\/)[^\s]+/i.test(text);

        const safeDomains = [
          "youtube.com", "youtu.be", "google.com", "wikipedia.org",
          "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
          "wa.me"
        ];
        const isSafeLink = safeDomains.some(domain => text.includes(domain));

        // --- BLOCK RULES: Blokir Link Grup WA ATAU Link lain yang TIDAK ada di Whitelist ---
        if (isWaGroup || (anyLink && !isSafeLink)) {
            
            // 1. VIOLATION HANDLING (Logika Hitungan Harian)
            const user = ctx.user;
            const today = new Date().toISOString().split('T')[0];

            // Reset daily counter jika tanggal berbeda
            if (!user.antilink || user.antilink.date !== today) {
                user.antilink = { date: today, count: 0 };
            }

            // Tambahkan pelanggaran
            user.antilink.count += 1;
            const violationCount = user.antilink.count;

            // 🚀 PERBAIKAN LOGGING: Sertakan kutipan pesan yang terdeteksi
            ctx.logger.warn(
                'ANTILINK',
                `Link terdeteksi dari ${ctx.pushName} | Pelanggaran #${violationCount}. Pesan: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
            );

            // 2. ALWAYS DELETE MESSAGE (Upaya Paksa)
            try {
                await ctx.deleteMessage(ctx.key);
                ctx.logger.info('ANTILINK', `Pesan dihapus.`);
            } catch (e) {
                ctx.logger.warn('ANTILINK', `Gagal menghapus pesan (Periksa Izin Admin): ${e.message}`);
            }

            // 3. WARNING (5×) & KICK (10×)
            if (violationCount === 5) {
                // --- 5TH WARNING ---
                const warnMsg = `
⚠️ *PERINGATAN 5X!* (@${ctx.senderNumber})
Anda telah mengirim *5 link* terlarang hari ini.
Jika mencapai *10 pelanggaran*, Anda akan dikeluarkan (Kick) dari grup.
`.trim();

                await ctx.sendMessage({
                    text: warnMsg,
                    mentions: [ctx.sender]
                });

            } else if (violationCount >= 10) {
                // --- KICK USER ---
                const kickMsg = `
🚫 *BATAS MAKSIMUM TERCAPAI* (@${ctx.senderNumber})
Anda telah mencapai *batas 10 link* hari ini.
Anda akan dikeluarkan dari grup. 👋
`.trim();

                await ctx.sendMessage({
                    text: kickMsg,
                    mentions: [ctx.sender]
                });

                // KICK ATTEMPT (Upaya Paksa)
                try {
                    await ctx.bot.sock.groupParticipantsUpdate(
                        ctx.chatId,
                        [ctx.sender],
                        'remove'
                    );
                    ctx.logger.warn('ANTILINK', `User ${ctx.pushName} telah di-KICK.`);
                } catch (e) {
                    ctx.logger.error(
                        'ANTILINK',
                        `Gagal kick user: ${e.message} (Izin ditolak/Target Admin/Owner)`
                    );
                    await ctx.reply(
                        "❌ Saya gagal mengeluarkan anggota. Pastikan saya *Admin* dengan izin 'Keluarkan Anggota'."
                    );
                }
            }
        }

      } catch (e) {
        ctx.logger.error('ANTILINK', `System Error: ${e.message}`);
      }
    }
  }
}