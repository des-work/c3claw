import React, { useState, useEffect } from 'react';
import { Crosshair, Clock } from 'lucide-react';
import StatusBadge from './StatusBadge';

const HeaderBar = ({ teams, overallStatus }) => {
  const [time, setTime] = useState(new Date());

  // Live clock updates every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const machines = teams ? teams.flatMap(team => team.machines || []) : [];
  const hasInventory = machines.length > 0;
  const onlineCount = hasInventory ? machines.filter(machine => machine.status === 'online').length
    : (teams || []).filter(team => team.status === 'online').length;
  const totalCount = hasInventory ? machines.length : (teams || []).length;

  return (
    <div className="min-h-16 border-b border-surface/80 bg-surface/30 px-3 md:px-6 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-20">
      {/* 1. Dashboard Title */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded border border-primary/30 text-primary shadow-[0_0_10px_rgba(77,154,255,0.2)]">
          <Crosshair className="w-6 h-6 animate-[spin_4s_linear_infinite] motion-reduce:animate-none" />
        </div>
        <h1 className="text-sm md:text-xl font-bold tracking-[0.12em] md:tracking-[0.2em] text-white uppercase text-shadow-sm">
          Operation Claw & Order
        </h1>
      </div>

      {/* 2. Metrics & Clock & Badge */}
      <div className="flex items-center gap-3 md:gap-8 flex-wrap">
        {/* Fleet Machine Metric */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-muted tracking-widest uppercase mb-0.5">{hasInventory ? 'Machines online' : 'Teams online'}</span>
          <span className="font-mono font-bold text-lg leading-none">
            <span className={totalCount > 0 && onlineCount === totalCount ? 'text-success drop-shadow-[0_0_5px_rgba(0,255,159,0.5)]' : 'text-warning drop-shadow-[0_0_5px_rgba(255,184,0,0.5)]'}>
              {onlineCount}
            </span>
            <span className="text-muted"> / {totalCount}</span>
          </span>
        </div>

        {/* Live Clock Component */}
        <div className="flex bg-[#070b14] px-4 py-2 rounded border border-surface/80 items-center justify-center gap-2 font-mono shadow-inner shadow-black/50">
          <Clock className="w-4 h-4 text-primary opacity-80" />
          <span className="text-lg tracking-widest font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        {/* Status Badge */}
        <StatusBadge status={overallStatus} />
      </div>
    </div>
  );
};

export default HeaderBar;
