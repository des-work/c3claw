import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldX } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'ALL SYSTEMS GO':
        return {
          bg: 'bg-success/10',
          border: 'border-success/80',
          text: 'text-success drop-shadow-[0_0_3px_rgba(0,255,159,0.4)]',
          icon: <CheckCircle2 className="w-5 h-5 text-success" />,
          glow: 'shadow-[inset_0_0_10px_rgba(0,255,159,0.1)]'
        };
      case 'DEGRADED':
        return {
          bg: 'bg-warning/10',
          border: 'border-warning/80',
          text: 'text-warning drop-shadow-[0_0_3px_rgba(255,184,0,0.4)]',
          icon: <AlertTriangle className="w-5 h-5 text-warning" />,
          glow: 'shadow-[inset_0_0_10px_rgba(255,184,0,0.1)]'
        };
      case 'CRITICAL':
        return {
          bg: 'bg-danger/20',
          border: 'border-danger',
          text: 'text-danger font-black drop-shadow-[0_0_5px_rgba(255,71,87,0.8)] animate-pulse',
          icon: <ShieldX className="w-5 h-5 text-danger animate-pulse" />,
          glow: 'shadow-[inset_0_0_20px_rgba(255,71,87,0.4),0_0_10px_rgba(255,71,87,0.4)] border-[3px]'
        };
      default:
        return {
          bg: 'bg-surface/50',
          border: 'border-muted/50',
          text: 'text-muted',
          icon: null,
          glow: ''
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <div className={`flex items-center gap-3 px-5 py-2 rounded-sm border-2 uppercase transition-colors duration-500 ${style.bg} ${style.border} ${style.glow}`}>
      {style.icon}
      <span className={`font-mono text-sm tracking-[0.15em] font-bold ${style.text}`}>
        {status}
      </span>
    </div>
  );
};

export default StatusBadge;
