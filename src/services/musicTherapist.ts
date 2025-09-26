import { v4 as uuidv4 } from 'uuid';
import MusicTherapy, { IMusicTherapy } from '../schemas/musicTherapy';
import MusicalDNA from '../schemas/musicalDNA';

export class MusicTherapistService {
  
  private therapeuticDatabase = {
    anxiety: {
      tracks: [
        { title: "Weightless", artist: "Marconi Union", bpm: 60, scientificBasis: "Designed to reduce anxiety by 65%" },
        { title: "Claire de Lune", artist: "Claude Debussy", bpm: 70, scientificBasis: "Classical music proven to lower cortisol" }
      ],
      progression: ["calming", "grounding", "stabilizing", "empowering"]
    },
    depression: {
      tracks: [
        { title: "Mad World", artist: "Gary Jules", bpm: 80, scientificBasis: "Validates feelings before uplift" },
        { title: "Here Comes the Sun", artist: "The Beatles", bpm: 129, scientificBasis: "Gradual tempo increase boosts serotonin" }
      ],
      progression: ["acknowledgment", "companionship", "gentle uplift", "hope"]
    },
    focus: {
      tracks: [
        { title: "Music for Airports", artist: "Brian Eno", bpm: 90, scientificBasis: "Ambient music improves concentration" },
        { title: "Gymnopédie No. 1", artist: "Erik Satie", bpm: 75, scientificBasis: "Minimal structure reduces cognitive load" }
      ],
      progression: ["settling", "focusing", "deepening", "sustaining"]
    },
    stress: {
      tracks: [
        { title: "Aqueous Transmission", artist: "Incubus", bpm: 85, scientificBasis: "12-minute arc reduces stress hormones" },
        { title: "River", artist: "Joni Mitchell", bpm: 95, scientificBasis: "Water metaphors activate calming neural pathways" }
      ],
      progression: ["acknowledgment", "release", "cleansing", "renewal"]
    },
    sleep: {
      tracks: [
        { title: "Sleep Baby Sleep", artist: "Broods", bpm: 60, scientificBasis: "60 BPM matches resting heart rate" },
        { title: "Clair de Lune", artist: "Claude Debussy", bpm: 55, scientificBasis: "Decreasing tempo induces sleep states" }
      ],
      progression: ["winding down", "relaxing", "drowsy", "sleep"]
    }
  };
  
  async startTherapySession(data: {
    userId: string;
    guildId: string;
    mood: string;
    energy: number;
    stress: number;
    focus: number;
    context: string;
    description?: string;
    goals?: string[];
  }): Promise<IMusicTherapy> {
    
    const session = new MusicTherapy({
      userId: data.userId,
      guildId: data.guildId,
      sessionId: uuidv4(),
      startTime: new Date(),
      initialState: {
        mood: data.mood,
        energy: data.energy,
        stress: data.stress,
        focus: data.focus,
        context: data.context,
        description: data.description
      },
      therapyGoals: data.goals || [],
      recommendations: [],
      progressionPath: [],
      adaptiveAdjustments: [],
      longTermProgress: []
    });
    
    // Generate initial recommendations
    await this.generateTherapeuticRecommendations(session);
    
    await session.save();
    return session;
  }
  
  private async generateTherapeuticRecommendations(session: IMusicTherapy): Promise<void> {
    const { mood, energy, stress, focus, context } = session.initialState;
    
    // Get user's musical DNA for personalization
    const musicalDNA = await MusicalDNA.findOne({ 
      userId: session.userId, 
      guildId: session.guildId 
    });
    
    // Determine therapeutic approach
    const primaryConcern = this.identifyPrimaryConcern(mood, energy, stress, focus);
    const therapeuticPlan = this.createTherapeuticPlan(primaryConcern, context, musicalDNA);
    
    // Generate recommendations
    for (const recommendation of therapeuticPlan) {
      session.recommendations.push({
        trackId: uuidv4(),
        title: recommendation.title,
        artist: recommendation.artist,
        therapeuticPurpose: recommendation.purpose,
        scientificBasis: recommendation.scientificBasis,
        expectedEffect: recommendation.expectedEffect
      });
    }
  }
  
