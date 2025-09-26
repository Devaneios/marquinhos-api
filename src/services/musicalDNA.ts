import { v4 as uuidv4 } from 'uuid';
import MusicalDNA, { IMusicalDNA } from '../schemas/musicalDNA';
import Scrobble from '../schemas/scrobble';
import UserStats from '../schemas/userStats';

export class MusicalDNAService {
  
  async generateMusicalDNA(userId: string, guildId: string): Promise<IMusicalDNA> {
    let musicalDNA = await MusicalDNA.findOne({ userId, guildId });
    
    if (!musicalDNA) {
      musicalDNA = new MusicalDNA({
        userId,
        guildId,
        dnaSignature: this.generateDNASignature(),
        preferredBPM: { min: 60, max: 180, peak: 120 },
        instrumentPreferences: new Map(),
        harmonicPreferences: {
          majorKeys: 0.5,
          minorKeys: 0.3,
          modalKeys: 0.2,
          dissonance: 0.1
        },
        rhythmicPatterns: new Map(),
        emotionalMapping: new Map(),
        temporalEvolution: [],
        microPreferences: {
          timbres: [],
          progressions: [],
          structures: []
        },
        compatibilityScore: new Map()
      });
    }
    
    await this.analyzeAndUpdateDNA(musicalDNA);
    await musicalDNA.save();
    
    return musicalDNA;
  }
  
  private generateDNASignature(): string {
    return `DNA-${uuidv4().slice(0, 8)}-${Date.now().toString(36)}`;
  }
  
  private async analyzeAndUpdateDNA(musicalDNA: IMusicalDNA): Promise<void> {
    const userStats = await UserStats.findOne({ 
      userId: musicalDNA.userId, 
      guildId: musicalDNA.guildId 
    });
    
    const recentScrobbles = await Scrobble.find({
      'playbackData.listeningUsersId': musicalDNA.userId,
      'playbackData.guildId': musicalDNA.guildId,
      'playbackData.timestamp': { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      }
    });
    
    // Analyze BPM preferences
    await this.analyzeBPMPreferences(musicalDNA, recentScrobbles);
    
    // Analyze instrument preferences
    await this.analyzeInstrumentPreferences(musicalDNA, recentScrobbles);
    
    // Analyze harmonic preferences
    await this.analyzeHarmonicPreferences(musicalDNA, recentScrobbles);
    
    // Analyze rhythmic patterns
    await this.analyzeRhythmicPatterns(musicalDNA, recentScrobbles);
    
    // Analyze emotional mapping
    await this.analyzeEmotionalMapping(musicalDNA, userStats);
    
    // Update micro preferences
    await this.updateMicroPreferences(musicalDNA, recentScrobbles);
    
    // Take temporal snapshot
    this.takeTemporalSnapshot(musicalDNA);
    
    musicalDNA.lastAnalysis = new Date();
  }
  
  private async analyzeBPMPreferences(musicalDNA: IMusicalDNA, scrobbles: any[]): Promise<void> {
    if (scrobbles.length === 0) return;
    
    // Simulated BPM analysis - in production would use actual audio analysis
    const bpms = scrobbles.map(() => Math.floor(Math.random() * 120) + 60); // 60-180 BPM
    
    musicalDNA.preferredBPM.min = Math.min(...bpms);
    musicalDNA.preferredBPM.max = Math.max(...bpms);
    musicalDNA.preferredBPM.peak = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  }
  
  private async analyzeInstrumentPreferences(musicalDNA: IMusicalDNA, scrobbles: any[]): Promise<void> {
    const instruments = ['guitar', 'piano', 'drums', 'bass', 'violin', 'saxophone', 'synth', 'vocals'];
    
    // Simulated instrument detection
    scrobbles.forEach(scrobble => {
      const detectedInstruments = instruments.filter(() => Math.random() > 0.7);
      detectedInstruments.forEach(instrument => {
        const current = musicalDNA.instrumentPreferences.get(instrument) || 0;
        musicalDNA.instrumentPreferences.set(instrument, current + 1);
      });
    });
    
    // Normalize preferences
    const total = Array.from(musicalDNA.instrumentPreferences.values()).reduce((a, b) => a + b, 0);
    if (total > 0) {
      musicalDNA.instrumentPreferences.forEach((value, key) => {
        musicalDNA.instrumentPreferences.set(key, value / total);
      });
    }
  }
  
