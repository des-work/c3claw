import React, { useMemo } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import HeaderBar from './HeaderBar';
import TeamList from './TeamList';
import ActivityFeed from './ActivityFeed';
import { Network } from 'lucide-react';

const App = () => {
  const { teams, events, loading, error } = useDashboardData();

  // Compute the top-level operating status for the entire simulation
  const overallStatus = useMemo(() => {
    if (!teams || teams.length === 0) return 'UNKNOWN';
    const hasOffline = teams.some(t => t.status === 'offline');
    const hasDegraded = teams.some(t => t.status === 'degraded');
    
    if (hasOffline) return 'CRITICAL';
    if (hasDegraded) return 'DEGRADED';
    return 'ALL SYSTEMS GO';
  }, [teams]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-primary font-mono text-xl tracking-widest uppercase">
        <Network className="w-12 h-12 mb-6 animate-pulse" />
        <span className="animate-pulse">Initializing Secure Uplink...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background">
      {/* 1. HEADER ZONE (Fixed Top) */}
      <HeaderBar teams={teams} overallStatus={overallStatus} />

      {/* 2. MAIN BODY ZONE (Flex-1 for constrained scaling) */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full bg-surface/20 border border-surface/50 rounded-lg shadow-2xl flex flex-col">
           <TeamList teams={teams} />
        </div>
      </div>

      {/* 3. ACTIVITY FEED ZONE (Fixed Bottom Strip) */}
      <div className="h-56 border-t-[3px] border-surface bg-background shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
        <ActivityFeed events={events} />
      </div>
    </div>
  );
};

export default App;