  private identifyPrimaryConcern(mood: string, energy: number, stress: number, focus: number): string {
    const concerns: any[] = [];
    
    if (stress > 7) concerns.push({ type: 'stress', severity: stress });
    if (energy < 3) concerns.push({ type: 'depression', severity: 10 - energy });
    if (focus < 4) concerns.push({ type: 'focus', severity: 10 - focus });
    if (mood.includes('anxious') || mood.includes('nervous')) {
      concerns.push({ type: 'anxiety', severity: 8 });
    }
    if (mood.includes('tired') || mood.includes('sleep')) {
      concerns.push({ type: 'sleep', severity: 7 });
    }
    
    if (concerns.length === 0) return 'general_wellness';
    
    return concerns.sort((a, b) => b.severity - a.severity)[0].type;
  }
  
  private createTherapeuticPlan(concern: string, context: string, musicalDNA: any): any[] {
    const baseRecommendations = this.therapeuticDatabase[concern as keyof typeof this.therapeuticDatabase];
    if (!baseRecommendations) return [];
    
    const plan: any[] = [];
    
    // Customize based on context
    let tracks = [...baseRecommendations.tracks];
    
    if (context === 'work' || context === 'study') {
      tracks = tracks.filter(t => t.bpm >= 70 && t.bpm <= 100);
    } else if (context === 'exercise') {
      tracks = tracks.filter(t => t.bpm >= 120);
    } else if (context === 'relax' || context === 'sleep') {
      tracks = tracks.filter(t => t.bpm <= 80);
    }
    
    // Personalize based on musical DNA
    if (musicalDNA) {
      tracks = this.personalizeWithDNA(tracks, musicalDNA);
    }
    
    // Create progression
    baseRecommendations.progression.forEach((stage, index) => {
      const track = tracks[index % tracks.length];
      plan.push({
        ...track,
        purpose: `${concern} therapy - ${stage}`,
        expectedEffect: this.getExpectedEffect(stage, concern),
        order: index
      });
    });
    
    return plan;
  }
  
  private personalizeWithDNA(tracks: any[], musicalDNA: any): any[] {
    // Filter tracks based on user's BPM preferences
    const preferredBPM = musicalDNA.preferredBPM;
    
    return tracks.filter(track => 
      track.bpm >= preferredBPM.min - 20 && 
      track.bpm <= preferredBPM.max + 20
    ).sort((a, b) => {
      // Prefer tracks closer to user's peak BPM
      const distanceA = Math.abs(a.bpm - preferredBPM.peak);
      const distanceB = Math.abs(b.bpm - preferredBPM.peak);
      return distanceA - distanceB;
    });
  }
  
  private getExpectedEffect(stage: string, concern: string): string {
    const effects: { [key: string]: { [key: string]: string } } = {
      anxiety: {
        calming: "Reduced heart rate and muscle tension",
        grounding: "Increased present-moment awareness",
        stabilizing: "Emotional regulation improvement",
        empowering: "Confidence and control restoration"
      },
      depression: {
        acknowledgment: "Validation of current emotional state",
        companionship: "Reduced isolation feelings",
        "gentle uplift": "Gradual mood elevation",
        hope: "Optimism and future-focus enhancement"
      },
      focus: {
        settling: "Mental chatter reduction",
        focusing: "Attention consolidation",
        deepening: "Enhanced concentration depth",
        sustaining: "Extended focus maintenance"
      },
      stress: {
        acknowledgment: "Stress recognition and acceptance",
        release: "Tension discharge",
        cleansing: "Mental clarity restoration",
        renewal: "Energy and motivation revival"
      }
    };
    
    return effects[concern]?.[stage] || "General well-being improvement";
  }
  
