import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  isApproved: boolean;
  role: 'ADMIN' | 'USER';
  telegramChatId?: string;
  telegramUsername?: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface EncryptedCredentials {
  encryptedKey: string;
  encryptedSecret: string;
  iv: string;
  authTag: string;
  keyMasked: string;
  testnet: boolean;
  lastValidatedAt?: number;
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_CREDENTIALS' | 'INVALID_PERMISSIONS';
  lastErrorMessage?: string;
}

export type StoredSupportedExchange = 'binance' | 'bybit' | 'okx' | 'mexc' | 'bitget' | 'bitunix';

export interface EncryptedExchangeCredentials {
  exchange: StoredSupportedExchange;
  encryptedKey: string;
  encryptedSecret: string;
  encryptedPassphrase?: string;
  iv: string;
  authTag: string;
  keyMasked: string;
  accountLabel?: string;
  testnet: boolean;
  lastValidatedAt?: number;
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_PERMISSIONS';
  lastErrorMessage?: string;
}

export interface TradeRejectionRecord {
  id: string;
  userId: string;
  symbol: string;
  signalId: string;
  reason: string;
  rejectionCode: string;
  timestamp: number;
  details?: Record<string, any>;
}

export interface StoredExecutionAudit {
  id: string;
  userId: string;
  exchange: string;
  symbol: string;
  signalId: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  tpTargets: number[];
  orderId?: string;
  executionStatus: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED' | 'EMERGENCY_LIQUIDATED';
  rejectionReason?: string;
  timestamp: number;
}

export interface StoredTradingSettings {
  userId: string;
  tradingMode: 'DISABLED' | 'PAPER' | 'MANUAL' | 'SEMI-AUTO' | 'FULL-AUTO';
  autonomousTradingEnabled: boolean;
  autoTradingEnabled?: boolean;
  emergencyStop: boolean;
  marginType: 'CROSS' | 'ISOLATED' | 'CROSSED';
  capitalAllocationPct: number;
  riskPerTradePct: number;
  maxSimultaneousTrades: number;
  maxLeverage: number;
  minSignalScore: number;
  dailyLossLimitUsd: number;
  tpPartialClosePct: number;
  cooldownMinutes: number;
  paperBalanceUsd: number;
  marginPerTrade?: number;
  leverage?: number;
  activeExchange?: StoredSupportedExchange;
  exchangeCredentials?: Record<string, EncryptedExchangeCredentials>;
  allowedSources?: {
    preMove: boolean;
    news: boolean;
    newListing: boolean;
    top5: boolean;
  };
  minQualityThreshold?: 'A+' | 'A' | 'B';
  minMovePotentialPct?: number;
  slippageLimitPct?: number;
  binanceCredentials?: EncryptedCredentials;
}

export interface StoredPosition {
  id: string;
  userId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  marginType: 'CROSS' | 'ISOLATED' | 'CROSSED';
  stopLoss: number;
  originalStopLoss: number;
  highestPriceReached: number;
  lowestPriceReached: number;
  tpTargets: Array<{
    index: number;
    price: number;
    rMultiple: number;
    hit: boolean;
    closedQty: number;
  }>;
  currentTpStep: number;
  realizedPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  status: 'OPEN' | 'CLOSED';
  isPaper: boolean;
  slOrderId?: string;
  tpOrderId?: string;
  trailedToBreakEven?: boolean;
  trailingRunner?: boolean;
  trailingRunnerActive?: boolean;
  breakEvenPrice?: number;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
  closeReason?: string;
}

export interface StoredTradeRecord {
  id: string;
  userId: string;
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  realizedPnL: number;
  realizedPnLPct: number;
  exitReason: string;
  isPaper: boolean;
  openedAt: number;
  closedAt: number;
}

export interface StoredTelegramLink {
  chatId: string;
  userId: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  notificationsEnabled: boolean;
  linkedAt: number;
  deliveredFingerprints: string[];
}

