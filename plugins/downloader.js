// plugins/downloader.js
// Universal Downloader (TikTok, IG, YT, FB, CapCut)
// Robust version with fallbacks + scraping
// ==================================================

import fs from 'fs';
import os from 'os';

export default {
  name: 'downloader',
  cmd: ['dl','download','tiktok','tt','ig','instagram','yt','youtube','fb','facebook','capcut','cp'],
  type: 'command',
  priority: 10,

  run: async (ctx) => {
    const { args, reply, sendMessage, react } = ctx;
    const url = args[0];

    if (!url) return reply(`Please provide a valid link. Usage: .dl <link>`);

    await react('⏳');

    try {
      let result = null;

      if (/tiktok\.com|vm\.tiktok\.com/i.test(url)) {
        result = await downloadTikTok(url, ctx); 
      } else if (/instagram\.com|instagr\.am/i.test(url)) {
        result = await downloadInstagram(url, ctx); 
      } else if (/youtube\.com|youtu\.be/i.test(url)) {
        result = await downloadYouTube(url, ctx); 
      } else if (/facebook\.com|fb\.watch/i.test(url)) {
        result = await downloadFacebook(url, ctx); 
      } else if (/capcut\.com/i.test(url)) {
        result = await downloadCapCut(url, ctx); 
      } else {
        return reply("❌ Unknown Link. Supported: TikTok, Instagram, YouTube, Facebook, CapCut.");
      }

      if (!result || !result.url) {
        await react('❌');
        return reply("❌ Download failed: no media URL returned or resource is private.");
      }

      // Build caption
      const caption = [
        '✅ DOWNLOAD SUCCESS',
        `📱 Platform: ${result.platform}`,
        `📝 Title: ${result.title || 'No Title'}`,
      ].join('\n');

      // Prefer to send direct URL (Baileys can send url streams). If your WA library/server blocks large remote media,
      // you might want to download to disk and send as buffer (but caution: disk + memory limits).
      if (result.type === 'video') {
        await sendMessage({ video: { url: result.url }, caption }, { quoted: ctx.raw });
      } else {
        await sendMessage({ image: { url: result.url }, caption }, { quoted: ctx.raw });
      }

      await react('✅');
    } catch (e) {
      ctx.logger.error('DL', `Error: ${e.stack || e.message || e}`);
      await react('❌');
      await reply(`❌ Error: ${String(e.message || e)}\n_Try again later or use another link._`);
    }
  }
};

/* ---------------------------------------------
   Utility: fetch with timeout (works in Node 18+ or with global fetch)
---------------------------------------------- */
async function fetchWithTimeout(resource, options = {}) {
  const timeout = options.timeout ?? 15000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const res = await fetch(resource, { ...options, signal: controller.signal });
  clearTimeout(id);
  return res;
}

