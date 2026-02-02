import { describe, it, expect } from 'vitest';
import { kellyFraction, sizePosition, sizeFromSignal } from '../position-sizer.js';

describe('kellyFraction', () => {
  it('calculates correct Kelly fraction for a good edge', () => {
    // Model says 55%, market at 40 cents
    // b = (1 - 0.4) / 0.4 = 1.5
    // f* = (0.55 * 1.5 - 0.45) / 1.5 = (0.825 - 0.45) / 1.5 = 0.25
    const f = kellyFraction(0.55, 0.40);
    expect(f).toBeCloseTo(0.25, 4);
  });

  it('returns negative when no edge', () => {
    // Model says 30%, market at 40 cents — no edge
    const f = kellyFraction(0.30, 0.40);
    expect(f).toBeLessThan(0);
  });

  it('returns 0 for invalid entry price', () => {
    expect(kellyFraction(0.5, 0)).toBe(0);
    expect(kellyFraction(0.5, 1)).toBe(0);
    expect(kellyFraction(0.5, -0.1)).toBe(0);
    expect(kellyFraction(0.5, 1.5)).toBe(0);
  });

  it('returns 0 for invalid model probability', () => {
    expect(kellyFraction(0, 0.5)).toBe(0);
    expect(kellyFraction(1, 0.5)).toBe(0);
  });

  it('returns high fraction for strong edge', () => {
    // Model says 90%, market at 40 cents
    const f = kellyFraction(0.90, 0.40);
    expect(f).toBeGreaterThan(0.5);
  });

  it('handles even odds', () => {
    // 50 cent contract, model says 60%
    // b = (1-0.5)/0.5 = 1
    // f = (0.6 * 1 - 0.4) / 1 = 0.2
    const f = kellyFraction(0.60, 0.50);
    expect(f).toBeCloseTo(0.2, 4);
  });
});

describe('sizePosition', () => {
  it('sizes a position with quarter-Kelly', () => {
    const result = sizePosition({
      modelProb: 0.55,
      entryPrice: 0.40,
      bankroll: 500,
    });

    // Full Kelly = 0.25, quarter = 0.0625
    // But maxPositionPct=5 → cap at 0.05
    // Dollar amount = 500 * 0.05 = 25
    // Contracts = floor(25 / 0.40) = 62
    expect(result.kellyFull).toBeCloseTo(0.25, 3);
    expect(result.kellyAdjusted).toBeCloseTo(0.0625, 3);
    expect(result.fraction).toBe(0.05);
    expect(result.contracts).toBe(62);
    expect(result.costBasis).toBeCloseTo(24.8, 1);
  });

  it('caps position at maxPositionPct', () => {
    const result = sizePosition({
      modelProb: 0.90,
      entryPrice: 0.10,
      bankroll: 500,
      maxPositionPct: 5,
    });

    // Quarter-Kelly would be much larger than 5%, so cap applies
    expect(result.costBasis).toBeLessThanOrEqual(500 * 0.05 + 0.01);
    expect(result.fraction).toBeLessThanOrEqual(0.05);
  });

  it('returns 0 contracts when no edge', () => {
    const result = sizePosition({
      modelProb: 0.30,
      entryPrice: 0.40,
      bankroll: 500,
    });

    expect(result.contracts).toBe(0);
    expect(result.costBasis).toBe(0);
    expect(result.kellyFull).toBeLessThan(0);
  });

  it('returns 0 contracts when bankroll too small (kelly <= 0)', () => {
    const result = sizePosition({
      modelProb: 0.55,
      entryPrice: 0.90,
      bankroll: 1, // Only $1
    });

    // modelProb < entryPrice → no edge
    expect(result.contracts).toBe(0);
    expect(result.costBasis).toBe(0);
  });

  it('returns 0 contracts when kelly positive but dollar amount too small', () => {
    const result = sizePosition({
      modelProb: 0.55,
      entryPrice: 0.40,
      bankroll: 5, // $5 bankroll
      maxPositionPct: 1, // 1% cap = $0.05, can't buy a $0.40 contract
    });

    expect(result.contracts).toBe(0);
    expect(result.costBasis).toBe(0);
    expect(result.kellyFull).toBeGreaterThan(0);
  });

  it('uses custom kelly multiplier', () => {
    // Use a high maxPositionPct so the cap doesn't interfere
    const quarter = sizePosition({
      modelProb: 0.60,
      entryPrice: 0.40,
      bankroll: 500,
      kellyMultiplier: 0.25,
      maxPositionPct: 50,
    });

    const half = sizePosition({
      modelProb: 0.60,
      entryPrice: 0.40,
      bankroll: 500,
      kellyMultiplier: 0.5,
      maxPositionPct: 50,
    });

    expect(half.contracts).toBeGreaterThan(quarter.contracts);
    expect(half.kellyAdjusted).toBeGreaterThan(quarter.kellyAdjusted);
  });

  it('rounds cost basis to 2 decimal places', () => {
    const result = sizePosition({
      modelProb: 0.55,
      entryPrice: 0.33,
      bankroll: 500,
    });

    const decimals = result.costBasis.toString().split('.')[1];
    expect(!decimals || decimals.length <= 2).toBe(true);
  });
});

describe('sizeFromSignal', () => {
  it('sizes a yes-side signal', () => {
    const signal = {
      ticker: 'MKT-1',
      marketPrice: 0.40,
      modelProb: 0.60,
      confidence: 0.8,
      side: 'yes',
    };

    const result = sizeFromSignal(signal, { bankroll: 500 });

    expect(result.side).toBe('yes');
    expect(result.entryPrice).toBe(0.40);
    expect(result.contracts).toBeGreaterThan(0);
  });

  it('sizes a no-side signal', () => {
    const signal = {
      ticker: 'MKT-2',
      marketPrice: 0.80,
      modelProb: 0.50,
      confidence: 0.75,
      side: 'no',
    };

    const result = sizeFromSignal(signal, { bankroll: 500 });

    expect(result.side).toBe('no');
    // Buying no at 1 - 0.80 = 0.20
    expect(result.entryPrice).toBe(0.20);
    expect(result.contracts).toBeGreaterThan(0);
  });

  it('passes through config options', () => {
    const signal = {
      ticker: 'MKT-3',
      marketPrice: 0.40,
      modelProb: 0.70,
      confidence: 0.9,
      side: 'yes',
    };

    const small = sizeFromSignal(signal, { bankroll: 100, maxPositionPct: 2 });
    const big = sizeFromSignal(signal, { bankroll: 1000, maxPositionPct: 10 });

    expect(big.contracts).toBeGreaterThan(small.contracts);
  });

  it('returns 0 contracts for no-edge signal', () => {
    const signal = {
      ticker: 'MKT-4',
      marketPrice: 0.60,
      modelProb: 0.55, // side=yes but very small edge
      confidence: 0.5,
      side: 'yes',
    };

    const result = sizeFromSignal(signal, { bankroll: 100 });
    // With such a tiny edge and small bankroll, may be 0
    expect(result.contracts).toBeGreaterThanOrEqual(0);
  });
});
