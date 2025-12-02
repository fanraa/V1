// plugins/group-admin.js
// 🛡️ Group Admin Tools — Clean Version

export default {
  name: "group-admin",
  cmd: ["kick", "add", "promote", "demote", "admin", "unadmin"],
  type: "command",
  priority: 2,
    
    // --- KONTROL HAK AKSES GLOBAL (Via core/index.js) ---
    access: {
        isGroup: true,
        isAdmin: true,
        isOwner: false,      
        isPremium: false
    },
    // ----------------------------------------------------

  run: async (ctx) => {
    try {
      // Pengecekan isGroup sudah dilakukan di core/index.js
      
      const isOwner = ctx.user && ctx.user.role === "owner";
      
      // --- Pengecekan Hak Akses BOT (Bot Admin Check) ---
      // Logika: Jika pengguna BUKAN Owner, kita harus cek apakah Bot adalah Admin.
      // Owner diizinkan mem-bypass ini (misalnya untuk mempromosikan Bot).
      if (!isOwner) {
          if (!ctx.isBotAdmin && ctx.command !== 'add') {
              return ctx.reply("🤖 Bot tidak memiliki hak akses Admin Grup. Gagal menjalankan perintah.");
          }
      }
      // ----------------------------------------------------
      
      // --- 1. TARGET PARSER ---
      let target;
      const firstArg = ctx.args[0] ? ctx.args[0].toLowerCase() : "";

      // Handle "me" target (untuk promote/demote diri sendiri)
      if (["me", "myself"].includes(firstArg)) {
          if (["kick", "add"].includes(ctx.command)) {
              return ctx.reply("😅 Anda tidak bisa menggunakan perintah ini pada diri sendiri.");
          }
          
          // Khusus promote me / demote me
          if (["promote", "demote", "admin", "unadmin"].includes(ctx.command)) {
              if (!isOwner) {
                  return ctx.reply("👑 Hanya *Owner Bot* yang diizinkan mempromosikan/mendemosikan diri sendiri.");
              }
              // Jika Owner dan perintahnya promote/demote me, targetnya adalah diri sendiri
              target = ctx.sender; 
          }
      } 
      // Handle Tag / Reply / Nomor HP
      else {
        const raw = ctx.raw?.message;
        const contextInfo = raw?.extendedTextMessage?.contextInfo 
                         || raw?.imageMessage?.contextInfo 
                         || raw?.videoMessage?.contextInfo;

        if (contextInfo?.mentionedJid?.length > 0) {
            target = contextInfo.mentionedJid[0];
        } else if (contextInfo?.participant) {
            target = contextInfo.participant;
        } else if (ctx.args.length > 0) {
            let input = ctx.args.join("").replace(/[^0-9]/g, "");
            if (input.startsWith("08")) input = "62" + input.slice(1);
            if (input.length > 5) target = input + "@s.whatsapp.net";
        }
      }

      if (!target) {
        return ctx.reply("⚠️ Target tidak terdeteksi. Silakan *tag* pengguna atau *reply* pesannya.");
      }

      // --- 2. EXECUTE ACTION ---
      const targetNum = target.split("@")[0];
      const botId = ctx.bot.sock.user.id.split(":")[0];

      // Proteksi Bot (melarang kick/demote diri sendiri)
      if (target.includes(botId) && ["kick", "demote", "unadmin"].includes(ctx.command)) {
        return ctx.reply("🤖 Saya tidak bisa melakukan aksi tersebut pada diri sendiri.");
      }

      switch (ctx.command) {
        case "kick":
          try {
            // Cek apakah target adalah Owner. Hanya Owner yang bisa kick Owner lain.
            if (!isOwner && ctx.isOwner(targetNum)) {
                return ctx.reply("👑 Anda tidak bisa mengeluarkan Owner Bot.");
            }
            await ctx.bot.sock.groupParticipantsUpdate(ctx.chatId, [target], "remove");
            await ctx.reply(`✅ Berhasil mengeluarkan @${targetNum} dari grup.`, { mentions: [target] });
          } catch (e) {
            await ctx.reply("🚫 Gagal mengeluarkan. Pastikan bot adalah *Admin* dan Anda memiliki otoritas yang lebih tinggi dari target.");
          }
          break;

        case "add":
          // Logika Add tidak memerlukan Bot Admin, tetapi membutuhkan User Admin/Owner.
          try {
            const res = await ctx.bot.sock.groupParticipantsUpdate(ctx.chatId, [target], "add");
            const status = res[0]?.status;

            if (status === "200") {
              await ctx.reply(`✨ Berhasil menambahkan @${targetNum} ke grup.`, { mentions: [target] });
            } else if (status === "403") {
              await ctx.reply(`🔐 Privasi pengguna memblokir penambahan. Mengirim link undangan...`);
              const code = await ctx.bot.sock.groupInviteCode(ctx.chatId);
              await ctx.sendMessage({ text: `Silakan bergabung melalui link ini: https://chat.whatsapp.com/${code}` }, { jid: target });
            } else {
              await ctx.reply(`❌ Gagal menambahkan. Mungkin pengguna sudah ada di grup atau ada masalah jaringan.`);
            }
          } catch {
            await ctx.reply("🚫 Gagal menambahkan. Pastikan Anda memiliki hak Admin/Owner.");
          }
          break;

        case "promote":
        case "admin":
          try {
            // Cek apakah target adalah Owner, Owner tidak boleh di-promote (karena sudah role tertinggi)
            if (ctx.isOwner(targetNum)) {
                return ctx.reply("👑 Target sudah menjadi Owner Bot, tidak perlu dipromosikan lagi.");
            }
            await ctx.bot.sock.groupParticipantsUpdate(ctx.chatId, [target], "promote");
            await ctx.reply(`👑 @${targetNum} sekarang adalah Admin Grup.`, { mentions: [target] });
          } catch {
            await ctx.reply("🚫 Gagal. Bot harus menjadi Admin untuk mempromosikan.");
          }
          break;

        case "demote":
        case "unadmin":
          try {
            // Cek apakah target adalah Owner, Owner tidak boleh di-demote oleh Admin Grup biasa
            if (!isOwner && ctx.isOwner(targetNum)) {
                return ctx.reply("👑 Anda tidak diizinkan mendemosi Owner Bot.");
            }
            await ctx.bot.sock.groupParticipantsUpdate(ctx.chatId, [target], "demote");
            await ctx.reply(`⬇️ @${targetNum} bukan lagi Admin Grup.`, { mentions: [target] });
          } catch {
            await ctx.reply("🚫 Gagal. Bot harus menjadi Admin untuk mendemosi.");
          }
          break;
      }

    } catch (e) {
      ctx.logger.error("ADMIN", `Error: ${e.message}`);
      ctx.reply("❌ Terjadi kesalahan sistem saat memproses perintah Admin.");
    }
  }
};