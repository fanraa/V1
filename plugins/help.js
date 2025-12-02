import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export default {
    name: "help_command",
    version: "2.0-COMPLETE",
    cmd: ['help', 'faq', 'guide', 'menu'],
    type: 'command',

    run: async (ctx) => {
        const { user, pushName, reply } = ctx;
        
        // Cek Status User (VIP/Owner atau Biasa)
        const isOwner = ctx.isOwner(ctx.sender);
        const isPremium = ctx.isPremium(ctx.sender);
        const isVip = isOwner || isPremium;
        
        // Tampilan Token
        const tokenStatus = isVip ? "♾️ Unlimited (VIP)" : `${user.tokens} Tokens`;

        const helpText = `
🤖 *FanraBot Assistance Center*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👋 Hello, *${pushName}*! 
I am an AI assistant for this group. Here is how my system works:

💳 *YOUR PROFILE*
├ 👤 *Role:* ${user.role.toUpperCase()}
└ 🪙 *Balance:* ${tokenStatus}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 *AI CHAT SYSTEM*
• *Usage:* Reply to me or say *"Fanra"* / *"Bot"*.
• *Cost:* 1 Token per reply.
• *Note:* VIPs/Owners chat for free.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *HOW TO EARN TOKENS?*
Running low? You can earn tokens for FREE!

1️⃣ *Daily Reward (Gacha)* 📅
• Type \`.daily\` once every day.
• Get random *1-20 Tokens*.
• Test your luck!

2️⃣ *Active Chatting* 💬
• Chat normally in the group.
• Send 5 messages = *+3 Tokens*.
• _(Spamming short messages won't count!)_

3️⃣ *Welcome New Members* 👋
• When someone joins, tag them & say "Welcome".
• Must be done within *3 minutes*.
• Reward: *+5 Tokens*.

4️⃣ *Add Friends* ➕
• Add a friend to this group manually.
• Reward: *+5 Tokens* per person.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ *FAQ*

*Q: Why is the bot silent?*
A: You might be out of tokens, or the AI is turned OFF. Check with \`.ai\`.

*Q: I chatted but got no tokens?*
A: Messages must be meaningful (not spam) to count towards the reward.

*Q: How to get Unlimited Tokens?*
A: Contact the Owner to upgrade to *Premium*.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Build with ❤️ by Fanra_
`.trim();

        return reply(helpText);
    }
};