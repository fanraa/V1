// plugins/badwords.js
// 🚫 MODUL STANDALONE TANPA MEMBACA FILE EKSTERNAL (Hardcoded List)

const mutedData = new Map(); // Menggunakan Map untuk data Mute (Volatile/tidak disimpan ke disk)

// --- DAFTAR KATA KASAR (Hardcoded) ---
const PROFANITY_LIST = [
  // ENGLISH - Sexual / Vulgar
  "fuck","fck","fuk","fucking","fucked","fucker","motherfucker","cunt","pussy","dick","cock",
  "asshole","bitch","slut","whore","twat","prick","bastard","wanker","tosser","bollocks",
  "shit","crap","bullshit","ass","tits","titties","boobs","nigga","nigger","niggers","faggot",
  "fag","queer","tranny","retard","retarded","spastic","cripple","kike","chink","spic","wetback",
  "beaner","gook","jap","raghead","sandnigger","coon","porchmonkey","junglebunny","suck my dick",
  "lick my ass","eat shit","kill yourself","kys","go die","die in a fire","rope yourself","hang yourself",
  "cut yourself","jump off","drink bleach","unalive","suicide","self harm","anhero","1488","88",
  "white power","nazi","hitler did nothing wrong","gas the jews","heil hitler","sieg heil",

  // INDONESIA - Umum & Jorok
  "anjing","asu","bajingan","bangsat","bego","bego","begoan","bego banget","bodoh","brengsek",
  "babi","babi ngepet","bangke","bangsat","jancuk","jancok","kontol","kntl","kontl","kontolodon",
  "memek","mmk","pepek","peler","titit","ngentot","ewe","goyang","tempik","kimak","kimakkk",
  "kimakk","tai","taek","tahi","setan","iblis","goblok","goblokkk","kampang","kampret","keparat",
  "kunyuk","monyet","monyet lu","monyetnya","ngentot ibu lu","ngentot bapak lu","bapak kau hijau",
  "ibu kau hijau","lu bangsat","lo bangsat","bangsat lu","bangsat lo","sundel","sundal","pelacur",
  "bencong","banci","warlok","waria","lgbt mending mati","trans mati aja","gay mati aja","lesbi haram",
  "munafik","kafir","kafir haram","kafir mati","yahudi laknat","zionis","israel busuk","palestina menang",

  // INDONESIA - Rasis & Tribal
  "cina babi","cina kampret","cina bangsat","cina kafir","cina mata sipit","cina mata belo","papua monyet",
  "papua hitam","jawa kampung","jawa miskin","batak kasar","batak bawel","madura preman","sunda lembut banget",
  "dayak kanibal","ambon berisik","maluku berantem","timor preman","bugis sombong","makassar sombong",

  // TAGALOG / FILIPINO
  "putangina","putang ina mo","gago","ulol","kupal","tangina","leche","punyeta","bobo","tanga",
  "hindot","kantot","puke","puki","tarantado","burat","burat mo","bilat","pekpek","jakol","jabol",

  // SPANISH (Latin America & Spain)
  "hijo de puta","hijueputa","hijaputa","marica","maricon","puta","puta madre","joder","mierda",
  "coño","pendejo","cabron","culero","verga","panocha","chingar","mamón","pinche","culiao",

  // GERMAN
  "scheisse","ficken","fotze","arschloch","hurensohn","wichser","verpiss dich","du hurensohn",
  "nazi","judensau","kanake","ausländer raus",

  // FRENCH
  "putain","enculé","fils de pute","salope","connard","merde","nique ta mère","ta gueule",
  "pd","pd de merde","negre","bougnoule","bamboula",

  // ARABIC (common slurs)
  "kalb","ya ibn el sharmouta","sharmouta","zamel","khawal","ya hmar","ya himar","ya 3ahira",

  // RUSSIAN
  "pizda","huy","ebat","yob tvoyu mat","pidor","pidoras","churka","chernozhopy","zhid",

  // PORTUGUESE (Brazil)
  "filho da puta","fdp","caralho","porra","viado","bicha","cu","buceta","cuzao","vsf","vtnc",

  // HINDI / INDIAN
  "madarchod","behenchod","bhosdike","randi","chutiya","gandu","harami","suar","kutta","kutti",

  // MALAYSIA
  "puki","pukimak","babi","bangsat","bodoh","bodo","lanjiao","cipet","butoh","pantat","bodoh sial",

  // KOREAN
  "ssibal","gae-sae-kki","jonna","michin","shibal","gaejasik","gajja","jjaji","jjonda",

  // JAPANESE
  "kuso","chikusho","baka","aho","kimochi warui","shine","kusottare","man ko","hentai",

  // VIETNAMESE
  "đụ mẹ","địt mẹ","đụ","đĩ","lồn","cặc","đéo","vãi","vcl","vãi lồn","vãi cặc","đụ con mẹ mày",

  // THAI
  "ไอ้เหี้ย","มึง","กู","เย็ด","หี","ควย","อีดอก","อีควาย","ไอ้สัตว์","แม่ง","เหี้ย",

  // OTHERS / MIXED
  "son of a bitch","mother fucker","cock sucker","dumbass","dipshit","jackass","asswipe","douchebag",
  "cocksucker","piss off","fuck off","eat my ass","suck it","blow me","go fuck yourself","cuntface",
  "shithead","dumb fuck","stupid cunt","fatass","ugly bitch","loser","pathetic","worthless","trash",
  "garbage human","human waste","scum","degenerate","incel","virgin","beta","simp","cuck","soyboy"
];

