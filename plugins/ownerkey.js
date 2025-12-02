export default {
    name: "ownerkey",
    // Command for activating and deactivating the Owner role
    cmd: ["codei47r32a6", "outcodei47r32a6"], 
    type: "command",
    priority: 1,
    
    // This plugin manages core roles internally, thus it doesn't rely 
    // on the global 'access' property for command filtering.

    run: async (ctx) => {
        const user = ctx.user;
        
        if (!user) {
            ctx.logger.error('OWNERKEY', `Failed to get user data for ID: ${ctx.senderNumber}`);
            return ctx.reply("❌ Failed to load your user data. Please try sending a regular text message first.");
        }

        const senderJid = ctx.sender;
        const senderNum = ctx.senderNumber;
        
        // --- OWNER ACTIVATION LOGIC (.codei47r32a6) ---
        if (ctx.command === "codei47r32a6") {
            
            // Check if user is already the Owner
            if (user.role === 'owner') {
                return ctx.reply("👑 You are already registered as the Bot Owner. No re-activation is needed.");
            }
            
            // Perform Activation
            user.role = 'owner';
            await ctx.saveUsers(); 

            await ctx.reply(`
🎉 *ACTIVATION SUCCESSFUL!*
Congratulations, @${senderNum}! You have been granted the **OWNER** role. 
All Owner access and features are now available to you.
            `.trim(), { mentions: [senderJid] });

            ctx.logger.info('OWNERKEY', `ACTIVATION: ${senderNum} successfully activated Owner role.`);

        // --- OWNER DEACTIVATION/DEMOTE LOGIC (.outcodei47r32a6) ---
        } else if (ctx.command === "outcodei47r32a6") {
            
            // Check Access for Demote (must be an existing Owner)
            if (user.role !== 'owner') {
                return ctx.reply("❌ This command can only be used by the *Owner* to deactivate their role.");
            }

            // Primary Owner Check (Hardcoded Owner in core/index.js)
            // The Primary Owner is prohibited from manually demoting their role.
            const isHardcodedOwner = ctx.isOwner(senderJid);

            if (isHardcodedOwner) {
                return ctx.reply("🛑 You are the *Primary Owner* (configured in the system settings). Your role cannot be manually demoted.");
            }
            
            // Perform Deactivation (Demote to member)
            user.role = 'member';
            await ctx.saveUsers(); 

            await ctx.reply(`
💤 *DEACTIVATION SUCCESSFUL!*
@${senderNum}, you have successfully released the **OWNER** role and reverted to a regular *MEMBER*. 
Your Owner access has been revoked.
            `.trim(), { mentions: [senderJid] });

            ctx.logger.info('OWNERKEY', `DEACTIVATION: ${senderNum} successfully deactivated Owner role.`);
        }
    }
};