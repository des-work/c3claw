// DEV ONLY — mock events for dashboard filtering UI tests
// Timestamps are computed relative to import time so team statuses
// (online/degraded/idle/offline) vary naturally across the team list.

function minsAgo(n) {
  return new Date(Date.now() - n * 60 * 1000).toISOString()
}

let _id = 1
function evt(team_id, tool, target, result, details, minutesAgo) {
  return {
    id: `seed_${_id++}`,
    team_id,
    timestamp: minsAgo(minutesAgo),
    tool,
    target,
    result,
    details: details ?? '',
  }
}

// ─── C4 teams ────────────────────────────────────────────────────────────────
const c4 = [
  evt('C4-Team_01', 'Nmap',       '10.4.1.0/24',  'SUCCESS', 'Host discovery complete',   1),
  evt('C4-Team_01', 'Gobuster',   '10.4.1.10',    'SUCCESS', '/admin found',               3),
  evt('C4-Team_01', 'Hydra',      '10.4.1.10',    'FAILED',  'No valid creds',             6),
  evt('C4-Team_02', 'Nmap',       '10.4.2.0/24',  'SUCCESS', 'Ports 22,80,443 open',      2),
  evt('C4-Team_02', 'Metasploit', '10.4.2.15',    'BLOCKED', 'IDS triggered on payload',  4),
]

// ─── Dev team ─────────────────────────────────────────────────────────────────
const dev = [
  evt('DEV_TEAM', 'Nmap',       '10.0.0.1',  'SUCCESS', 'Dev server connection verified', 0),
  evt('DEV_TEAM', 'Gobuster',   '10.0.0.1',  'SUCCESS', 'Found /api /dashboard',          1),
]

// ─── Numeric TEAM_XX ─────────────────────────────────────────────────────────
const numeric = [
  evt('TEAM_01', 'Nmap',       '10.0.1.0/24', 'SUCCESS', '12 hosts up',               2),
  evt('TEAM_01', 'Gobuster',   '10.0.1.5',    'FAILED',  'Connection refused',         7),

  evt('TEAM_02', 'Nmap',       '10.0.2.0/24', 'SUCCESS', 'Port scan complete',         1),
  evt('TEAM_02', 'Metasploit', '10.0.2.8',    'SUCCESS', 'Shell obtained',             3),
  evt('TEAM_02', 'Hydra',      '10.0.2.8',    'BLOCKED', 'Account locked after 5 attempts', 8),

  evt('TEAM_03', 'Nmap',       '10.0.3.1',    'SUCCESS', 'FTP 21 open',               10),
  evt('TEAM_03', 'Hydra',      '10.0.3.1',    'SUCCESS', 'FTP creds: anon/anon',      12),

  evt('TEAM_11', 'Gobuster',   '10.0.11.20',  'SUCCESS', 'Discovered /backup',         6),
  evt('TEAM_11', 'Metasploit', '10.0.11.20',  'BLOCKED', 'WAF blocked exploit',       18),
  evt('TEAM_11', 'Nmap',       '10.0.11.0/24','SUCCESS', 'Sweep done',                22),

  evt('TEAM_51', 'Nmap',       '10.0.51.0/24','SUCCESS', 'Subnet mapped',             25),
  evt('TEAM_51', 'Hydra',      '10.0.51.3',   'FAILED',  'SSH brute timed out',       30),

  evt('TEAM_77', 'Metasploit', '10.0.77.1',   'SUCCESS', 'Gained foothold',           35),
  evt('TEAM_77', 'Gobuster',   '10.0.77.1',   'SUCCESS', '/etc/passwd readable',      40),
  evt('TEAM_77', 'Nmap',       '10.0.77.0/24','SUCCESS', 'Initial recon done',        50),
]

// ─── TEAM_Fx ─────────────────────────────────────────────────────────────────
const fx = [
  evt('TEAM_F1', 'Nmap',       '10.1.1.0/24', 'SUCCESS', 'Firewall rules mapped',      3),
  evt('TEAM_F1', 'Gobuster',   '10.1.1.1',    'BLOCKED', 'Request filtered by proxy', 11),

  evt('TEAM_F5', 'Hydra',      '10.1.5.10',   'SUCCESS', 'Valid creds found',           4),
  evt('TEAM_F5', 'Metasploit', '10.1.5.10',   'SUCCESS', 'Privilege escalation done',  9),

  evt('TEAM_F6', 'Nmap',       '10.1.6.0/24', 'FAILED',  'Network unreachable',        7),
  evt('TEAM_F6', 'Gobuster',   '10.1.6.5',    'SUCCESS', 'Login portal at /portal',   16),
]

// ─── TEAM_Rx (includes mixed-case Team_R3 + TEAM_R3) ─────────────────────────
const rx = [
  evt('TEAM_R1', 'Nmap',       '10.2.1.0/24', 'SUCCESS', 'Red cell initial sweep',    2),
  evt('TEAM_R1', 'Metasploit', '10.2.1.7',    'FAILED',  'Exploit mismatch',          5),

  evt('TEAM_R2', 'Gobuster',   '10.2.2.1',    'SUCCESS', '/admin /config found',       3),
  evt('TEAM_R2', 'Hydra',      '10.2.2.1',    'BLOCKED', 'IP banned mid-attack',      14),

  // Intentional case variants to stress-test the class filter
  evt('Team_R3', 'Nmap',       '10.2.3.0/24', 'SUCCESS', 'Mixed-case team ID',         8),
  evt('TEAM_R3', 'Gobuster',   '10.2.3.4',    'SUCCESS', 'Same subnet, caps variant', 19),
  evt('TEAM_R3', 'Hydra',      '10.2.3.4',    'FAILED',  'Timeout',                  21),
]

// ─── TEAM_Tx ─────────────────────────────────────────────────────────────────
const tx = [
  evt('TEAM_T1', 'Nmap',       '10.3.1.0/24', 'SUCCESS', 'Topology mapped',           1),
  evt('TEAM_T1', 'Metasploit', '10.3.1.9',    'SUCCESS', 'Lateral movement via SMB',  4),

  evt('TEAM_T2', 'Gobuster',   '10.3.2.5',    'FAILED',  '403 on all dirs',           6),
  evt('TEAM_T2', 'Hydra',      '10.3.2.5',    'BLOCKED', 'Account locked',            9),
  evt('TEAM_T2', 'Nmap',       '10.3.2.0/24', 'SUCCESS', 'Services enumerated',      13),
]

export const seedEvents = [
  ...c4,
  ...dev,
  ...numeric,
  ...fx,
  ...rx,
  ...tx,
]
