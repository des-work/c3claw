import React, { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import TeamRow from './TeamRow';

// Extracts the professor prefix from a team_id, tolerating common formatting issues:
//   Nestler_01       → "Nestler"   (standard)
//   Nestler_Team4    → "Nestler"   (team label instead of number)
//   Nestler4910_Team4→ "Nestler"   (course number appended to name)
//   MCintrye-7       → "MCintrye"  (dash instead of underscore)
// Returns null for reserved prefixes (TEAM, DEV, TEST) and unrecognized formats.
const RESERVED_PREFIXES = ['TEAM', 'DEV', 'TEST'];
function extractProf(teamId) {
  const match = teamId.match(/^([A-Za-z]{3,})\d*[_-]/);
  if (!match) return null;
  if (RESERVED_PREFIXES.includes(match[1].toUpperCase())) return null;
  return match[1];
}

const TeamList = ({ teams }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');

  // Fixed professor list — tabs always show even before a professor's teams have data.
  // extractProf still handles grouping wonky team names under the right professor.
  const PROFESSORS = ['Brown', 'Flores', 'McIntyre', 'Nestler'];
  const detectedClasses = ['ALL', ...PROFESSORS];

  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    return teams.filter(team => {
      const matchesSearch = !searchTerm ||
        team.team_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = selectedClass === 'ALL' ||
        extractProf(team.team_id)?.toLowerCase() === selectedClass.toLowerCase();
      return matchesSearch && matchesClass;
    });
  }, [teams, searchTerm, selectedClass]);

  const hasClassPrefixes = detectedClasses.length > 1;

  return (
    <div className="flex flex-col h-full overflow-hidden relative">

      {/* Search + Class Filter Bar */}
      <div className="p-3 bg-surface/20 shrink-0 border-b border-surface/50 flex gap-3">

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0a0f1e] border border-surface/80 rounded block pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-muted outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono shadow-inner"
          />
        </div>

        {/* Class Filter — only shows when class prefixes are detected */}
        {hasClassPrefixes && (
          <div className="relative flex items-center gap-2 shrink-0">
            <Filter className="w-4 h-4 text-muted" />
            <div className="flex gap-1">
              {detectedClasses.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded border transition-all duration-150
                    ${selectedClass === cls
                      ? 'bg-primary/20 border-primary text-primary shadow-[0_0_8px_rgba(0,200,255,0.3)]'
                      : 'bg-surface/40 border-surface/60 text-muted hover:border-primary/40 hover:text-gray-300'
                    }`}
                >
                  {cls === 'ALL' ? 'All' : cls}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Table Header Ribbon */}
      <div className="grid grid-cols-12 gap-4 items-center px-4 py-3 bg-[#0c1221] border-b-[3px] border-surface/80 text-[10px] tracking-widest text-muted uppercase font-black shrink-0 shadow-sm z-10">
        <div className="col-span-2">Designation</div>
        <div className="col-span-2">State</div>
        <div className="col-span-2">Incursion Phase</div>
        <div className="col-span-4">Active Operation</div>
        <div className="col-span-2 text-right">Telemetry Sync</div>
      </div>

      {/* Team Rows */}
      <div className="flex-1 overflow-y-auto bg-background/50">
        {filteredTeams.length > 0 ? (
          filteredTeams.map((team, index) => (
            <TeamRow key={team.team_id} team={team} index={index} />
          ))
        ) : teams && teams.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted font-mono text-sm tracking-[0.2em] bg-surface/10 rounded m-4 border border-surface/40 border-dashed">
            <Search className="w-6 h-6 mb-3 opacity-30" />
            <div className="mb-1 opacity-80 font-bold">NO MATCHING DESIGNATIONS</div>
            <div className="opacity-50">
              {selectedClass !== 'ALL'
                ? `No teams found in ${selectedClass}`
                : `No teams found matching "${searchTerm}"`}
            </div>
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