  async updateSessionProgress(
    sessionId: string,
    data: {
      currentMood: string;
      trackPlaying: string;
      biometricData?: {
        heartRate?: number;
        stressLevel?: number;
      };
    }
  ): Promise<IMusicTherapy | null> {
    const session = await MusicTherapy.findOne({ sessionId });
    if (!session) return null;
    
    session.progressionPath.push({
      timestamp: new Date(),
      currentMood: data.currentMood,
      trackPlaying: data.trackPlaying,
      biometricData: data.biometricData
    });
    
    // Adaptive recommendations based on progress
    await this.makeAdaptiveAdjustments(session, data);
    
    await session.save();
    return session;
  }
  
  private async makeAdaptiveAdjustments(session: IMusicTherapy, currentData: any): Promise<void> {
    const recentProgress = session.progressionPath.slice(-3); // Last 3 data points
    
    if (recentProgress.length < 2) return;
    
    // Analyze if therapy is working
    const moodProgression = recentProgress.map(p => this.moodToScore(p.currentMood));
    const isImproving = moodProgression[moodProgression.length - 1] > moodProgression[0];
    
    if (!isImproving) {
      // Current approach isn't working, adjust
      const adjustment = await this.generateAdjustment(session, currentData);
      
      session.adaptiveAdjustments.push({
        timestamp: new Date(),
        reason: "Insufficient progress detected",
        adjustment: adjustment.description,
        newRecommendation: adjustment.newTrack
      });
      
      // Add new recommendation
      if (adjustment.newTrack) {
        session.recommendations.push({
          trackId: uuidv4(),
          title: adjustment.newTrack.title,
          artist: adjustment.newTrack.artist,
          therapeuticPurpose: adjustment.newTrack.purpose,
          scientificBasis: adjustment.newTrack.scientificBasis,
          expectedEffect: adjustment.newTrack.expectedEffect
        });
      }
    }
  }
  
  private moodToScore(mood: string): number {
    const moodScores: { [key: string]: number } = {
      'terrible': 1, 'awful': 2, 'bad': 3, 'sad': 4, 'down': 4,
      'okay': 5, 'neutral': 5, 'fine': 6,
      'good': 7, 'happy': 8, 'great': 9, 'amazing': 10
    };
    
    return moodScores[mood.toLowerCase()] || 5;
  }
  
  private async generateAdjustment(session: IMusicTherapy, currentData: any): Promise<any> {
    // Analyze what's not working
    const initialConcern = this.identifyPrimaryConcern(
      session.initialState.mood,
      session.initialState.energy,
      session.initialState.stress,
      session.initialState.focus
    );
    
    // Try different therapeutic approach
    const alternativeApproaches = {
      anxiety: 'meditation',
      depression: 'upbeat',
      focus: 'binaural',
      stress: 'nature',
      sleep: 'brown_noise'
    };
    
    const newApproach = alternativeApproaches[initialConcern as keyof typeof alternativeApproaches] || 'mindfulness';
    
    return {
      description: `Switching to ${newApproach} approach due to limited progress`,
      newTrack: this.getAlternativeTrack(newApproach, session.initialState.context)
    };
  }
  