interface TradingDatabaseSchema {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
  settings: Record<string, StoredTradingSettings>;
  positions: Record<string, StoredPosition[]>;
  trades: Record<string, StoredTradeRecord[]>;
  dailyLosses: Record<string, Record<string, number>>; // userId -> YYYY-MM-DD -> total loss
  rejections: Record<string, TradeRejectionRecord[]>; // userId -> rejection audit records
  executionAudits: Record<string, StoredExecutionAudit[]>; // userId -> execution audit records
  telegramLinks: Record<string, StoredTelegramLink>; // chatId -> StoredTelegramLink
}

/**
 * Master encryption key resolution for AES-256-GCM credential security.
 * STRICT SECURITY INVARIANT:
 * - Must use configured TRADING_SECRET (or TRADING_SECRET_KEY)
 * - Fails closed with clear error if missing or invalid
 * - Zero hardcoded or default secret fallback allowed
 */
function getDerivedKey(): Buffer {
  const secret = process.env.TRADING_SECRET || process.env.TRADING_SECRET_KEY;
  if (!secret || typeof secret !== 'string' || secret.trim().length < 16) {
    throw new Error(
      'SECURITY CONFIGURATION ERROR: TRADING_SECRET environment variable is missing or invalid (must be at least 16 characters). ' +
      'AES-256-GCM credential encryption requires TRADING_SECRET to be configured in environment settings.'
    );
  }
  return crypto.scryptSync(secret.trim(), 'moonscanner-trading-salt-v2', 32);
}

// Database path
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'trading_db.json');

/**
 * Strict validator for real Telegram Chat IDs:
 * - Numeric ID: positive integer (direct chat user ID) or negative integer (group/channel ID)
 * - Public channel/group username: starts with @ followed by 5+ alphanumeric characters / underscores
 * - Disallows test / mock / synthetic IDs like "CHAT_A_123", "TG_AUTH_...", "TEST_DEDUP_CHAT", "USER_FAILING_CHAT"
 */
export function isValidTelegramChatId(chatId: string | number | undefined | null): boolean {
  if (!chatId) return false;
  const str = String(chatId).trim();
  if (!str) return false;
  // Numeric: positive or negative integer (e.g. "6225543480", "-1001234567890")
  if (/^-?\d+$/.test(str)) return true;
  // Username: @ followed by 5+ chars
  if (/^@[a-zA-Z0-9_]{5,}$/.test(str)) return true;
  return false;
}

class TradingStorageManager {
  private db: TradingDatabaseSchema = {
    users: {},
    sessions: {},
    settings: {},
    positions: {},
    trades: {},
    dailyLosses: {},
    rejections: {},
    executionAudits: {},
    telegramLinks: {}
  };

  private isLoaded = false;

  constructor() {
    this.initDatabase();
  }

