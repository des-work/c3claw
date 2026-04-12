import React, { useState, useEffect } from 'react';
import { ShieldAlert, Terminal } from 'lucide-react';

const TeamRow = ({ team }) => {
  const [lastSeenStr, setLastSeenStr] = useState("");

  // Live updating "time ago" string
  useEffect(() => {
    const updateTime = () => {
      const diffInSeconds = Math.floor((new Date() - new Date(team.last_seen)) / 1000);
      if (diffInSeconds < 60) setLastSeenStr(`${diffInSeconds}s ago`);
      else if (diffInSeconds < 3600) setLastSeenStr(`${Math.floor(diffInSeconds / 60)}m ago`);
      else setLastSeenStr(`${Math.floor(diffInSeconds / 3600)}h ${Math.floor((diffInSeconds % 3600) / 60)}m ago`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [team.last_seen]);

  const getStatusClasses = (status) => {
    switch (status) {
      case 'online':   return 'text-success bg-success/10 border-success/30';
      case 'degraded': return 'text-warning bg-warning/10 border-warning/30';
      case 'idle':     return 'text-warning bg-warning/10 border-warning/30';
      case 'offline':  return 'text-danger bg-danger/10 border-danger/30';
      default:         return 'text-muted bg-surface border-muted/30';
    }
  };

  const statusClasses = getStatusClasses(team.status);

  return (
    <div className={`grid grid-cols-12 gap-4 items-center px-4 py-2 border-b border-surface/50 hover:bg-surface/40 transition-colors duration-200 text-sm`}>
      {/* 1. Team ID */}
      <div className="col-span-2 font-bold text-white tracking-widest text-base flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${team.status === 'online' ? 'bg-success animate-pulse' : team.status === 'degraded' ? 'bg-warning' : team.status === 'idle' ? 'bg-warning' : team.status === 'offline' ? 'bg-danger' : 'bg-muted'}`}></span>
        {team.team_id}
      </div>

      {/* 2. Status */}
      <div className="col-span-2">
        <span className={`px-2 py-0.5 uppercase text-xs tracking-wider border rounded-sm font-semibold ${statusClasses}`}>
          {team.status}
        </span>
      </div>

      {/* 3. Phase */}
      <div className="col-span-2 flex items-center gap-2">
        <span className="text-muted text-xs font-mono">PHASE {team.phase}</span>
        <div className="flex gap-1">
          {[1, 2, 3].map(p => (
            <div 
              key={p} 
              className={`h-2 w-4 rounded-sm ${p <= team.phase ? (team.status === 'online' ? 'bg-primary' : team.status === 'degraded' ? 'bg-warning' : team.status === 'idle' ? 'bg-warning' : team.status === 'offline' ? 'bg-danger' : 'bg-muted') : 'bg-surface'}`}
            ></div>
          ))}
        </div>
      </div>

      {/* 4. Last Action */}
      <div className="col-span-4 font-mono text-gray-300 truncate flex items-center gap-2">
        <Terminal className="w-3 h-3 text-muted shrink-0" />
        <span className="truncate">{team.last_action || "IDLE"}</span>
      </div>

      {/* 5. Blocked Count & Last Seen */}
      <div className="col-span-2 flex justify-end items-center gap-3 font-mono text-xs">
        {team.blocked_count > 0 && (
          <div className="text-danger flex items-center justify-center gap-1 bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20 font-bold" title={`${team.blocked_count} Actions Blocked`}>
            <ShieldAlert className="w-3 h-3" />
            {team.blocked_count}
          </div>
        )}
        <span className="text-muted text-right min-w-[50px]">
          {lastSeenStr}
        </span>
      </div>
    </div>
  );
};

export default TeamRow;