  private getAlternativeTrack(approach: string, context: string): any {
    const alternatives: { [key: string]: any } = {
      meditation: {
        title: "Tibetan Singing Bowls",
        artist: "Various Artists",
        purpose: "Deep meditation induction",
        scientificBasis: "Sound frequencies promote theta brain waves",
        expectedEffect: "Enhanced mindfulness and inner peace"
      },
      upbeat: {
        title: "Walking on Sunshine",
        artist: "Katrina and the Waves",
        purpose: "Mood elevation through tempo",
        scientificBasis: "Upbeat rhythms stimulate dopamine release",
        expectedEffect: "Increased energy and positive emotions"
      },
      binaural: {
        title: "40Hz Gamma Waves",
        artist: "Binaural Beats",
        purpose: "Cognitive enhancement",
        scientificBasis: "Gamma waves improve focus and memory",
        expectedEffect: "Enhanced mental clarity and concentration"
      },
      nature: {
        title: "Ocean Waves",
        artist: "Nature Sounds",
        purpose: "Natural stress relief",
        scientificBasis: "Natural sounds activate parasympathetic nervous system",
        expectedEffect: "Deep relaxation and stress reduction"
      },
      brown_noise: {
        title: "Brown Noise",
        artist: "White Noise Generator",
        purpose: "Sleep induction",
        scientificBasis: "Low-frequency noise masks disruptive sounds",
        expectedEffect: "Faster sleep onset and deeper rest"
      }
    };
    
    return alternatives[approach] || alternatives.meditation;
  }
  
  async endTherapySession(
    sessionId: string,
    finalState: {
      mood: string;
      energy: number;
      stress: number;
      focus: number;
      satisfaction: number;
      notes?: string;
    }
  ): Promise<IMusicTherapy | null> {
    const session = await MusicTherapy.findOne({ sessionId });
    if (!session) return null;
    
    session.endTime = new Date();
    session.finalState = finalState;
    
    // Calculate effectiveness of recommendations
    session.recommendations.forEach(rec => {
      rec.effectiveness = this.calculateEffectiveness(session, rec);
    });
    
    // Update long-term progress
    await this.updateLongTermProgress(session);
    
    await session.save();
    return session;
  }
  
  private calculateEffectiveness(session: IMusicTherapy, recommendation: any): number {
    if (!session.finalState) return 5; // Default
    
    const initialMoodScore = this.moodToScore(session.initialState.mood);
    const finalMoodScore = this.moodToScore(session.finalState.mood);
    
    const improvement = finalMoodScore - initialMoodScore;
    const stressReduction = session.initialState.stress - session.finalState.stress;
    const energyChange = Math.abs(session.finalState.energy - 5) - Math.abs(session.initialState.energy - 5); // Closer to 5 is better
    
    const effectiveness = 5 + (improvement * 0.5) + (stressReduction * 0.3) + (energyChange * 0.2);
    return Math.max(1, Math.min(10, Math.round(effectiveness)));
  }
  
  private async updateLongTermProgress(session: IMusicTherapy): Promise<void> {
    if (!session.finalState) return;
    
    const weekNumber = Math.floor((Date.now() - new Date(session.startTime).getTime()) / (7 * 24 * 60 * 60 * 1000));
    
    const initialMoodScore = this.moodToScore(session.initialState.mood);
    const finalMoodScore = this.moodToScore(session.finalState.mood);
    const moodImprovement = finalMoodScore - initialMoodScore;
    
    // Find or create week entry
    let weekEntry = session.longTermProgress.find(p => p.week === weekNumber);
    if (!weekEntry) {
      weekEntry = {
        week: weekNumber,
        averageMoodImprovement: 0,
        preferredTherapeuticGenres: [],
        mostEffectiveTechniques: []
      };
      session.longTermProgress.push(weekEntry);
    }
    
    // Update averages (simplified)
    weekEntry.averageMoodImprovement = (weekEntry.averageMoodImprovement + moodImprovement) / 2;
    
    // Track effective techniques
    const effectiveRecs = session.recommendations.filter(r => (r.effectiveness || 0) > 7);
    effectiveRecs.forEach(rec => {
      if (!weekEntry?.mostEffectiveTechniques?.includes(rec.therapeuticPurpose)) {
        weekEntry?.mostEffectiveTechniques?.push(rec.therapeuticPurpose);
      }
    });
  }
  