  private initDatabase(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.db = {
          users: parsed.users || {},
          sessions: parsed.sessions || {},
          settings: parsed.settings || {},
          positions: parsed.positions || {},
          trades: parsed.trades || {},
          dailyLosses: parsed.dailyLosses || {},
          rejections: parsed.rejections || {},
          executionAudits: parsed.executionAudits || {},
          telegramLinks: parsed.telegramLinks || {}
        };
      } else {
        this.persist();
      }
      this.isLoaded = true;
    } catch (e) {
      console.error('[TradingStorage] Database initialization error:', e);
      this.isLoaded = true;
    }
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error('[TradingStorage] Persist error:', e);
    }
  }

  // Cryptographic utilities
  public hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, s, 64).toString('hex');
    return { hash, salt: s };
  }

  public verifyPassword(password: string, salt: string, expectedHash: string): boolean {
    const { hash } = this.hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  }

  public encryptSecret(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const derivedKey = getDerivedKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  public decryptSecret(encrypted: string, ivHex: string, authTagHex: string): string {
    const derivedKey = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // User Authentication
  public createUser(email: string, password: string):StoredUser {
    const normalizedEmail = email.trim().toLowerCase();
    // Check duplicate
    for (const u of Object.values(this.db.users)) {
      if (u.email.toLowerCase() === normalizedEmail) {
        throw new Error('User already exists with this email.');
      }
    }

    const id = crypto.randomUUID();
    const { hash, salt } = this.hashPassword(password);
    
    // Approval policy: First registered user or sabbirmoon969@gmail.com or ADMIN_EMAIL is approved Super Admin
    const userCount = Object.keys(this.db.users).length;
    const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
    const isSuperAdmin = userCount === 0 || normalizedEmail === adminEmail || normalizedEmail === 'sabbirmoon969@gmail.com';
    const isApproved = isSuperAdmin;
    const role: 'ADMIN' | 'USER' = isSuperAdmin ? 'ADMIN' : 'USER';

    const user: StoredUser = {
      id,
      email: normalizedEmail,
      passwordHash: hash,
      salt,
      createdAt: Date.now(),
      isApproved,
      role
    };

    this.db.users[id] = user;
    
    // Seed default settings for user
    this.db.settings[id] = {
      userId: id,
      tradingMode: 'DISABLED',
      autonomousTradingEnabled: false,
      emergencyStop: false,
      marginType: 'CROSS',
      capitalAllocationPct: 20,
      riskPerTradePct: 1,
      maxSimultaneousTrades: 3,
      maxLeverage: 20,
      leverage: 20,
      marginPerTrade: 50,
      minSignalScore: 75,
      dailyLossLimitUsd: 100,
      tpPartialClosePct: 10,
      cooldownMinutes: 15,
      paperBalanceUsd: 10000
    };

    this.db.positions[id] = [];
    this.db.trades[id] = [];
    this.db.dailyLosses[id] = {};

    this.persist();
    return user;
  }

  public getAllUsers(): StoredUser[] {
    return Object.values(this.db.users);
  }

  public getPendingUsers(): StoredUser[] {
    return Object.values(this.db.users).filter(u => !u.isApproved);
  }

  public isUserApproved(userId: string): boolean {
    const user = this.db.users[userId];
    if (!user) return false;
    if (user.isApproved === undefined) {
      const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
      return user.role === 'ADMIN' || user.email.toLowerCase() === adminEmail;
    }
    return user.isApproved;
  }

  public approveUser(identifier: string): StoredUser | null {
    const trimmed = identifier.trim();
    let user = this.db.users[trimmed];
    if (!user) {
      const link = this.getTelegramLinkByChatId(trimmed);
      if (link && this.db.users[link.userId]) {
        user = this.db.users[link.userId];
      }
    }
    if (!user) {
      user = this.getUserByEmail(trimmed) || undefined as any;
    }
    if (!user) return null;

    user.isApproved = true;
    this.persist();
    return user;
  }

  public revokeUser(identifier: string): StoredUser | null {
    const trimmed = identifier.trim();
    let user = this.db.users[trimmed];
    if (!user) {
      const link = this.getTelegramLinkByChatId(trimmed);
      if (link && this.db.users[link.userId]) {
        user = this.db.users[link.userId];
      }
    }
    if (!user) {
      user = this.getUserByEmail(trimmed) || undefined as any;
    }
    if (!user) return null;

    user.isApproved = false;
    const settings = this.db.settings[user.id];
    if (settings) {
      settings.autonomousTradingEnabled = false;
      settings.autoTradingEnabled = false;
    }
    this.persist();
    return user;
  }

  public getUserByEmail(email: string): StoredUser | null {
    const normalized = email.trim().toLowerCase();
    for (const u of Object.values(this.db.users)) {
      if (u.email.toLowerCase() === normalized) {
        return u;
      }
    }
    return null;
  }

  public getUserById(id: string): StoredUser | null {
    return this.db.users[id] || null;
  }

  public createSession(userId: string): StoredSession {
    // 30 days session expiry
    const token = crypto.randomBytes(32).toString('hex');
    const session: StoredSession = {
      token,
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    };
    this.db.sessions[token] = session;
    this.persist();
    return session;
  }

  public getSession(token: string): StoredSession | null {
    const session = this.db.sessions[token];
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      delete this.db.sessions[token];
      this.persist();
      return null;
    }
    return session;
  }

  public deleteSession(token: string): void {
    if (this.db.sessions[token]) {
      delete this.db.sessions[token];
      this.persist();
    }
  }

  // User Trading Settings
  public getUserSettings(userId: string): StoredTradingSettings {
    if (!this.db.settings[userId]) {
      this.db.settings[userId] = {
        userId,
        tradingMode: 'DISABLED',
        autonomousTradingEnabled: false,
        autoTradingEnabled: false,
        emergencyStop: false,
        marginType: 'CROSS',
        capitalAllocationPct: 20,
        riskPerTradePct: 1,
        maxSimultaneousTrades: 3,
        maxLeverage: 5,
        minSignalScore: 75,
        dailyLossLimitUsd: 100,
        tpPartialClosePct: 10,
        cooldownMinutes: 15,
        paperBalanceUsd: 10000,
        activeExchange: 'binance',
        exchangeCredentials: {},
        allowedSources: {
          preMove: true,
          news: true,
          newListing: true,
          top5: true
        },
        minQualityThreshold: 'A',
        minMovePotentialPct: 30,
        slippageLimitPct: 0.8
      };
      this.persist();
    } else {
      // Ensure defaults for backwards compatibility
      const s = this.db.settings[userId];
      if (!s.allowedSources) {
        s.allowedSources = { preMove: true, news: true, newListing: true, top5: true };
      }
      if (!s.minQualityThreshold) s.minQualityThreshold = 'A';
      if (s.minMovePotentialPct === undefined) s.minMovePotentialPct = 30;
      if (s.slippageLimitPct === undefined) s.slippageLimitPct = 0.8;
      if (!s.activeExchange) s.activeExchange = 'binance';
      if (!s.exchangeCredentials) s.exchangeCredentials = {};
      if (s.autoTradingEnabled === undefined) s.autoTradingEnabled = s.autonomousTradingEnabled || false;
    }
    return this.db.settings[userId];
  }

  public updateUserSettings(userId: string, updates: Partial<StoredTradingSettings>): StoredTradingSettings {
    const current = this.getUserSettings(userId);
    const safeUpdates = { ...updates };

    if (updates.marginType) {
      const m = String(updates.marginType).toUpperCase();
      safeUpdates.marginType = m === 'ISOLATED' ? 'ISOLATED' : (m === 'CROSSED' ? 'CROSSED' : 'CROSS');
    }
    
    // Invariant: Never allow overwriting credentials directly through generic settings update
    delete safeUpdates.binanceCredentials;
    delete safeUpdates.exchangeCredentials;

    this.db.settings[userId] = {
      ...current,
      ...safeUpdates,
      userId
    };
    this.persist();
    return this.db.settings[userId];
  }

  // Multi-Exchange Credentials Management
  public setExchangeCredentials(
    userId: string,
    exchange: StoredSupportedExchange,
    apiKey: string,
    apiSecret: string,
    passphrase?: string,
    accountLabel?: string,
    testnet: boolean = false
  ): void {
    const settings = this.getUserSettings(userId);
    if (!settings.exchangeCredentials) settings.exchangeCredentials = {};

    const encKey = this.encryptSecret(apiKey.trim());
    const encSecret = this.encryptSecret(apiSecret.trim());
    let encPassphrase: { encrypted: string; iv: string; authTag: string } | undefined;
    if (passphrase) {
      encPassphrase = this.encryptSecret(passphrase.trim());
    }

    const cleanKey = apiKey.trim();
    const masked = cleanKey.length > 8
      ? `${cleanKey.slice(0, 4)}****${cleanKey.slice(-4)}`
      : '****';

    const ivCombined = encPassphrase
      ? `${encKey.iv}::${encSecret.iv}::${encPassphrase.iv}`
      : `${encKey.iv}::${encSecret.iv}`;

    const tagCombined = encPassphrase
      ? `${encKey.authTag}::${encSecret.authTag}::${encPassphrase.authTag}`
      : `${encKey.authTag}::${encSecret.authTag}`;

    settings.exchangeCredentials[exchange] = {
      exchange,
      encryptedKey: encKey.encrypted,
      encryptedSecret: encSecret.encrypted,
      encryptedPassphrase: encPassphrase?.encrypted,
      iv: ivCombined,
      authTag: tagCombined,
      keyMasked: masked,
      accountLabel: accountLabel?.trim() || undefined,
      testnet,
      connectionStatus: 'CONNECTED',
      lastValidatedAt: Date.now()
    };

    // If Binance, also mirror into binanceCredentials for backwards compatibility
    if (exchange === 'binance') {
      settings.binanceCredentials = {
        encryptedKey: encKey.encrypted,
        encryptedSecret: encSecret.encrypted,
        iv: `${encKey.iv}::${encSecret.iv}`,
        authTag: `${encKey.authTag}::${encSecret.authTag}`,
        keyMasked: masked,
        testnet,
        connectionStatus: 'CONNECTED',
        lastValidatedAt: Date.now()
      };
    }

    this.persist();
  }

  public getDecryptedExchangeCredentials(
    userId: string,
    exchange?: StoredSupportedExchange
  ): {
    exchange: StoredSupportedExchange;
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    accountLabel?: string;
    testnet: boolean;
  } | null {
    const settings = this.getUserSettings(userId);
    const targetExchange = exchange || settings.activeExchange || 'binance';

    const creds = settings.exchangeCredentials?.[targetExchange];
    if (creds && creds.encryptedKey && creds.encryptedSecret) {
      try {
        const ivParts = creds.iv.split('::');
        const tagParts = creds.authTag.split('::');
        const apiKey = this.decryptSecret(creds.encryptedKey, ivParts[0], tagParts[0]);
        const apiSecret = this.decryptSecret(creds.encryptedSecret, ivParts[1], tagParts[1]);
        let passphrase: string | undefined;
        if (creds.encryptedPassphrase && ivParts[2] && tagParts[2]) {
          passphrase = this.decryptSecret(creds.encryptedPassphrase, ivParts[2], tagParts[2]);
        }
        return {
          exchange: targetExchange,
          apiKey,
          apiSecret,
          passphrase,
          accountLabel: creds.accountLabel,
          testnet: !!creds.testnet
        };
      } catch (e) {
        console.error(`[TradingStorage] Decryption error for ${targetExchange}, user:`, userId, e);
        return null;
      }
    }

    // Fallback to legacy binanceCredentials if targeting binance
    if (targetExchange === 'binance' && settings.binanceCredentials) {
      const bCreds = this.getDecryptedBinanceCredentials(userId);
      if (bCreds) {
        return {
          exchange: 'binance',
          apiKey: bCreds.apiKey,
          apiSecret: bCreds.apiSecret,
          testnet: bCreds.testnet
        };
      }
    }

    return null;
  }

  public removeExchangeCredentials(userId: string, exchange: StoredSupportedExchange): void {
    const settings = this.getUserSettings(userId);
    if (settings.exchangeCredentials && settings.exchangeCredentials[exchange]) {
      delete settings.exchangeCredentials[exchange];
    }
    if (exchange === 'binance') {
      delete settings.binanceCredentials;
    }
    this.persist();
  }

  public updateExchangeStatus(
    userId: string,
    exchange: StoredSupportedExchange,
    status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_PERMISSIONS',
    errorMessage?: string
  ): void {
    const settings = this.getUserSettings(userId);
    if (!settings.exchangeCredentials) {
      settings.exchangeCredentials = {};
    }
    if (!settings.exchangeCredentials[exchange]) {
      settings.exchangeCredentials[exchange] = {
        exchange,
        encryptedKey: '',
        encryptedSecret: '',
        iv: '',
        authTag: '',
        keyMasked: '',
        testnet: false,
        connectionStatus: status,
        lastErrorMessage: errorMessage,
        lastValidatedAt: Date.now()
      };
    } else {
      settings.exchangeCredentials[exchange].connectionStatus = status;
      settings.exchangeCredentials[exchange].lastErrorMessage = errorMessage;
      settings.exchangeCredentials[exchange].lastValidatedAt = Date.now();
    }
    if (exchange === 'binance') {
      if (!settings.binanceCredentials) {
        settings.binanceCredentials = {
          encryptedKey: '',
          encryptedSecret: '',
          iv: '',
          authTag: '',
          keyMasked: '',
          testnet: false,
          connectionStatus: status,
          lastErrorMessage: errorMessage,
          lastValidatedAt: Date.now()
        };
      } else {
        settings.binanceCredentials.connectionStatus = status;
        settings.binanceCredentials.lastErrorMessage = errorMessage;
        settings.binanceCredentials.lastValidatedAt = Date.now();
      }
    }
    this.persist();
  }

  public getUserExchangeConnections(userId: string): Record<string, {
    exchange: StoredSupportedExchange;
    isConfigured: boolean;
    apiKeyMasked: string;
    accountLabel?: string;
    connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_PERMISSIONS';
    lastValidatedAt?: number;
    lastErrorMessage?: string;
    testnet: boolean;
  }> {
    const settings = this.getUserSettings(userId);
    const result: Record<string, any> = {};
    if (settings.exchangeCredentials) {
      for (const [ex, cred] of Object.entries(settings.exchangeCredentials)) {
        result[ex] = {
          exchange: cred.exchange,
          isConfigured: cred.connectionStatus === 'CONNECTED' || Boolean(cred.keyMasked),
          apiKeyMasked: cred.keyMasked,
          accountLabel: cred.accountLabel,
          connectionStatus: cred.connectionStatus,
          lastValidatedAt: cred.lastValidatedAt,
          lastErrorMessage: cred.lastErrorMessage,
          testnet: cred.testnet
        };
      }
    }
    if (settings.binanceCredentials && !result.binance) {
      result.binance = {
        exchange: 'binance',
        isConfigured: settings.binanceCredentials.connectionStatus === 'CONNECTED' || Boolean(settings.binanceCredentials.keyMasked),
        apiKeyMasked: settings.binanceCredentials.keyMasked,
        accountLabel: 'Binance',
        connectionStatus: settings.binanceCredentials.connectionStatus,
        lastValidatedAt: settings.binanceCredentials.lastValidatedAt,
        lastErrorMessage: settings.binanceCredentials.lastErrorMessage,
        testnet: settings.binanceCredentials.testnet
      };
    }
    return result;
  }

  // User Binance Credentials (Backwards-compatibility wrappers)
  public setBinanceCredentials(
    userId: string,
    apiKey: string,
    apiSecret: string,
    testnet: boolean = false
  ): void {
    this.setExchangeCredentials(userId, 'binance', apiKey, apiSecret, undefined, undefined, testnet);
  }

  public getDecryptedBinanceCredentials(userId: string): { apiKey: string; apiSecret: string; testnet: boolean } | null {
    const res = this.getDecryptedExchangeCredentials(userId, 'binance');
    if (!res) return null;
    return { apiKey: res.apiKey, apiSecret: res.apiSecret, testnet: res.testnet };
  }

  public removeBinanceCredentials(userId: string): void {
    this.removeExchangeCredentials(userId, 'binance');
  }

  public updateBinanceStatus(
    userId: string,
    status: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_CREDENTIALS' | 'INVALID_PERMISSIONS',
    errorMessage?: string
  ): void {
    this.updateExchangeStatus(userId, 'binance', status as any, errorMessage);
  }

  // Trade Rejection Audit Logging
  public recordTradeRejection(
    userId: string,
    rejection: {
      symbol: string;
      signalId: string;
      reason: string;
      rejectionCode: string;
      details?: Record<string, any>;
    }
  ): TradeRejectionRecord {
    if (!this.db.rejections[userId]) {
      this.db.rejections[userId] = [];
    }

    const record: TradeRejectionRecord = {
      id: crypto.randomUUID(),
      userId,
      symbol: rejection.symbol,
      signalId: rejection.signalId,
      reason: rejection.reason,
      rejectionCode: rejection.rejectionCode,
      timestamp: Date.now(),
      details: rejection.details
    };

    this.db.rejections[userId].unshift(record);
    if (this.db.rejections[userId].length > 100) {
      this.db.rejections[userId] = this.db.rejections[userId].slice(0, 100);
    }

    this.persist();
    return record;
  }

  public getUserRejections(userId: string): TradeRejectionRecord[] {
    return this.db.rejections[userId] || [];
  }

  // Execution Audit Logging (Requirement 15: Record every execution event)
  public recordExecutionAudit(
    userId: string,
    audit: Omit<StoredExecutionAudit, 'id' | 'timestamp' | 'userId'>
  ): StoredExecutionAudit {
    if (!this.db.executionAudits[userId]) {
      this.db.executionAudits[userId] = [];
    }

    const record: StoredExecutionAudit = {
      id: crypto.randomUUID(),
      userId,
      exchange: audit.exchange,
      symbol: audit.symbol,
      signalId: audit.signalId,
      direction: audit.direction,
      entryPrice: audit.entryPrice,
      quantity: audit.quantity,
      leverage: audit.leverage,
      stopLoss: audit.stopLoss,
      tpTargets: audit.tpTargets,
      orderId: audit.orderId,
      executionStatus: audit.executionStatus,
      rejectionReason: audit.rejectionReason,
      timestamp: Date.now()
    };

    this.db.executionAudits[userId].unshift(record);
    if (this.db.executionAudits[userId].length > 100) {
      this.db.executionAudits[userId] = this.db.executionAudits[userId].slice(0, 100);
    }

    this.persist();
    return record;
  }

  public getUserExecutionAudits(userId: string): StoredExecutionAudit[] {
    return this.db.executionAudits[userId] || [];
  }

  // User Positions
  public getUserPositions(userId: string): StoredPosition[] {
    if (!this.db.positions[userId]) {
      this.db.positions[userId] = [];
    }
    return this.db.positions[userId];
  }

  public getOpenPositions(userId: string): StoredPosition[] {
    return this.getUserPositions(userId).filter(p => p.status === 'OPEN');
  }

  public addPosition(userId: string, position: StoredPosition): void {
    if (!this.db.positions[userId]) {
      this.db.positions[userId] = [];
    }
    this.db.positions[userId].push(position);
    this.persist();
  }

  public updatePosition(userId: string, positionId: string, updates: Partial<StoredPosition>): StoredPosition | null {
    const list = this.getUserPositions(userId);
    const idx = list.findIndex(p => p.id === positionId);
    if (idx === -1) return null;

    list[idx] = {
      ...list[idx],
      ...updates,
      updatedAt: Date.now()
    };
    this.persist();
    return list[idx];
  }

  // User Trade Records
  public getUserTrades(userId: string): StoredTradeRecord[] {
    if (!this.db.trades[userId]) {
      this.db.trades[userId] = [];
    }
    return this.db.trades[userId];
  }

  public recordTrade(userId: string, trade: StoredTradeRecord): void {
    if (!this.db.trades[userId]) {
      this.db.trades[userId] = [];
    }
    this.db.trades[userId].unshift(trade);
    
    // Record in daily loss tracking if realizedPnL < 0
    if (trade.realizedPnL < 0) {
      const today = new Date().toISOString().split('T')[0];
      if (!this.db.dailyLosses[userId]) {
        this.db.dailyLosses[userId] = {};
      }
      const lossAmount = Math.abs(trade.realizedPnL);
      this.db.dailyLosses[userId][today] = (this.db.dailyLosses[userId][today] || 0) + lossAmount;
    }

    // Keep max 50 recent trades
    if (this.db.trades[userId].length > 50) {
      this.db.trades[userId] = this.db.trades[userId].slice(0, 50);
    }

    this.persist();
  }

  public getTodayRealizedLoss(userId: string): number {
    const today = new Date().toISOString().split('T')[0];
    if (!this.db.dailyLosses[userId]) return 0;
    return this.db.dailyLosses[userId][today] || 0;
  }

  public getTodayRealizedPnL(userId: string): number {
    const today = new Date().toISOString().split('T')[0];
    const trades = this.getUserTrades(userId);
    let total = 0;
    for (const t of trades) {
      const tDate = new Date(t.closedAt).toISOString().split('T')[0];
      if (tDate === today) {
        total += t.realizedPnL;
      }
    }
    return Number(total.toFixed(2));
  }

  public getAllUserIds(): string[] {
    return Object.keys(this.db.users);
  }

  // ================= MULTI-USER TELEGRAM LINKING & DEDUPLICATION =================

  public linkTelegramChat(
    chatId: string,
    userId: string,
    metadata?: { username?: string; firstName?: string }
  ): StoredTelegramLink {
    if (!this.db.telegramLinks) {
      this.db.telegramLinks = {};
    }
    const cleanChatId = String(chatId).trim();
    const existing = this.db.telegramLinks[cleanChatId];
    const link: StoredTelegramLink = {
      chatId: cleanChatId,
      userId,
      telegramUsername: metadata?.username || existing?.telegramUsername,
      telegramFirstName: metadata?.firstName || existing?.telegramFirstName,
      notificationsEnabled: existing ? existing.notificationsEnabled : true,
      linkedAt: existing ? existing.linkedAt : Date.now(),
      deliveredFingerprints: existing ? existing.deliveredFingerprints : []
    };
    this.db.telegramLinks[cleanChatId] = link;
    this.persist();
    return link;
  }

  public unlinkTelegramChat(chatId: string): boolean {
    if (!this.db.telegramLinks) return false;
    const cleanChatId = String(chatId).trim();
    if (this.db.telegramLinks[cleanChatId]) {
      delete this.db.telegramLinks[cleanChatId];
      this.persist();
      return true;
    }
    return false;
  }

  public getTelegramLinkByChatId(chatId: string): StoredTelegramLink | undefined {
    if (!this.db.telegramLinks) return undefined;
    return this.db.telegramLinks[String(chatId).trim()];
  }

  public getTelegramLinkByUserId(userId: string): StoredTelegramLink | undefined {
    if (!this.db.telegramLinks) return undefined;
    return Object.values(this.db.telegramLinks).find(l => l.userId === userId);
  }

  public getAllTelegramSubscribers(onlyValidFormat: boolean = true): StoredTelegramLink[] {
    if (!this.db.telegramLinks) return [];
    const all = Object.values(this.db.telegramLinks);
    if (!onlyValidFormat) return all;
    return all.filter(sub => isValidTelegramChatId(sub.chatId));
  }

  public updateTelegramNotificationPreference(chatId: string, enabled: boolean): boolean {
    const link = this.getTelegramLinkByChatId(chatId);
    if (!link) return false;
    link.notificationsEnabled = enabled;
    this.persist();
    return true;
  }

  public recordTelegramDeliveryForUser(chatId: string, fingerprint: string): void {
    const link = this.getTelegramLinkByChatId(chatId);
    if (!link) return;
    if (!link.deliveredFingerprints.includes(fingerprint)) {
      link.deliveredFingerprints.push(fingerprint);
      // Prune old fingerprints to prevent unbounded growth (keep last 300)
      if (link.deliveredFingerprints.length > 300) {
        link.deliveredFingerprints = link.deliveredFingerprints.slice(-300);
      }
      this.persist();
    }
  }

  public hasUserReceivedSignal(chatId: string, fingerprint: string): boolean {
    const link = this.getTelegramLinkByChatId(chatId);
    if (!link) return false;
    return link.deliveredFingerprints.includes(fingerprint);
  }
}

export const tradingStorage = new TradingStorageManager();
