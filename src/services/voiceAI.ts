import KaraokeSession from '../schemas/karaokeSession';
import VoiceAnalysis, { IVoiceAnalysis } from '../schemas/voiceAnalysis';

export class VoiceAIService {
  
  async analyzeVoiceData(voiceData: {
    userId: string;
    sessionId: string;
    guildId: string;
    audioBuffer: ArrayBuffer;
    referenceTrack?: {
      title: string;
      artist: string;
      pitch: number[];
      timing: number[];
    };
  }): Promise<IVoiceAnalysis> {
    
    // Simulated voice analysis - in production would use actual DSP
    const analysis = await this.processAudioBuffer(voiceData.audioBuffer, voiceData.referenceTrack);
    
    const voiceAnalysis = new VoiceAnalysis({
      userId: voiceData.userId,
      sessionId: voiceData.sessionId,
      guildId: voiceData.guildId,
      ...analysis
    });
    
    await voiceAnalysis.save();
    
    // Update karaoke session with new score
    await this.updateKaraokeScore(voiceData.sessionId, voiceData.userId, analysis.totalScore);
    
    return voiceAnalysis;
  }
  
  private async processAudioBuffer(audioBuffer: ArrayBuffer, referenceTrack?: any): Promise<any> {
    // Simulated AI voice analysis
    // In production: use Web Audio API, TensorFlow.js, or external AI service
    
    const pitch = Math.random() * 440 + 220; // A3 to A4 range
    const confidence = Math.random() * 0.5 + 0.5; // 50-100%
    const timing = Math.random() * 0.4 + 0.8; // 80-120% timing
    const volume = Math.random() * 0.3 + 0.7; // 70-100%
    const vibrato = Math.random() * 0.2; // 0-20%
    const breathControl = Math.random() * 0.3 + 0.7; // 70-100%
    
    // Calculate accuracies
    const pitchAccuracy = this.calculatePitchAccuracy(pitch, referenceTrack?.pitch);
    const timingAccuracy = this.calculateTimingAccuracy(timing, referenceTrack?.timing);
    const expressiveness = this.calculateExpressiveness(vibrato, volume, breathControl);
    
    const totalScore = Math.round((pitchAccuracy + timingAccuracy + expressiveness) / 3);
    
    const feedback = this.generateFeedback({
      pitchAccuracy,
      timingAccuracy,
      expressiveness,
      pitch,
      timing,
      volume,
      vibrato,
      breathControl
    });
    
    return {
      pitch,
      confidence,
      timing,
      volume,
      vibrato,
      breathControl,
      pitchAccuracy,
      timingAccuracy,
      expressiveness,
      totalScore,
      feedback
    };
  }
  
  private calculatePitchAccuracy(pitch: number, referencePitch?: number[]): number {
    if (!referencePitch) return Math.random() * 30 + 70; // 70-100% if no reference
    
    // Simplified pitch accuracy calculation
    const deviation = Math.abs(pitch - (referencePitch[0] || 440));
    const accuracy = Math.max(0, 100 - (deviation / 10));
    return Math.round(accuracy);
  }
  
  private calculateTimingAccuracy(timing: number, referenceTiming?: number[]): number {
    if (!referenceTiming) return Math.random() * 30 + 70;
    
    const deviation = Math.abs(timing - 1.0); // Perfect timing = 1.0
    const accuracy = Math.max(0, 100 - (deviation * 100));
    return Math.round(accuracy);
  }
  
  private calculateExpressiveness(vibrato: number, volume: number, breathControl: number): number {
    const expressiveness = (vibrato * 30) + (volume * 40) + (breathControl * 30);
    return Math.round(Math.min(100, expressiveness * 100));
  }
  
  private generateFeedback(analysis: any): string[] {
    const feedback: string[] = [];
    
    if (analysis.pitchAccuracy < 70) {
      feedback.push("Tente acompanhar a melodia mais de perto 🎵");
    } else if (analysis.pitchAccuracy > 90) {
      feedback.push("Afinação perfeita! 🎯");
    }
    
    if (analysis.timingAccuracy < 70) {
      feedback.push("Preste atenção no ritmo da música ⏰");
    } else if (analysis.timingAccuracy > 90) {
      feedback.push("Timing impecável! 🕐");
    }
    
    if (analysis.expressiveness < 50) {
      feedback.push("Coloque mais emoção na sua voz! 💖");
    } else if (analysis.expressiveness > 80) {
      feedback.push("Que expressividade incrível! 🌟");
    }
    
    if (analysis.breathControl < 60) {
      feedback.push("Trabalhe sua respiração para notas mais estáveis 🫁");
    }
    
    if (analysis.volume < 0.5) {
      feedback.push("Pode cantar um pouco mais alto! 📢");
    }
    
    if (feedback.length === 0) {
      feedback.push("Performance sólida! Continue assim! 👏");
    }
    
    return feedback;
  }
  
