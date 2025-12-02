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
    await ctx.react('⏳');
    
    // Memberi sedikit waktu untuk mendapatkan latency yang lebih akurat
    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    // Latency
    const latency = Date.now() - start;

    // Runtime
    const uptime = process.uptime();
    const h = String(Math.floor(uptime / 3600)).padStart(2, "0");
    const m = String(Math.floor((uptime % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(uptime % 60) ).padStart(2, "0");
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

    // --- STRUKTUR PESAN UTAMA ---
    const info = `
| Latency: \`${latency}ms\`
| Uptime: \`${runtime}\`
| RAM: \`${ramUsed.toFixed(2)} GB\` / ${cpu} CPU
| Platform: \`${prettyPlatform}\`
`.trim();

    // Konten yang akan muncul di rich preview
    const RICH_HEADER = "👑 FANRABOT | SUPPORT"; 

    // Placeholder Thumbnail (1x1 GIF) untuk Rich Preview
    const THUMBNAIL_BUFFER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

    // Menggabungkan pesan dengan Rich Context (meniru header pada reply)
    const messagePayload = {
        text: `*${info}*`, // Isi utama pesan
        contextInfo: {
            externalAdReply: {
                title: RICH_HEADER, // Baris teratas (FANRABOT | SUPPORT)
                body: "Status: Connected", // Baris di bawah header
                sourceUrl: 'https://fanrabot.com/support', // URL (Opsional)
                thumbnail: THUMBNAIL_BUFFER,
                mediaType: 1, 
                showAdAttribution: true 
            }
        }
    };
    
    // Menghapus logika sendMessage awal dan edit message, kirim payload akhir
    await ctx.sendMessage(messagePayload, { quoted: ctx.raw });

    await ctx.react('✅');
  }
};