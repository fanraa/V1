// plugins/settings.js
// Global Mode Manager
// ===================

export default {
    name: 'settings',
    cmd: ['setting', 'settings', 'mode', 'setup'], 
    type: 'command', // <--- FIX: HARUS 'command' AGAR DIBACA BOT
    priority: 1,

    run: async (ctx) => {
        const { args, reply, settings, updateSettings, user } = ctx;
        const type = args[0]?.toLowerCase();
        const status = args[1]?.toLowerCase();

        // 1. TAMPILKAN STATUS (Bisa dilihat semua member)
        if (!type) {
            return reply(`
🛠 *FANRABOT STATUS*
👤 *Your Role:* ${user?.role === 'owner' ? '👑 OWNER' : '👤 MEMBER'}

👥 *Group Mode:* ${settings.groupMode ? '✅ ON' : '🔴 OFF'}
👤 *Private Mode:* ${settings.privateMode ? '✅ ON' : '🔴 OFF'}
📢 *Self Message:* ${settings.selfMessage !== false ? '✅ ON' : '🔴 OFF'}

*Panduan Owner:*
.setting group on/off
.setting private on/off
            `.trim());
        }

        // 2. CEK HAK AKSES (Hanya Owner yang bisa ubah)
        if (user.role !== 'owner') {
            return reply("🔒 *ACCESS DENIED*\nAnda bukan Owner bot ini.");
        }

        // 3. LOGIKA UBAH SETTING
        let newValue;
        if (['on', 'hidup', 'aktif', '1'].includes(status)) newValue = true;
        else if (['off', 'mati', 'nonaktif', '0'].includes(status)) newValue = false;
        else return reply("❌ Gunakan 'on' atau 'off'. Contoh: .setting group off");

        if (type === 'group' || type === 'grup') {
            updateSettings('groupMode', newValue);
            return reply(`✅ Group Mode: ${newValue ? 'ON' : 'OFF'}`);
        } 
        else if (type === 'private' || type === 'pc') {
            updateSettings('privateMode', newValue);
            return reply(`✅ Private Mode: ${newValue ? 'ON' : 'OFF'}`);
        }
        else if (type === 'self') {
            updateSettings('selfMessage', newValue);
            return reply(`✅ Self Message: ${newValue ? 'ON' : 'OFF'}`);
        }
        else {
            return reply("❌ Tipe salah. Gunakan: group, private, atau self.");
        }
    }
};