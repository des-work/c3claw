import React, { useRef, useEffect } from 'react';
import EventRow from './EventRow';
import { Activity } from 'lucide-react';

const ActivityFeed = ({ events }) => {
  const feedEndRef = useRef(null);

  // Auto-scroll to the newest event when telemetry data updates
  useEffect(() => {
    if (feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  // Ensure we strictly show only the 20 most recent events
  const latestEvents = events ? events.slice(-20) : [];

  return (
    <div className="h-full flex flex-col font-mono bg-[#050810]">
      {/* 1. Header Ribbon */}
      <div className="h-8 border-b-[2px] border-surface/80 bg-surface/30 flex items-center px-4 gap-2 shrink-0 text-muted uppercase text-xs tracking-[0.2em] font-bold shadow-sm z-10">
        <Activity className="w-3.5 h-3.5 text-primary" />
        Live Telemetry Feed
        <span className="ml-auto text-[10px] opacity-50">MAX_EVENTS: 20</span>
      </div>

      {/* 2. Scrolling Terminal Window */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar shadow-inner relative">
        {latestEvents.length > 0 ? (
          latestEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))
        ) : (
          <div className="text-muted text-sm opacity-50 italic">Waiting for incoming telemetry...</div>
        )}
        
        {/* Invisible anchor element for auto-scrolling */}
        <div ref={feedEndRef} className="h-1" />
      </div>
    </div>
  );
};

export default ActivityFeed;