  private async analyzeHarmonicPreferences(musicalDNA: IMusicalDNA, scrobbles: any[]): Promise<void> {
    // Simulated harmonic analysis
    let majorCount = 0, minorCount = 0, modalCount = 0, dissonantCount = 0;
    
    scrobbles.forEach(() => {
      const harmony = Math.random();
      if (harmony < 0.5) majorCount++;
      else if (harmony < 0.8) minorCount++;
      else if (harmony < 0.95) modalCount++;
      else dissonantCount++;
    });
    
    const total = scrobbles.length;
    if (total > 0) {
      musicalDNA.harmonicPreferences.majorKeys = majorCount / total;
      musicalDNA.harmonicPreferences.minorKeys = minorCount / total;
      musicalDNA.harmonicPreferences.modalKeys = modalCount / total;
      musicalDNA.harmonicPreferences.dissonance = dissonantCount / total;
    }
  }
  
  private async analyzeRhythmicPatterns(musicalDNA: IMusicalDNA, scrobbles: any[]): Promise<void> {
    const patterns = ['4/4', '3/4', '6/8', '2/4', '5/4', '7/8', 'irregular'];
    
    scrobbles.forEach(() => {
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      const current = musicalDNA.rhythmicPatterns.get(pattern) || 0;
      musicalDNA.rhythmicPatterns.set(pattern, current + 1);
    });
    
    // Normalize
    const total = Array.from(musicalDNA.rhythmicPatterns.values()).reduce((a, b) => a + b, 0);
    if (total > 0) {
      musicalDNA.rhythmicPatterns.forEach((value, key) => {
        musicalDNA.rhythmicPatterns.set(key, value / total);
      });
    }
  }
  
  private async analyzeEmotionalMapping(musicalDNA: IMusicalDNA, userStats: any): Promise<void> {
    if (!userStats?.listeningPatterns) return;
    
    const emotions = ['happy', 'sad', 'energetic', 'calm', 'nostalgic', 'romantic', 'aggressive', 'melancholic'];
    
    // Map listening patterns to emotions
    userStats.listeningPatterns.forEach((count: number, timeOfDay: string) => {
      let dominantEmotion = '';
      
      switch (timeOfDay) {
        case 'morning':
          dominantEmotion = Math.random() > 0.5 ? 'energetic' : 'happy';
          break;
        case 'afternoon':
          dominantEmotion = Math.random() > 0.5 ? 'calm' : 'nostalgic';
          break;
        case 'evening':
          dominantEmotion = Math.random() > 0.5 ? 'romantic' : 'melancholic';
          break;
        case 'night':
          dominantEmotion = Math.random() > 0.5 ? 'sad' : 'calm';
          break;
      }
      
      if (dominantEmotion) {
        const current = musicalDNA.emotionalMapping.get(dominantEmotion) || 0;
        musicalDNA.emotionalMapping.set(dominantEmotion, current + count);
      }
    });
  }
  
  private async updateMicroPreferences(musicalDNA: IMusicalDNA, scrobbles: any[]): Promise<void> {
    const timbres = ['warm', 'bright', 'dark', 'metallic', 'organic', 'synthetic', 'vintage', 'modern'];
    const progressions = ['I-V-vi-IV', 'vi-IV-I-V', 'I-vi-ii-V', 'I-IV-V-I', 'ii-V-I', 'i-VII-VI-VII'];
    const structures = ['verse-chorus', 'AABA', 'through-composed', 'rondo', 'blues', 'jazz-standard'];
    
    // Simulated micro-preference detection
    musicalDNA.microPreferences.timbres = timbres.filter(() => Math.random() > 0.8);
    musicalDNA.microPreferences.progressions = progressions.filter(() => Math.random() > 0.7);
    musicalDNA.microPreferences.structures = structures.filter(() => Math.random() > 0.75);
  }
  
