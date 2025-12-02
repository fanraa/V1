import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export default {
    name: "backup",
    cmd: ["backup", "zip"],
    type: "command",
    priority: 1,

    run: async (ctx) => {
        // 1. Owner Check (tetap Bahasa Indonesia karena ini pesan kontrol)
        if (ctx.user?.role !== 'owner') {
            return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh **Owner Bot**.");
        }

        await ctx.react("⏳");
        if (ctx.isGroup) {
            await ctx.reply("📩 Sending backup file to Private Chat (DM) for security...");
        }

        const outputFileName = `FanraBot_Backup_${new Date().toISOString().slice(0, 10)}.zip`;
        const outputFilePath = path.join(ROOT, outputFileName);
        
        const output = fs.createWriteStream(outputFilePath);
        // FIX 1: Turunkan level kompresi menjadi 5 (Lebih cepat dari 9)
        const archive = archiver('zip', { zlib: { level: 5 } });

        archive.pipe(output);

        // --- 2. EXCLUSION LIST (PERBAIKAN KEAMANAN & BUG) ---
        const excludePatterns = [
            'node_modules/**', 
            'session/**',      
            'logs/**',
            // HAPUS 'data/users.json' agar file KRUSIAL ini ikut di-backup.
            '.npm/**',
            '*.zip',           
            outputFileName,
            'package-lock.json',
            '.env',            
            '.DS_Store',
             // Contoh tambahan jika ada folder media/cache lain:
             'temp/**' 
        ];

        archive.glob('**/*', {
            cwd: ROOT,
            ignore: excludePatterns,
            dot: true 
        });

        await archive.finalize();

        output.on('close', async () => {
            try {
                const fileSizeKB = (fs.statSync(outputFilePath).size / 1024).toFixed(2);
                
                // Kirim ke Pengirim (DM)
                await ctx.sendMessage({ 
                    document: { url: outputFilePath },
                    mimetype: 'application/zip',
                    fileName: outputFileName,
                    caption: `✅ *Backup Success!* \n📅 Date: ${new Date().toLocaleDateString()}\n📦 Size: ${fileSizeKB} KB\n🔒 *NOTE: .env and session files are excluded.*`,
                }, { jid: ctx.sender }); 
                
                if (ctx.isGroup) await ctx.react("✅");

            } catch (e) {
                ctx.logger.error('BACKUP', `Failed to send file: ${e.message}`);
                await ctx.reply("❌ Failed to send backup file.");
            } finally {
                try { fs.unlinkSync(outputFilePath); } catch(e) {}
            }
        });

        output.on('error', (err) => {
            ctx.logger.error('BACKUP', `Archiving error: ${err.message}`);
            ctx.reply("❌ Failed to create zip file.");
        });
    }
};