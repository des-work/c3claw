import React from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import HeaderBar from './HeaderBar';
import TopologyGallery from './TopologyGallery';
import ActivityFeed from './ActivityFeed';
import { Network } from 'lucide-react';
import { overallMachineStatus } from '../../shared/refresh-policy.js';

const App = () => {
  const { teams, events, loading, error, policy, generatedAt, pipelineHealth } = useDashboardData();

  // Compute the top-level operating status for the entire simulation
  const overallStatus = overallMachineStatus(teams, Boolean(error));

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-primary font-mono text-xl tracking-widest uppercase">
        <Network className="w-12 h-12 mb-6 animate-pulse" />
        <span className="animate-pulse">Loading status snapshot...</span>
      </div>
    );
  }

  return (
    <div className="dashboard-shell h-screen w-screen overflow-hidden flex flex-col bg-background">
      {/* 1. HEADER ZONE (Fixed Top) */}
      <HeaderBar teams={teams} overallStatus={overallStatus} />

      {/* The gallery is the primary monitoring surface. */}
      <div className="dashboard-main flex-1 min-h-0 p-3 md:p-5">
        <div className="h-full min-h-0">
          {error && <div className="topology-error" role="alert">Telemetry refresh unavailable: {error}. Showing the last received snapshot.</div>}
          {!error && pipelineHealth?.status === 'degraded' && <div className="topology-error" role="status">Source feed needs attention. Check service health before relying on this snapshot.</div>}
          <TopologyGallery teams={teams} policy={policy} generatedAt={generatedAt} />
        </div>
      </div>

      {/* 3. ACTIVITY FEED ZONE (Fixed Bottom Strip) */}
      <div className="dashboard-feed h-40 md:h-44 border-t border-surface bg-background shrink-0 z-10">
        <ActivityFeed events={events} />
      </div>
    </div>
  );
};

export default App;