// --- PESAN PERINGATAN BARU (English Satire, No Emoji) ---
const JOKE_WARNINGS = [
  "Message deleted because of dirty language, bro.",
  "That was filthy, so I removed it.",
  "You used some nasty words, message gone.",
  "Bad language detected, deleted.",
  "That message was full of offensive words, had to remove it.",
  "Your message got deleted for using inappropriate language.",
  "Dirty mouth = deleted message. Simple.",
  "You said something gross, so I wiped it.",
  "Offensive words aren't allowed, message removed.",
  "That was way too vulgar, deleted.",
  "Your message crossed the line with bad language, gone.",
  "No dirty talk here, message deleted.",
  "You used foul language, so I took it down.",
  "That message was inappropriate, removed.",
  "Filthy words = instant delete.",
  "Keep it clean or it gets deleted, just like that.",
  "Your message had offensive language, so I deleted it.",
  "Bad words aren't welcome, message removed.",
  "That was crude, deleted.",
  "You used vulgar language, message gone.",
  "Inappropriate words detected, deleted.",
  "Your message was too dirty, had to remove it.",
  "Foul language isn't allowed, message deleted.",
  "That message contained offensive terms, removed.",
  "No room for dirty language here, deleted.",
  "You said something nasty, message wiped.",
  "Vulgar words = automatic delete.",
  "Your message was inappropriate due to bad language, gone.",
  "Keep the language clean or it disappears.",
  "That was gross, deleted."

];


// --- HELPER NORMALISASI ---
function normalizeText(text) {
    if (!text) return '';
    let s = text.toLowerCase();
    // Leetspeak/typo substitutions
    s = s.replace(/4/g,'a').replace(/3/g,'e').replace(/1/g,'i')
          .replace(/0/g,'o').replace(/5/g,'s').replace(/7/g,'t')
          .replace(/@/g, 'a').replace(/\$/g, 's').replace(/\+/g, 't');
    // Remove non-alphanumeric except space
    s = s.replace(/[^a-z\s]/g, '');
    return s.trim();
}

function containsProfanity(text) {
    if (!text) return false;
    const nx = normalizeText(text);
    
    return PROFANITY_LIST.some(w => {
        // Check for whole words
        return new RegExp(`\\b${w}\\b`, 'i').test(nx);
    });
}


export default {
    name: "badwords_standalone", 
    version: "9.2-EN-SATIRE", // Versi diupdate
    priority: 1,

    events: {
        "message": async (ctx) => {
            ctx.logger.info('BADWORDS', 'Check triggered.'); 
            
            if (!ctx.isGroup) return;

            const sender = ctx.sender;
            const body = ctx.body || "";
            
            // 1. Muted check (Disederhanakan menggunakan Map)
            if (mutedData.has(sender)) {
                const userData = mutedData.get(sender);
                if (Date.now() > userData.expire) {
                    mutedData.delete(sender);
                    ctx.logger.info('BADWORDS', `User ${ctx.senderNumber} auto-unmuted (Expired).`);
                } else {
                    // Masih mute? Hapus pesan dia
                    try { 
                        await ctx.deleteMessage(ctx.key); 
                        ctx.logger.warn('BADWORDS', `Muted user ${ctx.senderNumber} sent message. Deleted.`);
                    } catch (e) {
                        ctx.logger.error('BADWORDS', `Failed to delete muted message: ${e.message}`);
                    }
                    return;
                }
            }

            // 2. DETEKSI BADWORD
            const isProfane = containsProfanity(body);
            ctx.logger.debug('BADWORDS', `Check: "${body}" -> Normalized: "${normalizeText(body)}" | Profane: ${isProfane}`);

            if (!isProfane) return;

            // --- PROFANITY DETECTED ---
            ctx.logger.warn('BADWORDS', `Profanity detected from ${ctx.senderNumber}.`);

            // 3. HAPUS PESAN KASAR (Upaya Paksa)
            try { 
                await ctx.deleteMessage(ctx.key); 
            } catch (e) {
                // Jika gagal di sini, 99% masalahnya adalah Izin Admin Bot.
                ctx.logger.error('BADWORDS', `Failed to delete profanity (Check Admin Status): ${e.message}`);
            }

            // 4. HUKUMAN (Mute Logic)
            let userData = mutedData.get(sender) || { count: 0, expire: 0 };
            userData.count++;
            
            const warn = JOKE_WARNINGS[Math.floor(Math.random() * JOKE_WARNINGS.length)];
            
            if (userData.count >= 10) {
                userData.expire = Date.now() + (3600 * 1000); // 1 jam
                userData.count = 0; // Reset count after mute
                
                await ctx.sendMessage({
                    text: `🔇 @${ctx.senderNumber} is now *MUTED for 1 HOUR* due to excessive swearing. Try using nice words next time!`, 
                    mentions: [sender]
                });
            } else {
                // Warning message
                if (userData.count % 2 === 0 || userData.count === 1) {
                     await ctx.sendMessage({ text: `${warn} (@${ctx.senderNumber})`, mentions: [sender] });
                }
            }
            
            mutedData.set(sender, userData);
        }
    }
};