  private takeTemporalSnapshot(musicalDNA: IMusicalDNA): void {
    const snapshot = {
      bpm: musicalDNA.preferredBPM,
      topInstruments: Array.from(musicalDNA.instrumentPreferences.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      harmonicProfile: musicalDNA.harmonicPreferences,
      topEmotions: Array.from(musicalDNA.emotionalMapping.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
    };
    
    musicalDNA.temporalEvolution.push({
      timestamp: new Date(),
      snapshot
    });
    
    // Keep only last 12 snapshots (1 year if monthly)
    if (musicalDNA.temporalEvolution.length > 12) {
      musicalDNA.temporalEvolution = musicalDNA.temporalEvolution.slice(-12);
    }
  }
  
  async calculateCompatibility(userA: string, userB: string, guildId: string): Promise<number> {
    const dnaA = await MusicalDNA.findOne({ userId: userA, guildId });
    const dnaB = await MusicalDNA.findOne({ userId: userB, guildId });
    
    if (!dnaA || !dnaB) return 0;
    
    let compatibility = 0;
    let factors = 0;
    
    // BPM compatibility
    const bpmOverlap = this.calculateRangeOverlap(
      [dnaA.preferredBPM.min, dnaA.preferredBPM.max],
      [dnaB.preferredBPM.min, dnaB.preferredBPM.max]
    );
    compatibility += bpmOverlap * 0.2;
    factors += 0.2;
    
    // Instrument compatibility
    const instrumentSimilarity = this.calculateMapSimilarity(
      dnaA.instrumentPreferences,
      dnaB.instrumentPreferences
    );
    compatibility += instrumentSimilarity * 0.3;
    factors += 0.3;
    
    // Harmonic compatibility
    const harmonicSimilarity = this.calculateHarmonicSimilarity(
      dnaA.harmonicPreferences,
      dnaB.harmonicPreferences
    );
    compatibility += harmonicSimilarity * 0.25;
    factors += 0.25;
    
    // Emotional compatibility
    const emotionalSimilarity = this.calculateMapSimilarity(
      dnaA.emotionalMapping,
      dnaB.emotionalMapping
    );
    compatibility += emotionalSimilarity * 0.25;
    factors += 0.25;
    
    const finalCompatibility = Math.round((compatibility / factors) * 100);
    
    // Update compatibility scores
    dnaA.compatibilityScore.set(userB, finalCompatibility);
    dnaB.compatibilityScore.set(userA, finalCompatibility);
    
    await Promise.all([dnaA.save(), dnaB.save()]);
    
    return finalCompatibility;
  }
  
  private calculateRangeOverlap(rangeA: number[], rangeB: number[]): number {
    const overlapStart = Math.max(rangeA[0], rangeB[0]);
    const overlapEnd = Math.min(rangeA[1], rangeB[1]);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    
    const totalRange = Math.max(rangeA[1], rangeB[1]) - Math.min(rangeA[0], rangeB[0]);
    
    return totalRange > 0 ? overlap / totalRange : 0;
  }
  
  private calculateMapSimilarity(mapA: Map<string, number>, mapB: Map<string, number>): number {
    const keysA = new Set(mapA.keys());
    const keysB = new Set(mapB.keys());
    const allKeys = new Set([...keysA, ...keysB]);
    
    if (allKeys.size === 0) return 0;
    
    let similarity = 0;
    allKeys.forEach(key => {
      const valueA = mapA.get(key) || 0;
      const valueB = mapB.get(key) || 0;
      similarity += 1 - Math.abs(valueA - valueB);
    });
    
    return similarity / allKeys.size;
  }
  
  private calculateHarmonicSimilarity(harmA: any, harmB: any): number {
    const keys = ['majorKeys', 'minorKeys', 'modalKeys', 'dissonance'];
    let similarity = 0;
    
    keys.forEach(key => {
      similarity += 1 - Math.abs(harmA[key] - harmB[key]);
    });
    
    return similarity / keys.length;
  }
  
  async getMusicalEvolution(userId: string, guildId: string): Promise<any> {
    const dna = await MusicalDNA.findOne({ userId, guildId });
    if (!dna || dna.temporalEvolution.length < 2) return null;
    
    const evolution = dna.temporalEvolution;
    const first = evolution[0];
    const latest = evolution[evolution.length - 1];
    
    return {
      timespan: {
        start: first.timestamp,
        end: latest.timestamp,
        months: evolution.length
      },
      changes: {
        bpmEvolution: this.analyzeBPMEvolution(evolution),
        instrumentShifts: this.analyzeInstrumentShifts(evolution),
        emotionalJourney: this.analyzeEmotionalJourney(evolution)
      },
      trends: this.identifyTrends(evolution),
      predictions: this.predictFuturePreferences(evolution)
    };
  }
  
  private analyzeBPMEvolution(evolution: any[]): any {
    const bpmData = evolution.map(e => e.snapshot.bpm.peak);
    return {
      initial: bpmData[0],
      current: bpmData[bpmData.length - 1],
      trend: this.calculateTrend(bpmData),
      volatility: this.calculateVolatility(bpmData)
    };
  }
  
  private analyzeInstrumentShifts(evolution: any[]): any {
    const shifts = [];
    
    for (let i = 1; i < evolution.length; i++) {
      const prev = new Map(evolution[i-1].snapshot.topInstruments);
      const curr = new Map(evolution[i].snapshot.topInstruments);
      
      const gained: any[] = [];
      const lost: any[] = [];
      
      curr.forEach((value, key) => {
        if (!prev.has(key)) gained.push(key);
      });
      
      prev.forEach((value, key) => {
        if (!curr.has(key)) lost.push(key);
      });
      
      if (gained.length > 0 || lost.length > 0) {
        shifts.push({
          timestamp: evolution[i].timestamp,
          gained,
          lost
        });
      }
    }
    
    return shifts;
  }
  
  private analyzeEmotionalJourney(evolution: any[]): any {
    return evolution.map(e => ({
      timestamp: e.timestamp,
      dominantEmotions: e.snapshot.topEmotions.slice(0, 3)
    }));
  }
  
  private identifyTrends(evolution: any[]): string[] {
    const trends: string[] = [];
    
    // BPM trend
    const bpmData = evolution.map(e => e.snapshot.bpm.peak);
    const bpmTrend = this.calculateTrend(bpmData);
    
    if (bpmTrend > 0.1) trends.push("Gravitando para músicas mais rápidas");
    else if (bpmTrend < -0.1) trends.push("Preferindo músicas mais lentas");
    
    // Emotional trends
    const emotionalData = evolution.map(e => e.snapshot.topEmotions);
    // Simplified emotion trend analysis
    if (emotionalData.length > 3) {
      trends.push("Explorando mais diversidade emocional");
    }
    
    return trends;
  }
  
  private predictFuturePreferences(evolution: any[]): any {
    // Simplified prediction based on trends
    const latest = evolution[evolution.length - 1];
    
    return {
      likelyNewGenres: ["experimental", "fusion", "world music"],
      bpmPrediction: latest.snapshot.bpm.peak + Math.random() * 20 - 10,
      confidenceLevel: 0.7
    };
  }
  
  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;
    
    let trend = 0;
    for (let i = 1; i < data.length; i++) {
      trend += (data[i] - data[i-1]) / data[i-1];
    }
    
    return trend / (data.length - 1);
  }
  
  private calculateVolatility(data: number[]): number {
    if (data.length < 2) return 0;
    
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    
    return Math.sqrt(variance) / mean;
  }
}