  private async updateKaraokeScore(sessionId: string, userId: string, score: number): Promise<void> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (session) {
      const currentScore = session.scores[userId] || 0;
      session.scores[userId] = Math.max(currentScore, score);
      await session.save();
    }
  }
  
  async getVoiceProgress(userId: string, guildId: string): Promise<any> {
    const analyses = await VoiceAnalysis.find({ userId, guildId })
      .sort({ timestamp: -1 })
      .limit(50);
    
    if (analyses.length === 0) return null;
    
    const latest = analyses[0];
    const oldest = analyses[analyses.length - 1];
    
    const progress = {
      currentSkills: {
        pitchAccuracy: latest.pitchAccuracy,
        timingAccuracy: latest.timingAccuracy,
        expressiveness: latest.expressiveness,
        totalScore: latest.totalScore
      },
      improvement: {
        pitchImprovement: latest.pitchAccuracy - oldest.pitchAccuracy,
        timingImprovement: latest.timingAccuracy - oldest.timingAccuracy,
        expressivenessImprovement: latest.expressiveness - oldest.expressiveness,
        overallImprovement: latest.totalScore - oldest.totalScore
      },
      strengths: this.identifyStrengths(analyses),
      suggestions: this.generateImprovementSuggestions(analyses),
      sessionsCompleted: analyses.length,
      averageScore: Math.round(analyses.reduce((sum, a) => sum + a.totalScore, 0) / analyses.length)
    };
    
    return progress;
  }
  
  private identifyStrengths(analyses: IVoiceAnalysis[]): string[] {
    const latest = analyses[0];
    const strengths: string[] = [];
    
    if (latest.pitchAccuracy > 85) strengths.push("Afinação excelente");
    if (latest.timingAccuracy > 85) strengths.push("Timing preciso");
    if (latest.expressiveness > 85) strengths.push("Muito expressivo");
    if (latest.breathControl > 0.8) strengths.push("Controle respiratório");
    if (latest.confidence > 0.9) strengths.push("Confiança vocal");
    
    return strengths;
  }
  
  private generateImprovementSuggestions(analyses: IVoiceAnalysis[]): string[] {
    const latest = analyses[0];
    const suggestions: string[] = [];
    
    if (latest.pitchAccuracy < 70) {
      suggestions.push("Pratique exercícios de afinação com instrumentos");
    }
    
    if (latest.timingAccuracy < 70) {
      suggestions.push("Use metrônomo para treinar timing");
    }
    
    if (latest.expressiveness < 60) {
      suggestions.push("Trabalhe interpretação e dinâmica vocal");
    }
    
    if (latest.breathControl < 0.6) {
      suggestions.push("Faça exercícios de respiração diafragmática");
    }
    
    if (suggestions.length === 0) {
      suggestions.push("Continue praticando para manter o nível!");
    }
    
    return suggestions;
  }
  
  async generatePersonalizedVocalExercises(userId: string, guildId: string): Promise<any[]> {
    const progress = await this.getVoiceProgress(userId, guildId);
    if (!progress) return [];
    
    const exercises = [];
    
    if (progress.currentSkills.pitchAccuracy < 70) {
      exercises.push({
        type: "pitch",
        name: "Exercício de Escala",
        description: "Cante escalas maiores em diferentes tonalidades",
        difficulty: "básico",
        duration: "5 minutos"
      });
    }
    
    if (progress.currentSkills.timingAccuracy < 70) {
      exercises.push({
        type: "rhythm",
        name: "Clapping Rhythm",
        description: "Bata palmas no tempo de diferentes músicas",
        difficulty: "básico",
        duration: "10 minutos"
      });
    }
    
    if (progress.currentSkills.expressiveness < 60) {
      exercises.push({
        type: "expression",
        name: "Dinâmica Vocal",
        description: "Pratique cantar a mesma música com diferentes emoções",
        difficulty: "intermediário",
        duration: "15 minutos"
      });
    }
    
    return exercises;
  }
}
