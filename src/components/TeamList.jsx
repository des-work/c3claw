import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import TeamRow from './TeamRow';

const TeamList = ({ teams }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // 5. Performance: Use useMemo to compute filtered teams
  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    if (!searchTerm) return teams;
    
    // 3. Filter logic: case-insensitive match on team_id
    const lowerSearch = searchTerm.toLowerCase();
    return teams.filter(val => val.team_id.toLowerCase().includes(lowerSearch));
  }, [teams, searchTerm]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* 1. Search Bar */}
      <div className="p-3 bg-surface/20 shrink-0 border-b border-surface/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0a0f1e] border border-surface/80 rounded block pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-muted outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono shadow-inner"
          />
        </div>
      </div>

      {/* Table Header Ribbon */}
      <div className="grid grid-cols-12 gap-4 items-center px-4 py-3 bg-[#0c1221] border-b-[3px] border-surface/80 text-[10px] tracking-widest text-muted uppercase font-black shrink-0 shadow-sm z-10">
        <div className="col-span-2">Designation</div>
        <div className="col-span-2">State</div>
        <div className="col-span-2">Incursion Phase</div>
        <div className="col-span-4">Active Operation</div>
        <div className="col-span-2 text-right">Telemetry Sync</div>
      </div>

      {/* High-Density Scrolling View */}
      <div className="flex-1 overflow-y-auto bg-background/50">
        {filteredTeams.length > 0 ? (
          // Render only filtered teams
          filteredTeams.map((team, index) => (
            <TeamRow key={team.team_id} team={team} index={index} />
          ))
        ) : teams && teams.length > 0 ? (
          // 4. Render "No teams found" message if search yields zero results
          <div className="flex flex-col items-center justify-center h-[200px] text-muted font-mono text-sm tracking-[0.2em] bg-surface/10 rounded m-4 border border-surface/40 border-dashed">
            <Search className="w-6 h-6 mb-3 opacity-30" />
            <div className="mb-1 opacity-80 font-bold">NO MATCHING DESIGNATIONS</div>
            <div className="opacity-50">No teams found matching "{searchTerm}"</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted font-mono text-sm tracking-[0.2em]">
            <div className="animate-pulse mb-2 opacity-50">SCANNING CHANNELS...</div>
            <div>NO SIGNAL DETECTED</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamList;
