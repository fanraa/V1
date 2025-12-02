import fs from 'fs/promises';

export default {
    name: "daily_reward",
    version: "2.0-GACHA",
    cmd: ['daily', 'claim', 'absen', 'bonus'],
    type: 'command',

    run: async (ctx) => {
        const { user, reply, saveUsers } = ctx;
        
        // 1. Cek Tanggal Hari Ini (YYYY-MM-DD)
        // Menggunakan waktu server, pastikan jam server sesuai atau gunakan UTC+7 manual jika perlu
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        // 2. Cek apakah sudah ambil
        if (user.lastDaily === today) {
            return reply(`⏳ *Wait until tomorrow!*\nYou have already claimed your daily reward today.\nCome back tomorrow!`);
        }

        // 3. SISTEM GACHA (RNG)
        const chance = Math.random() * 100; // Angka acak 0 - 100
        let reward = 0;
        let tier = '';
        let icon = '';

        if (chance < 60) { 
            // 60% Kemungkinan: COMMON (1-5 Token)
            reward = Math.floor(Math.random() * 5) + 1;
            tier = 'Common';
            icon = '⚪';
        } else if (chance < 90) { 
            // 30% Kemungkinan: UNCOMMON (6-9 Token)
            reward = Math.floor(Math.random() * 4) + 6;
            tier = 'Uncommon';
            icon = '🟢';
        } else if (chance < 99) { 
            // 9% Kemungkinan: RARE (10-15 Token)
            reward = Math.floor(Math.random() * 6) + 10;
            tier = 'Rare';
            icon = '🔵';
        } else { 
            // 1% Kemungkinan: LEGENDARY (16-20 Token)
            reward = Math.floor(Math.random() * 5) + 16;
            tier = 'LEGENDARY';
            icon = '🔥';
        }

        // 4. Tambah Token & Simpan
        user.tokens = (user.tokens || 0) + reward;
        user.lastDaily = today;
        
        await saveUsers();

        // 5. Pesan Respon
        const msg = `
📅 *DAILY REWARD CLAIMED!*

🎲 *Luck:* ${icon} ${tier}
💰 *Received:* +${reward} Tokens
💳 *New Balance:* ${user.tokens} Tokens

${tier === 'LEGENDARY' ? '_WOW! You hit the JACKPOT!_ 🎉' : '_Come back tomorrow for more!_'}
        `.trim();

        return reply(msg);
    }
};