  async getTherapyInsights(userId: string, guildId: string): Promise<any> {
    const sessions = await MusicTherapy.find({ userId, guildId })
      .sort({ startTime: -1 })
      .limit(20);
    
    if (sessions.length === 0) return null;
    
    const completedSessions = sessions.filter(s => s.finalState);
    
    const insights = {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      averageImprovement: this.calculateAverageImprovement(completedSessions),
      mostEffectiveApproaches: this.findMostEffectiveApproaches(completedSessions),
      commonConcerns: this.identifyCommonConcerns(sessions),
      progressTrend: this.calculateProgressTrend(completedSessions),
      personalizedRecommendations: await this.generatePersonalizedRecommendations(userId, guildId, sessions)
    };
    
    return insights;
  }
  
  private calculateAverageImprovement(sessions: IMusicTherapy[]): number {
    if (sessions.length === 0) return 0;
    
    const improvements = sessions.map(s => {
      const initial = this.moodToScore(s.initialState.mood);
      const final = s.finalState ? this.moodToScore(s.finalState.mood) : initial;
      return final - initial;
    });
    
    return improvements.reduce((a, b) => a + b, 0) / improvements.length;
  }
  
  private findMostEffectiveApproaches(sessions: IMusicTherapy[]): string[] {
    const effectiveness: { [key: string]: number[] } = {};
    
    sessions.forEach(session => {
      session.recommendations.forEach(rec => {
        if (rec.effectiveness) {
          if (!effectiveness[rec.therapeuticPurpose]) {
            effectiveness[rec.therapeuticPurpose] = [];
          }
          effectiveness[rec.therapeuticPurpose].push(rec.effectiveness);
        }
      });
    });
    
    return Object.entries(effectiveness)
      .map(([approach, scores]) => ({
        approach,
        avgEffectiveness: scores.reduce((a, b) => a + b, 0) / scores.length
      }))
      .sort((a, b) => b.avgEffectiveness - a.avgEffectiveness)
      .slice(0, 3)
      .map(item => item.approach);
  }
  
  private identifyCommonConcerns(sessions: IMusicTherapy[]): string[] {
    const concerns: { [key: string]: number } = {};
    
    sessions.forEach(session => {
      const concern = this.identifyPrimaryConcern(
        session.initialState.mood,
        session.initialState.energy,
        session.initialState.stress,
        session.initialState.focus
      );
      concerns[concern] = (concerns[concern] || 0) + 1;
    });
    
    return Object.entries(concerns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([concern]) => concern);
  }
  
  private calculateProgressTrend(sessions: IMusicTherapy[]): string {
    if (sessions.length < 3) return 'insufficient_data';
    
    const recentImprovements = sessions.slice(0, 5).map(s => {
      const initial = this.moodToScore(s.initialState.mood);
      const final = s.finalState ? this.moodToScore(s.finalState.mood) : initial;
      return final - initial;
    });
    
    const olderImprovements = sessions.slice(-5).map(s => {
      const initial = this.moodToScore(s.initialState.mood);
      const final = s.finalState ? this.moodToScore(s.finalState.mood) : initial;
      return final - initial;
    });
    
    const recentAvg = recentImprovements.reduce((a, b) => a + b, 0) / recentImprovements.length;
    const olderAvg = olderImprovements.reduce((a, b) => a + b, 0) / olderImprovements.length;
    
    if (recentAvg > olderAvg + 0.5) return 'improving';
    if (recentAvg < olderAvg - 0.5) return 'declining';
    return 'stable';
  }
  
  private async generatePersonalizedRecommendations(
    userId: string, 
    guildId: string, 
    sessions: IMusicTherapy[]
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    const commonConcerns = this.identifyCommonConcerns(sessions);
    const effectiveApproaches = this.findMostEffectiveApproaches(sessions.filter(s => s.finalState));
    
    if (commonConcerns.includes('anxiety')) {
      recommendations.push("Consider scheduled anxiety management sessions");
    }
    
    if (effectiveApproaches.includes('meditation')) {
      recommendations.push("Meditation-based music therapy works well for you");
    }
    
    if (sessions.length > 10) {
      recommendations.push("You're building good therapeutic habits - keep it up!");
    }
    
    return recommendations;
  }
}
