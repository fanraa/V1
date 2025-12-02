import os from "os";

export default {
  name: "ping",
  cmd: ["ping", "speed", "p"],
  type: "command",
  priority: 1,

  run: async (ctx) => {
        // 🚀 LOGGING DITAMBAHKAN
        ctx.logger.info('CMD-PING', `Ping command triggered by ${ctx.pushName || 'User'}.`);
        
    const start = Date.now();

    // Pesan awal
    const sent = await ctx.sendMessage({ 
      text: "🏓 Pong...", 
      quoted: ctx.raw // reply ke pesan user
    });

    // Latency
    const latency = Date.now() - start;

    // Runtime
    const uptime = process.uptime();
    const h = String(Math.floor(uptime / 3600)).padStart(2, "0");
    const m = String(Math.floor((uptime % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(uptime % 60)).padStart(2, "0");
    const runtime = `${h}:${m}:${s}`;

    // Device Info
    const platform = os.platform();
    const prettyPlatform =
      platform === "linux"  ? "Linux" :
      platform === "win32" ? "Windows" :
      platform === "darwin"? "MacOS"  :
      platform;

    const ramUsed = (os.totalmem() - os.freemem()) / 1024 / 1024 / 1024;
    const cpu = os.cpus().length;

    const info = `
📡 \`:${latency}ms\`
⏱️ :${runtime}
💾 \`:${ramUsed.toFixed(2)}GB • ${cpu} CPU\`
🖥️ :${prettyPlatform}
`.trim();

    // Edit pesan bot sebelumnya agar tetap reply ke user
    try {
      await ctx.bot.sock.sendMessage(ctx.chatId, {
        text: info,
        edit: sent.key,
        quoted: ctx.raw // tetap reply ke pesan user
      });
    } catch (e) {
      // fallback
      await ctx.reply(info, { quoted: ctx.raw });
    }
  }
};