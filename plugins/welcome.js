import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export default {
    name: "welcome",
    version: "4.0-FULL-REWARDS",
    description: "Sambut member & Reward Add Member",

    events: {
        'group-participants-update': async (ctx) => {
            const { id, participants, action, author } = ctx;
            
            // Cek engine ada di ctx (dari Core v5.5 ke atas biasanya ada di ctx.config atau kita akses global jika perlu)
            // Tapi cara paling aman di event handler adalah passing manual lewat argumen jika core mendukung,
            // atau menggunakan module import jika engine diexport. 
            // ASUMSI: `ctx` yang dikirim dari Core sudah membawa referensi ke engine/plugins.
            
            // Kita gunakan trik akses engine lewat listPlugins (karena ctx.listPlugins ada di core)
            // Ini untuk mencari plugin 'token_earner'
            let tokenPlugin = null;
            if (ctx.listPlugins) {
                const plugins = ctx.listPlugins();
                tokenPlugin = plugins.find(p => p.name === 'token_earner');
            }

            if (action === 'add' || action === 'join') {
                // 1. LOGIKA REWARD "ADD MEMBER" (Jika ada yang menambahkan)
                // Syarat: Ada 'author', dan 'author' BUKAN salah satu dari 'participants' (berarti bukan join via link sendiri)
                if (action === 'add' && author && !participants.includes(author) && tokenPlugin) {
                    
                    // Panggil fungsi di token-earner.js
                    // Kita butuh akses ke engine utama untuk save database user
                    // Di Core v5.5, ctx tidak membawa object engine penuh, tapi ctx.listPlugins() ada.
                    // Mari kita impor engine secara dinamis agar aman 100%
                    const engineModule = await import('../core/index.js');
                    const engine = engineModule.default;

                    const result = await tokenPlugin.processAddReward(engine, author, participants.length);
                    
                    if (result) {
                        // Kirim notifikasi ke grup (Tag Pengundang)
                        await ctx.bot.sock.sendMessage(id, {
                            text: `🌟 *@${author.split('@')[0]}* Added new member!\n💰 Reward: +${result.bonus} Token\n💳 Total: ${result.totalTokens} Token`,
                            mentions: [author]
                        });
                    }
                }

                // 2. LOGIKA WELCOME MESSAGE & REGISTRASI MEMBER BARU
                for (const memberId of participants) {
                    // Register member baru ke sistem token (agar bisa disambut orang lain)
                    if (tokenPlugin && tokenPlugin.registerNewMember) {
                        tokenPlugin.registerNewMember(memberId);
                    }

                    // Kirim Pesan Welcome
                    try {
                        let text = `Welcomee @${memberId.split('@')[0]}! 👋\n`;
                        await ctx.bot.sock.sendMessage(id, { text: text, mentions: [memberId] });
                    } catch (e) {}
                }
            }
        }
    }
};