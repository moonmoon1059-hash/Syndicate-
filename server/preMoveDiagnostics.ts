export interface GateRejectionRecord {
  count: number;
  sampleSymbols: string[];
  reasons: string[];
}

export interface QualifiedPreMoveRecord {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  coilScore: number;
  setupStage: 'COILING' | 'READY_TO_BREAK' | 'TRIGGERED';
  keyTriggerLevel: number;
  invalidationPrice: number;
  riskRewardRatio: number;
  expectedMovePct: number;
  evidence: string[];
}

export interface PreMoveDiagnosticsSnapshot {
  scanTimestamp: number;
  totalEvaluated: number;
  compressionCandidatesDetected: number;
  gates: {
    INSUFFICIENT_DATA: GateRejectionRecord;
    NO_COMPRESSION_COIL: GateRejectionRecord;
    NO_DIRECTIONAL_EVIDENCE: GateRejectionRecord;
    NO_CONFIRMING_CATALYST: GateRejectionRecord;
    ANTI_CHASE_EXHAUSTED: GateRejectionRecord;
    INVALID_STRUCTURAL_SL: GateRejectionRecord;
    NO_STRUCTURAL_TARGETS: GateRejectionRecord;
    UNFAVORABLE_RR: GateRejectionRecord;
    DUPLICATE_OR_CONFLICT: GateRejectionRecord;
  };
  qualifiedCount: number;
  returnedByApiCount: number;
  qualifiedSignals: QualifiedPreMoveRecord[];
}

class PreMoveDiagnosticsTracker {
  private scanTimestamp: number = Date.now();
  private totalEvaluated: number = 0;
  private compressionCandidatesDetected: number = 0;
  private returnedByApiCount: number = 0;
  private gates: PreMoveDiagnosticsSnapshot['gates'] = this.createInitialGates();
  private qualifiedSignals: QualifiedPreMoveRecord[] = [];

  private createInitialGates(): PreMoveDiagnosticsSnapshot['gates'] {
    return {
      INSUFFICIENT_DATA: { count: 0, sampleSymbols: [], reasons: [] },
      NO_COMPRESSION_COIL: { count: 0, sampleSymbols: [], reasons: [] },
      NO_DIRECTIONAL_EVIDENCE: { count: 0, sampleSymbols: [], reasons: [] },
      NO_CONFIRMING_CATALYST: { count: 0, sampleSymbols: [], reasons: [] },
      ANTI_CHASE_EXHAUSTED: { count: 0, sampleSymbols: [], reasons: [] },
      INVALID_STRUCTURAL_SL: { count: 0, sampleSymbols: [], reasons: [] },
      NO_STRUCTURAL_TARGETS: { count: 0, sampleSymbols: [], reasons: [] },
      UNFAVORABLE_RR: { count: 0, sampleSymbols: [], reasons: [] },
      DUPLICATE_OR_CONFLICT: { count: 0, sampleSymbols: [], reasons: [] }
    };
  }

  public resetForNewScan() {
    this.scanTimestamp = Date.now();
    this.totalEvaluated = 0;
    this.compressionCandidatesDetected = 0;
    this.gates = this.createInitialGates();
    this.qualifiedSignals = [];
  }

  public recordEvaluation(symbol: string) {
    this.totalEvaluated++;
  }

  public recordScanStart(totalUniverse: number) {
    this.resetForNewScan();
    console.log(`[PREMOVE_SCAN] Starting Pre-Move evaluation cycle across ${totalUniverse} market pairs`);
  }

  public recordCandidateDetected(symbol: string, details: string) {
    this.recordCompressionCandidate(symbol);
    console.log(`[PREMOVE_DETECTED] ${symbol}: ${details}`);
  }

  public recordRejectCompression(symbol: string, reason: string) {
    this.recordGateRejection('NO_COMPRESSION_COIL', symbol, reason);
  }

  public recordRejectDirection(symbol: string, reason: string) {
    this.recordGateRejection('NO_DIRECTIONAL_EVIDENCE', symbol, reason);
  }

  public recordRejectCatalyst(symbol: string, reason: string) {
    this.recordGateRejection('NO_CONFIRMING_CATALYST', symbol, reason);
  }

  public recordRejectAntiChase(symbol: string, reason: string) {
    this.recordGateRejection('ANTI_CHASE_EXHAUSTED', symbol, reason);
  }

  public recordRejectStructuralSL(symbol: string, reason: string) {
    this.recordGateRejection('INVALID_STRUCTURAL_SL', symbol, reason);
  }

  public recordRejectStructuralTarget(symbol: string, reason: string) {
    this.recordGateRejection('NO_STRUCTURAL_TARGETS', symbol, reason);
  }

  public recordSignalQualified(record: QualifiedPreMoveRecord) {
    this.recordQualified(record);
    console.log(`[PREMOVE_QUALIFIED] ${record.symbol} (${record.direction}) - Stage: ${record.setupStage}, Coil: ${record.coilScore}, R:R: ${record.riskRewardRatio}`);
  }

  public recordSignalStored(symbol: string, id: string) {
    console.log(`[PREMOVE_STORED] Stored in Authoritative Pre-Move Registry: ${symbol} (${id})`);
  }

  public recordApiReturn(count: number) {
    this.recordApiServed(count);
    console.log(`[PREMOVE_API_RETURN] Pre-Move endpoint /api/pre-move served ${count} authoritative opportunities`);
  }

  public recordApiServed(count: number) {
    this.returnedByApiCount = count;
  }

  public recordCompressionCandidate(symbol: string) {
    this.compressionCandidatesDetected++;
  }

  public recordGateRejection(
    gate: keyof PreMoveDiagnosticsSnapshot['gates'],
    symbol: string,
    reason: string
  ) {
    const record = this.gates[gate];
    if (record) {
      record.count++;
      if (record.sampleSymbols.length < 5 && !record.sampleSymbols.includes(symbol)) {
        record.sampleSymbols.push(symbol);
      }
      if (record.reasons.length < 3 && !record.reasons.includes(reason)) {
        record.reasons.push(reason);
      }
    }
  }

  public recordQualified(record: QualifiedPreMoveRecord) {
    // ONE COIN = ONE current signal: deduplicate by symbol
    const idx = this.qualifiedSignals.findIndex(q => q.symbol === record.symbol);
    if (idx >= 0) {
      this.qualifiedSignals[idx] = record;
    } else {
      this.qualifiedSignals.push(record);
    }
  }

  public getSnapshot(): PreMoveDiagnosticsSnapshot {
    return {
      scanTimestamp: this.scanTimestamp,
      totalEvaluated: this.totalEvaluated,
      compressionCandidatesDetected: this.compressionCandidatesDetected,
      gates: JSON.parse(JSON.stringify(this.gates)),
      qualifiedCount: this.qualifiedSignals.length,
      returnedByApiCount: this.returnedByApiCount,
      qualifiedSignals: [...this.qualifiedSignals]
    };
  }
}

export const preMoveDiagnostics = new PreMoveDiagnosticsTracker();
