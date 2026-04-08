import React from 'react';
import { ChevronRight } from 'lucide-react';

const EventRow = ({ event }) => {
  const getResultColor = (result) => {
    switch (result) {
      case 'SUCCESS': return 'text-success drop-shadow-[0_0_2px_rgba(0,255,159,0.8)]';
      case 'FAILED': return 'text-warning drop-shadow-[0_0_2px_rgba(255,184,0,0.8)]';
      case 'BLOCKED': return 'text-danger font-black drop-shadow-[0_0_3px_rgba(255,71,87,1)]';
      default: return 'text-muted';
    }
  };

  // Format with milliseconds for that high-frequency data feel
  const formattedTime = new Date(event.timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    fractionalSecondDigits: 3 
  });

  return (
    <div className="flex items-center gap-4 py-1 font-mono text-[11px] lg:text-xs leading-none hover:bg-surface/50 border-l-2 border-transparent hover:border-primary/50 transition-colors px-2 rounded-r">
      
      {/* 1. Precise Timestamp */}
      <div className="text-muted/80 shrink-0 flex items-center">
        <ChevronRight className="w-3 h-3 text-primary mr-1 opacity-70" />
        [{formattedTime}]
      </div>
      
      {/* 2. Team Entity */}
      <div className="text-white font-bold shrink-0 w-20 tracking-wider">
        {event.team_id}
      </div>
      
      {/* 3. Target Vector */}
      <div className="text-gray-300 shrink-0 w-32 truncate" title={event.target}>
        <span className="text-muted/60 mr-1.5">TGT:</span>
        {event.target}
      </div>

      {/* 4. Attack Method */}
      <div className="text-gray-100 shrink-0 w-32 truncate" title={event.tool}>
        <span className="text-muted/60 mr-1.5">VIA:</span>
        {event.tool}
      </div>

      {/* 5. Color-Coded Result Block */}
      <div className={`shrink-0 w-24 tracking-[0.1em] font-semibold ${getResultColor(event.result)}`}>
        [{event.result}]
      </div>
      
      {/* 6. Context Details */}
      <div className="text-gray-500 truncate flex-1" title={event.details}>
        // {event.details}
      </div>

    </div>
  );
};

export default EventRow;
