import { tradingStorage, isValidTelegramChatId } from './tradingStorage';
import { getActionableStoredSignals } from './signalTracker';
import { ExchangeAdapterHub } from './exchangeAdapterHub';
import { formatPrice } from '../src/utils/formatters';
import { sendTelegramSignalWithChart } from './telegramService';

// Helper to check if a user is Super Admin
function isUserAdmin(user?: any): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
  return user.email && user.email.toLowerCase() === adminEmail;
}

// Resolved Bot Token getter
function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

/**
 * Sends a direct message to a specific Telegram Chat ID
 */
export async function sendDirectTelegramMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' };
  }

  if (!isValidTelegramChatId(chatId)) {
    return { success: false, error: 'INVALID_CHAT_ID' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      if (errText.includes('chat not found') || errText.includes('bot was blocked') || errText.includes('user is deactivated')) {
        tradingStorage.unlinkTelegramChat(chatId);
      }
      return { success: false, error: `Telegram HTTP ${response.status}: ${errText}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Main Controller for incoming Telegram Bot Updates & Commands.
 * Handles:
 * /start
 * /register <email> <password>
 * /login <email> <password>
 * /status
 * /signals
 * /autotrade_on
 * /autotrade_off
 * /stop_all
 */
export async function handleTelegramUpdate(update: any): Promise<{ handled: boolean; reply?: string }> {
  if (!update || (!update.message && !update.edited_message)) {
    return { handled: false };
  }

  const msg = update.message || update.edited_message;
  const chatId = String(msg.chat?.id || '');
  const rawText = (msg.text || '').trim();
  const username = msg.from?.username;
  const firstName = msg.from?.first_name;

  if (!chatId || !rawText) {
    return { handled: false };
  }

  const parts = rawText.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // 1. /start command
  if (command === '/start' || command === '/help') {
    const link = tradingStorage.getTelegramLinkByChatId(chatId);
    const user = link ? tradingStorage.getUserById(link.userId) : undefined;
    const isAdmin = isUserAdmin(user);
    const isApproved = user ? tradingStorage.isUserApproved(user.id) : false;

    let adminCommandsText = '';
    if (isAdmin) {
      adminCommandsText = 
        `\n<b>👑 Super Admin Commands:</b>\n` +
        `• <code>/pending</code> — List users awaiting approval\n` +
        `• <code>/approve &lt;userId_or_telegramId&gt;</code> — Grant access to signals & autotrade\n` +
        `• <code>/revoke &lt;userId_or_telegramId&gt;</code> — Revoke user access\n`;
    }

    let statusHeader = '';
    if (user) {
      statusHeader = `• <b>Logged in as:</b> ${user.email} (${isApproved ? '🟢 APPROVED' : '⏳ PENDING APPROVAL'})\n\n`;
    }

    const reply = 
      `<b>🌙 MoonScanner — AI Trading & Signal Intelligence Bot</b>\n\n` +
      statusHeader +
      `Welcome! MoonScanner delivers high-precision, multi-confluence trading signals and autonomous risk-managed execution.\n\n` +
      `<b>Available Commands:</b>\n` +
      `• <code>/register &lt;email&gt; &lt;password&gt;</code> — Create a MoonScanner account & link this Telegram\n` +
      `• <code>/login &lt;email&gt; &lt;password&gt;</code> — Link an existing MoonScanner account\n` +
      `• <code>/status</code> — View account balance, AutoTrade state & active positions\n` +
      `• <code>/signals</code> — View current authoritative actionable signals\n` +
      `• <code>/autotrade_on</code> — Turn ON autonomous trading for your account\n` +
      `• <code>/autotrade_off</code> — Turn OFF autonomous trading\n` +
      `• <code>/stop_all</code> — Emergency Stop: halt all auto-trading immediately\n` +
      adminCommandsText +
      `\n<i>Note: Only authoritative actionable signals meeting institutional confluence are dispatched. 0 signals means the scanner is waiting for high conviction.</i>`;

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 2. /register <email> <password>
  if (command === '/register') {
    if (args.length < 2) {
      const reply = `⚠️ <b>Usage:</b> <code>/register &lt;email&gt; &lt;password&gt;</code>\nPassword must be at least 6 characters.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const email = args[0].toLowerCase();
    const password = args.slice(1).join(' ');

    if (!email.includes('@') || password.length < 6) {
      const reply = `❌ Invalid input. Please provide a valid email and a password of at least 6 characters.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const existingUser = tradingStorage.getUserByEmail(email);
    if (existingUser) {
      const reply = `⚠️ Account already exists for <b>${email}</b>. Use <code>/login ${email} &lt;password&gt;</code> instead.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    try {
      const newUser = tradingStorage.createUser(email, password);
      tradingStorage.linkTelegramChat(chatId, newUser.id, { username, firstName });

      let reply = '';
      if (newUser.isApproved) {
        reply = 
          `👑 <b>Super Admin Account Registered & Approved!</b>\n\n` +
          `• <b>Account:</b> ${newUser.email}\n` +
          `• <b>Role:</b> SUPER ADMIN\n` +
          `• <b>Telegram ID:</b> ${chatId}\n` +
          `• <b>Signal Notifications:</b> ENABLED\n` +
          `• <b>Trading Mode:</b> PAPER ($10,000 balance)\n\n` +
          `You have full access to signals, AutoTrade, and approval commands (<code>/pending</code>, <code>/approve</code>, <code>/revoke</code>).`;
      } else {
        reply = 
          `⏳ <b>Account Created — PENDING SUPER ADMIN APPROVAL</b>\n\n` +
          `• <b>Account:</b> ${newUser.email}\n` +
          `• <b>Telegram ID:</b> ${chatId}\n` +
          `• <b>Status:</b> PENDING APPROVAL\n\n` +
          `Your registration has been submitted. For risk management and security, signals and AutoTrade are reserved for approved accounts.\n` +
          `You will receive an automated notification as soon as the Super Admin approves your access.`;
      }

      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    } catch (e: any) {
      const reply = `❌ Registration failed: ${e.message}`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }
  }

  // 3. /login <email> <password>
  if (command === '/login') {
    if (args.length < 2) {
      const reply = `⚠️ <b>Usage:</b> <code>/login &lt;email&gt; &lt;password&gt;</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const email = args[0].toLowerCase();
    const password = args.slice(1).join(' ');

    const user = tradingStorage.getUserByEmail(email);
    if (!user) {
      const reply = `❌ Invalid email or password. No account found for <b>${email}</b>.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const valid = tradingStorage.verifyPassword(password, user.salt, user.passwordHash);
    if (!valid) {
      const reply = `❌ Invalid credentials. Please verify your password.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    tradingStorage.linkTelegramChat(chatId, user.id, { username, firstName });
    const settings = tradingStorage.getUserSettings(user.id);
    const isAuto = settings.autoTradingEnabled || settings.autonomousTradingEnabled;
    const isApproved = tradingStorage.isUserApproved(user.id);

    const reply = 
      `✅ <b>Login Successful!</b>\n\n` +
      `Telegram is now linked to MoonScanner account: <b>${user.email}</b>\n` +
      `• <b>Access Status:</b> ${isApproved ? '🟢 APPROVED' : '⏳ PENDING APPROVAL'}\n` +
      `• <b>Trading Mode:</b> ${settings.tradingMode}\n` +
      `• <b>AutoTrade:</b> ${isAuto ? '🟢 ON' : '⚪ OFF'}\n` +
      `• <b>Emergency Stop:</b> ${settings.emergencyStop ? '🔴 ACTIVE' : '🟢 CLEARED'}\n\n` +
      (isApproved 
        ? `Use <code>/status</code> to view balances and open positions.` 
        : `⚠️ <i>Your account is awaiting Super Admin approval before signals or AutoTrade can be activated.</i>`);

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // Check auth for all subsequent account commands
  const link = tradingStorage.getTelegramLinkByChatId(chatId);
  const user = link ? tradingStorage.getUserById(link.userId) : undefined;

  if (!link || !user) {
    if (['/status', '/autotrade_on', '/autotrade_off', '/stop_all', '/pending', '/approve', '/revoke'].includes(command)) {
      const reply = 
        `🔒 <b>Authentication Required</b>\n\n` +
        `This command requires an authorized MoonScanner account.\n` +
        `Please log in using:\n<code>/login &lt;email&gt; &lt;password&gt;</code>\n\n` +
        `Or create a new account using:\n<code>/register &lt;email&gt; &lt;password&gt;</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }
  }

  // 4. /status command
  if (command === '/status') {
    if (!user) return { handled: false };
    const settings = tradingStorage.getUserSettings(user.id);
    const positions = tradingStorage.getOpenPositions(user.id);
    const todayLoss = tradingStorage.getTodayRealizedLoss(user.id);
    const todayPnL = tradingStorage.getTodayRealizedPnL(user.id);
    const isPaper = settings.tradingMode === 'PAPER' || settings.tradingMode === 'DISABLED';
    const isAuto = (settings.autoTradingEnabled || settings.autonomousTradingEnabled) && !settings.emergencyStop;
    const isApproved = tradingStorage.isUserApproved(user.id);

    let balanceInfo = `• <b>Paper Balance:</b> $${settings.paperBalanceUsd.toFixed(2)}`;
    let exchangeInfo = `• <b>Exchange:</b> None (Paper Trading)`;

    if (!isPaper) {
      const creds = tradingStorage.getDecryptedExchangeCredentials(user.id);
      if (creds) {
        try {
          const bal = await ExchangeAdapterHub.getAccountBalance(creds);
          balanceInfo = `• <b>Live Equity:</b> $${bal.totalEquity.toFixed(2)} | <b>Available:</b> $${bal.availableBalance.toFixed(2)}`;
          exchangeInfo = `• <b>Exchange:</b> ${creds.exchange.toUpperCase()} (Connected)`;
        } catch (e: any) {
          balanceInfo = `• <b>Live Balance:</b> Connection error (${e.message})`;
          exchangeInfo = `• <b>Exchange:</b> ${creds.exchange.toUpperCase()} (Connection degraded)`;
        }
      } else {
        exchangeInfo = `• <b>Exchange:</b> Disconnected (No API keys)`;
        balanceInfo = `• <b>Live Balance:</b> Unconfigured`;
      }
    }

    let positionsText = '• <b>Open Positions:</b> None';
    if (positions.length > 0) {
      positionsText = `• <b>Open Positions (${positions.length}):</b>\n` + positions.map(p => 
        `   ▫️ <b>${p.symbol}</b> ${p.direction} (${p.leverage}x) | Entry: $${formatPrice(p.entryPrice)} | PnL: $${(p.unrealizedPnL || 0).toFixed(2)} (${p.unrealizedPnLPct || 0}%)`
      ).join('\n');
    }

    const reply = 
      `📊 <b>MoonScanner Account Status</b>\n\n` +
      `• <b>User:</b> ${user.email}\n` +
      `• <b>Access Status:</b> ${isApproved ? '🟢 APPROVED' : '⏳ PENDING APPROVAL'}\n` +
      `• <b>Trading Mode:</b> ${settings.tradingMode}\n` +
      `• <b>AutoTrade:</b> ${isAuto ? '🟢 ACTIVE' : '⚪ OFF'}\n` +
      `• <b>Emergency Stop:</b> ${settings.emergencyStop ? '🔴 ACTIVE' : '🟢 NORMAL'}\n` +
      `${exchangeInfo}\n` +
      `${balanceInfo}\n` +
      `• <b>Today's Realized PnL:</b> $${todayPnL.toFixed(2)}\n` +
      `• <b>Today's Loss:</b> $${todayLoss.toFixed(2)} / $${settings.dailyLossLimitUsd.toFixed(2)} Limit\n\n` +
      `${positionsText}`;

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 5. /signals command
  if (command === '/signals') {
    // Only approved users can view signals
    if (user && !tradingStorage.isUserApproved(user.id)) {
      const reply = 
        `🔒 <b>Access Pending:</b> Your account (<b>${user.email}</b>) is awaiting Super Admin approval.\n\n` +
        `Only approved accounts can access real-time institutional signals. You will be notified once approved.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const actionable = getActionableStoredSignals();

    if (actionable.length === 0) {
      const reply = 
        `📡 <b>Current Actionable Signals: 0</b>\n\n` +
        `<i>Philosophy: Quality Over Quantity.</i>\n` +
        `Markets are currently either coiling or lacking strict multi-timeframe structural confluence.\n` +
        `MoonScanner strictly abstains from forcing low-conviction or filler trades.\n\n` +
        `You will be notified immediately when an institutional Grade A+/A setup establishes confluence.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    let reply = `🚀 <b>Authoritative Actionable Signals (${actionable.length})</b>\n\n`;
    for (const sig of actionable) {
      const targets = (sig.targets || []).map(t => `$${formatPrice(t.price)}`).join(', ');
      reply += 
        `• <b>${sig.symbol} [${sig.direction}]</b> — Grade ${sig.qualityGrade} (${sig.moonScore}/100)\n` +
        `   ▫️ Entry Zone: $${formatPrice(sig.entryZoneLow || sig.entryPrice)} - $${formatPrice(sig.entryZoneHigh || sig.entryPrice)}\n` +
        `   ▫️ Protective SL: $${formatPrice(sig.stopLoss)}\n` +
        `   ▫️ Targets: ${targets || `$${formatPrice(sig.tp1)}`}\n` +
        `   ▫️ Move Potential: +${(sig.majorMovePotentialPct || 30).toFixed(1)}%\n\n`;
    }

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 6. /autotrade_on
  if (command === '/autotrade_on') {
    if (!user) return { handled: false };

    // Only approved users can turn on AutoTrade
    if (!tradingStorage.isUserApproved(user.id)) {
      const reply = 
        `🔒 <b>AutoTrade Restricted:</b> Your account is awaiting Super Admin approval.\n\n` +
        `Autonomous execution requires verified Super Admin approval. Please contact the administrator.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const settings = tradingStorage.getUserSettings(user.id);
    
    // Check if live mode has credentials
    const isPaper = settings.tradingMode === 'PAPER' || settings.tradingMode === 'DISABLED';
    if (!isPaper) {
      const creds = tradingStorage.getDecryptedExchangeCredentials(user.id);
      if (!creds) {
        const reply = 
          `⚠️ <b>Cannot Enable Live AutoTrade:</b>\n` +
          `No Binance API credentials configured for your account.\n` +
          `Please configure your API keys in the MoonScanner Web Dashboard first, or switch Trading Mode to PAPER.`;
        await sendDirectTelegramMessage(chatId, reply);
        return { handled: true, reply };
      }
    }

    tradingStorage.updateUserSettings(user.id, {
      autoTradingEnabled: true,
      autonomousTradingEnabled: true,
      emergencyStop: false,
      tradingMode: settings.tradingMode === 'DISABLED' ? 'PAPER' : settings.tradingMode
    });

    const reply = 
      `🤖 <b>AutoTrade ACTIVATED</b>\n\n` +
      `• <b>Status:</b> 🟢 ACTIVE\n` +
      `• <b>Mode:</b> ${settings.tradingMode === 'DISABLED' ? 'PAPER' : settings.tradingMode}\n` +
      `• <b>Margin Per Trade:</b> $${settings.marginPerTrade || 50}\n` +
      `• <b>Leverage:</b> ${settings.leverage || 10}x\n` +
      `• <b>Max Simultaneous:</b> ${settings.maxSimultaneousTrades}\n` +
      `• <b>Risk Per Trade:</b> ${settings.riskPerTradePct}%\n` +
      `• <b>Emergency Stop:</b> CLEARED\n\n` +
      `AutoTrade will now execute when authoritative Grade A+/A signals confirm confluence. Use <code>/stop_all</code> or <code>/autotrade_off</code> to pause.`;

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 7. /autotrade_off
  if (command === '/autotrade_off') {
    if (!user) return { handled: false };
    tradingStorage.updateUserSettings(user.id, {
      autoTradingEnabled: false,
      autonomousTradingEnabled: false
    });

    const reply = 
      `⏸️ <b>AutoTrade PAUSED</b>\n\n` +
      `• <b>Status:</b> ⚪ OFF\n` +
      `• Existing open positions remain untouched and manageable.\n` +
      `• No new automated positions will be opened until re-enabled.\n` +
      `• Signal notifications will continue to be sent.`;

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 8. /stop_all (Emergency Kill Switch)
  if (command === '/stop_all') {
    if (!user) return { handled: false };
    tradingStorage.updateUserSettings(user.id, {
      emergencyStop: true,
      autoTradingEnabled: false,
      autonomousTradingEnabled: false
    });

    const reply = 
      `🛑 <b>EMERGENCY STOP ACTIVATED!</b>\n\n` +
      `• AutoTrade has been strictly halted.\n` +
      `• All new entry requests are immediately rejected.\n` +
      `• Open positions remain visible and can be closed from the web dashboard.\n\n` +
      `To resume trading later, use <code>/autotrade_on</code>.`;

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 9. /pending (Super Admin)
  if (command === '/pending') {
    if (!isUserAdmin(user)) {
      const reply = `⛔ <b>Access Denied:</b> This command requires Super Admin privileges.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const pending = tradingStorage.getPendingUsers();
    if (pending.length === 0) {
      const reply = `✅ <b>No Pending Users:</b> All registered accounts are currently approved.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    let reply = `📋 <b>Users Awaiting Super Admin Approval (${pending.length}):</b>\n\n`;
    for (const u of pending) {
      const link = tradingStorage.getTelegramLinkByUserId(u.id);
      reply += 
        `• <b>Email:</b> ${u.email}\n` +
        `  ID: <code>${u.id}</code>\n` +
        `  Telegram: ${link ? `<code>${link.chatId}</code> (@${link.telegramUsername || 'unknown'})` : 'Not linked'}\n` +
        `  👉 Approve: <code>/approve ${u.id}</code>\n\n`;
    }

    await sendDirectTelegramMessage(chatId, reply);
    return { handled: true, reply };
  }

  // 10. /approve <userId_or_telegramId> (Super Admin)
  if (command === '/approve') {
    if (!isUserAdmin(user)) {
      const reply = `⛔ <b>Access Denied:</b> This command requires Super Admin privileges.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    if (args.length < 1) {
      const reply = `⚠️ <b>Usage:</b> <code>/approve &lt;userId_or_telegramId&gt;</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const target = args[0];
    const approvedUser = tradingStorage.approveUser(target);
    if (!approvedUser) {
      const reply = `❌ <b>User Not Found:</b> No user matching ID or Telegram: <code>${target}</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const reply = 
      `✅ <b>User Approved!</b>\n\n` +
      `• <b>Account:</b> ${approvedUser.email}\n` +
      `• <b>ID:</b> <code>${approvedUser.id}</code>\n` +
      `• <b>Role:</b> ${approvedUser.role}\n` +
      `• <b>Status:</b> ACTIVE & APPROVED\n\n` +
      `User is now authorized to receive signals and run AutoTrade.`;
    await sendDirectTelegramMessage(chatId, reply);

    // Notify approved user on Telegram if linked
    const targetLink = tradingStorage.getTelegramLinkByUserId(approvedUser.id);
    if (targetLink && targetLink.chatId !== chatId) {
      await sendDirectTelegramMessage(
        targetLink.chatId,
        `🎉 <b>Access Approved!</b>\n\n` +
        `Your MoonScanner account (<b>${approvedUser.email}</b>) has been approved by the Super Admin!\n\n` +
        `You are now authorized to receive real-time institutional signals and activate AutoTrade.`
      );
    }

    return { handled: true, reply };
  }

  // 11. /revoke <userId_or_telegramId> (Super Admin)
  if (command === '/revoke') {
    if (!isUserAdmin(user)) {
      const reply = `⛔ <b>Access Denied:</b> This command requires Super Admin privileges.`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    if (args.length < 1) {
      const reply = `⚠️ <b>Usage:</b> <code>/revoke &lt;userId_or_telegramId&gt;</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const target = args[0];
    const revokedUser = tradingStorage.revokeUser(target);
    if (!revokedUser) {
      const reply = `❌ <b>User Not Found:</b> No user matching ID or Telegram: <code>${target}</code>`;
      await sendDirectTelegramMessage(chatId, reply);
      return { handled: true, reply };
    }

    const reply = 
      `⛔ <b>User Access Revoked!</b>\n\n` +
      `• <b>Account:</b> ${revokedUser.email}\n` +
      `• <b>ID:</b> <code>${revokedUser.id}</code>\n` +
      `• <b>Status:</b> REVOKED\n\n` +
      `User signals and AutoTrade have been disabled.`;
    await sendDirectTelegramMessage(chatId, reply);

    // Notify revoked user on Telegram if linked
    const targetLink = tradingStorage.getTelegramLinkByUserId(revokedUser.id);
    if (targetLink && targetLink.chatId !== chatId) {
      await sendDirectTelegramMessage(
        targetLink.chatId,
        `⚠️ <b>Access Revoked</b>\n\n` +
        `Your MoonScanner account access has been revoked by the Super Admin. AutoTrade and signals have been paused.`
      );
    }

    return { handled: true, reply };
  }

  return { handled: false };
}

// Background long-polling state
let isPollingActive = false;
let pollingAbortController: AbortController | null = null;
let lastUpdateOffset = 0;

/**
 * Starts background long-polling for incoming Telegram Bot commands.
 * Runs safely in background without blocking the Node event loop.
 */
export function startTelegramBotPolling(): void {
  const token = getTelegramBotToken();
  if (!token) {
    console.log('[Telegram Bot Polling] No TELEGRAM_BOT_TOKEN configured. Polling inactive.');
    return;
  }

  if (isPollingActive) {
    return;
  }

  isPollingActive = true;
  pollingAbortController = new AbortController();

  console.log('[Telegram Bot Polling] Starting multi-user bot polling loop...');

  (async () => {
    while (isPollingActive) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset}&timeout=15`;
        const res = await fetch(url, { signal: pollingAbortController?.signal });

        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              lastUpdateOffset = Math.max(lastUpdateOffset, update.update_id + 1);
              try {
                await handleTelegramUpdate(update);
              } catch (updateErr: any) {
                console.warn('[Telegram Bot Update Handler] Error:', updateErr.message);
              }
            }
          }
        } else {
          // If conflict or error, wait 5 seconds before retrying
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || !isPollingActive) {
          break;
        }
        // Connection timeout or network error, wait 3 seconds and retry
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
}

export function stopTelegramBotPolling(): void {
  isPollingActive = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
  console.log('[Telegram Bot Polling] Bot polling loop stopped.');
}

/**
 * Dispatches an actionable signal with candlestick chart snapshot to all APPROVED Telegram subscribers.
 */
export async function dispatchSignalToApprovedTelegramUsers(
  signal: any
): Promise<{ sentCount: number; errors: number }> {
  const subscribers = tradingStorage.getAllTelegramSubscribers();
  const token = getTelegramBotToken();
  if (!token || subscribers.length === 0) {
    return { sentCount: 0, errors: 0 };
  }

  let sentCount = 0;
  let errors = 0;

  for (const sub of subscribers) {
    try {
      const user = tradingStorage.getUserById(sub.userId);
      // Strictly enforce: Only approved users receive signals
      if (!user || !tradingStorage.isUserApproved(user.id)) {
        continue;
      }

      // Check delivery deduplication
      const fingerprint = `${signal.symbol}_${signal.direction}_${signal.entryPrice}`;
      if (tradingStorage.hasUserReceivedSignal(sub.chatId, fingerprint)) {
        continue;
      }

      const res = await sendTelegramSignalWithChart(signal, {
        botToken: token,
        chatId: sub.chatId
      });

      if (res.success) {
        tradingStorage.recordTelegramDeliveryForUser(sub.chatId, fingerprint);
        sentCount++;
      } else {
        errors++;
      }
    } catch (subErr) {
      errors++;
    }
  }

  return { sentCount, errors };
}