/* -----------------------------
   TikTok
------------------------------*/
async function downloadTikTok(url, ctx) { 
  try {
    const res = await fetchWithTimeout(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
    const data = await res.json();
    if (data?.code !== 0) {
        ctx.logger.warn('DL-TT', `API returned non-zero status code: ${data?.code || 'unknown'}`);
        throw new Error('TikTok: Not found or Private');
    }
    ctx.logger.info('DL-TT', 'Download success via tikwm API.');
    return { platform: 'TikTok', type: 'video', url: data.data.play, title: data.data.title };
  } catch (e) {
    ctx.logger.error('DL-TT', `Error: ${e.message}`);
    throw new Error(e.name === 'AbortError' ? 'Request Timeout' : `TikTok error: ${e.message}`);
  }
}

/* -----------------------------
   Instagram (API + Scraping Fallback)
------------------------------*/
// ⚠️ CATATAN: GANTI PLACEHOLDER API DENGAN API YANG BERFUNGSI!
const INSTAGRAM_APIS = [
    // 🚀 PLACEHOLDER: GANTI INI DENGAN URL API Instagram yang baru Anda temukan
    url => `https://api.new-ig-downloader.com/v1?url=${encodeURIComponent(url)}&apikey=YOUR_KEY`, 
];

async function downloadInstagram(url, ctx) { 
  // 1) Coba API
  for (const makeEndpoint of INSTAGRAM_APIS) {
    const endpoint = makeEndpoint(url);
    try {
        ctx.logger.info('DL-IG', `Trying API: ${endpoint.substring(0, 30)}...`);
        const res = await fetchWithTimeout(endpoint, { timeout: 12000 });
        const body = await res.json().catch(()=>null);
        if (body && body.result && (body.result.media || body.result.url)) {
            ctx.logger.info('DL-IG', 'API success.');
            const u = body.result.media || body.result.url;
            return { platform: 'Instagram', type: body.result.type || 'video', url: u, title: body.result.title || 'Instagram' };
        }
        ctx.logger.warn('DL-IG', `API failed: Unexpected JSON format from ${endpoint.substring(0, 30)}...`);
    } catch (e) {
        ctx.logger.warn('DL-IG', `API request failed: ${e.message}`);
    }
  }
  ctx.logger.warn('DL-IG', 'All API attempts failed. Trying scraping...');


  // 2) Scraping page metadata (og tags / ld+json)
  try {
    const pageRes = await fetchWithTimeout(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await pageRes.text();
    
    // Coba cari og:video atau og:image
    const ogVideo = html.match(/<meta property="og:video" content="([^"]+)"/i);
    if (ogVideo && ogVideo[1]) {
        ctx.logger.info('DL-IG', 'Scraping success: og:video found.');
        return { platform: 'Instagram', type: 'video', url: decodeHTML(ogVideo[1]), title: 'Instagram Video' };
    }

    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (ogImage && ogImage[1]) {
        ctx.logger.info('DL-IG', 'Scraping success: og:image found.');
        return { platform: 'Instagram', type: 'image', url: decodeHTML(ogImage[1]), title: 'Instagram Image' };
    }
    ctx.logger.warn('DL-IG', 'All scraping attempts failed.');
  } catch (e) {
    ctx.logger.error('DL-IG', `Scraping network error: ${e.message}`);
  }

  throw new Error('Instagram: media not found (post may be private, scraping blocked, or API unavailable).');
}

/* -----------------------------
   YouTube (Hanya ytdl-core)
------------------------------*/
// 🚀 Dihapus: YT_APIS yang mati
async function downloadYouTube(url, ctx) { 
  // 1) Try ytdl-core if available (fast & reliable if installed)
  try {
    const ytdl = await import('ytdl-core').catch(()=>null);
    if (ytdl) {
      const info = await ytdl.getInfo(url);
      const fmt = info.formats.find(f => f.container === 'mp4' && f.hasVideo && f.hasAudio && f.contentLength);
      const chosen = fmt || info.formats.find(f => f.hasVideo && f.hasAudio);
      const streamUrl = chosen?.url;
      if (streamUrl) {
          ctx.logger.info('DL-YT', 'Download success via ytdl-core.');
          return { platform: 'YouTube', type: 'video', url: streamUrl, title: info.videoDetails.title };
      }
    }
  } catch (e) {
    ctx.logger.warn('DL-YT', `ytdl-core failed: ${e.message}.`);
  }

  throw new Error('YouTube: cannot fetch video (install ytdl-core or video is restricted).');
}

/* -----------------------------
   Facebook (Hanya Scraping Metadata)
------------------------------*/
// 🚀 Dihapus: FACEBOOK_APIS yang mati
async function downloadFacebook(url, ctx) { 
  ctx.logger.info('DL-FB', 'Skipping failed APIs. Trying scraping page metadata...');

  // scraping fallback
  try {
    const pageRes = await fetchWithTimeout(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await pageRes.text();
    const ogVideo = html.match(/<meta property="og:video" content="([^"]+)"/i);
    if (ogVideo && ogVideo[1]) {
        ctx.logger.info('DL-FB', 'Scraping success: og:video found.');
        return { platform: 'Facebook', type: 'video', url: decodeHTML(ogVideo[1]), title: 'Facebook Video' };
    }
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (ogImage && ogImage[1]) {
        ctx.logger.info('DL-FB', 'Scraping success: og:image found.');
        return { platform: 'Facebook', type: 'image', url: decodeHTML(ogImage[1]), title: 'Facebook Image' };
    }
    ctx.logger.warn('DL-FB', 'All scraping attempts failed.');
  } catch (e) {
    ctx.logger.error('DL-FB', `Scraping network error: ${e.message}`);
}

  throw new Error('Facebook: media not found (private or blocked).');
}

/* -----------------------------
   CapCut (Tanpa API Fallback)
------------------------------*/
// 🚀 Dihapus: CAPCUT_APIS yang mati
async function downloadCapCut(url, ctx) { 
  throw new Error('CapCut: All free APIs are currently unstable. Cannot fetch template.');
}

/* -----------------------------
   Helpers
------------------------------*/
function decodeHTML(s='') {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}