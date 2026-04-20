export const mockTeams = [
  { team_id: "TEAM_01", status: "online", phase: 2, last_action: "nmap -sS -p- 10.0.1.5", last_seen: new Date(Date.now() - 5000).toISOString(), cidr: "10.0.1.0/24", blocked_count: 0, event_count: 142 },
  { team_id: "TEAM_02", status: "online", phase: 3, last_action: "Exfiltrating SAM database", last_seen: new Date(Date.now() - 2000).toISOString(), cidr: "10.0.2.0/24", blocked_count: 2, event_count: 310 },
  { team_id: "TEAM_03", status: "degraded", phase: 1, last_action: "ping 10.0.3.1 -c 4", last_seen: new Date(Date.now() - 45000).toISOString(), cidr: "10.0.3.0/24", blocked_count: 5, event_count: 24 },
  { team_id: "TEAM_04", status: "offline", phase: 1, last_action: "Connection timeout", last_seen: new Date(Date.now() - 600000).toISOString(), cidr: "10.0.4.0/24", blocked_count: 0, event_count: 5 },
  { team_id: "TEAM_05", status: "online", phase: 2, last_action: "Hydra ssh brute force", last_seen: new Date(Date.now() - 1000).toISOString(), cidr: "10.0.5.0/24", blocked_count: 12, event_count: 540 },
  { team_id: "TEAM_06", status: "unknown", phase: 1, last_action: "Establishing proxy", last_seen: new Date(Date.now() - 120000).toISOString(), cidr: "10.0.6.0/24", blocked_count: 0, event_count: 0 },
  { team_id: "TEAM_07", status: "online", phase: 3, last_action: "Pivoting via proxychains", last_seen: new Date(Date.now() - 3000).toISOString(), cidr: "10.0.7.0/24", blocked_count: 1, event_count: 215 },
  { team_id: "TEAM_08", status: "degraded", phase: 2, last_action: "SQL injection payload", last_seen: new Date(Date.now() - 15000).toISOString(), cidr: "10.0.8.0/24", blocked_count: 8, event_count: 89 },
  { team_id: "TEAM_09", status: "online", phase: 1, last_action: "Subdomain enumeration", last_seen: new Date(Date.now() - 4000).toISOString(), cidr: "10.0.9.0/24", blocked_count: 0, event_count: 67 },
  { team_id: "TEAM_10", status: "offline", phase: 3, last_action: "Process killed", last_seen: new Date(Date.now() - 300000).toISOString(), cidr: "10.0.10.0/24", blocked_count: 4, event_count: 450 },
  { team_id: "TEAM_11", status: "online", phase: 2, last_action: "Metasploit handler active", last_seen: new Date(Date.now() - 500).toISOString(), cidr: "10.0.11.0/24", blocked_count: 3, event_count: 188 },
  { team_id: "TEAM_12", status: "online", phase: 1, last_action: "Directory busting (Gobuster)", last_seen: new Date(Date.now() - 8000).toISOString(), cidr: "10.0.12.0/24", blocked_count: 0, event_count: 112 },

  // ── NES teams ──────────────────────────────────────────────────────────────
  { team_id: "NES_01", status: "online",   phase: 2, last_action: "nmap -sV 10.0.1.0/24",          last_seen: new Date(Date.now() - 3000).toISOString(),   cidr: "10.0.1.0/24",  blocked_count: 0, event_count: 88 },
  { team_id: "NES_02", status: "online",   phase: 1, last_action: "Gobuster directory scan",        last_seen: new Date(Date.now() - 6000).toISOString(),   cidr: "10.0.2.0/24",  blocked_count: 1, event_count: 47 },
  { team_id: "NES_03", status: "degraded", phase: 2, last_action: "Hydra SSH brute force",          last_seen: new Date(Date.now() - 90000).toISOString(),  cidr: "10.0.3.0/24",  blocked_count: 4, event_count: 31 },
  { team_id: "NES_04", status: "offline",  phase: 1, last_action: "Connection timeout",             last_seen: new Date(Date.now() - 720000).toISOString(), cidr: "10.0.4.0/24",  blocked_count: 0, event_count: 9 },
  { team_id: "NES_05", status: "online",   phase: 3, last_action: "Metasploit handler active",      last_seen: new Date(Date.now() - 1000).toISOString(),   cidr: "10.0.5.0/24",  blocked_count: 2, event_count: 204 },
  { team_id: "NES_06", status: "unknown",  phase: 1, last_action: "Establishing foothold",          last_seen: new Date(Date.now() - 180000).toISOString(), cidr: "10.0.6.0/24",  blocked_count: 0, event_count: 0 },

  // ── FLO teams ──────────────────────────────────────────────────────────────
  { team_id: "FLO_01", status: "online",   phase: 1, last_action: "Nmap host discovery",            last_seen: new Date(Date.now() - 4000).toISOString(),   cidr: "10.0.1.0/24",  blocked_count: 0, event_count: 55 },
  { team_id: "FLO_02", status: "online",   phase: 2, last_action: "SQLMap injection test",          last_seen: new Date(Date.now() - 2000).toISOString(),   cidr: "10.0.2.0/24",  blocked_count: 3, event_count: 130 },
  { team_id: "FLO_03", status: "degraded", phase: 1, last_action: "ping 10.0.3.1",                  last_seen: new Date(Date.now() - 75000).toISOString(),  cidr: "10.0.3.0/24",  blocked_count: 2, event_count: 18 },
  { team_id: "FLO_04", status: "online",   phase: 3, last_action: "Pivoting via proxychains",       last_seen: new Date(Date.now() - 500).toISOString(),    cidr: "10.0.4.0/24",  blocked_count: 1, event_count: 275 },
  { team_id: "FLO_05", status: "offline",  phase: 2, last_action: "Process killed",                 last_seen: new Date(Date.now() - 480000).toISOString(), cidr: "10.0.5.0/24",  blocked_count: 5, event_count: 390 },
  { team_id: "FLO_06", status: "online",   phase: 1, last_action: "Subdomain enumeration (Amass)", last_seen: new Date(Date.now() - 7000).toISOString(),   cidr: "10.0.6.0/24",  blocked_count: 0, event_count: 63 },
];

export const mockEvents = [
  { id: "evt_1", team_id: "TEAM_02", timestamp: new Date(Date.now() - 1000).toISOString(), tool: "Mimikatz", target: "DC-01", result: "SUCCESS", details: "Hashes extracted" },
  { id: "evt_2", team_id: "TEAM_05", timestamp: new Date(Date.now() - 3000).toISOString(), tool: "Hydra", target: "WEB-02", result: "BLOCKED", details: "Rate limit exceeded" },
  { id: "evt_3", team_id: "TEAM_01", timestamp: new Date(Date.now() - 5000).toISOString(), tool: "Nmap", target: "10.0.1.5", result: "SUCCESS", details: "Port 22, 80 open" },
  { id: "evt_4", team_id: "TEAM_07", timestamp: new Date(Date.now() - 12000).toISOString(), tool: "Metasploit", target: "DB-01", result: "FAILED", details: "Exploit completed, no session" },
  { id: "evt_5", team_id: "TEAM_08", timestamp: new Date(Date.now() - 15000).toISOString(), tool: "SQLMap", target: "STORE-FRONT", result: "BLOCKED", details: "WAF triggered" },
  { id: "evt_6", team_id: "TEAM_11", timestamp: new Date(Date.now() - 18000).toISOString(), tool: "Custom", target: "MAIL-01", result: "SUCCESS", details: "Reverse shell established" },
  { id: "evt_7", team_id: "TEAM_03", timestamp: new Date(Date.now() - 25000).toISOString(), tool: "Ping", target: "10.0.3.1", result: "SUCCESS", details: "Host is up" },
  { id: "evt_8", team_id: "TEAM_09", timestamp: new Date(Date.now() - 32000).toISOString(), tool: "Amass", target: "corp.local", result: "SUCCESS", details: "Found 12 subdomains" },
  { id: "evt_9", team_id: "TEAM_12", timestamp: new Date(Date.now() - 40000).toISOString(), tool: "Gobuster", target: "WEB-01", result: "FAILED", details: "403 Forbidden on /admin" },
  { id: "evt_10", team_id: "TEAM_05", timestamp: new Date(Date.now() - 45000).toISOString(), tool: "Hydra", target: "WEB-02", result: "BLOCKED", details: "Account locked out" },
  { id: "evt_11", team_id: "TEAM_02", timestamp: new Date(Date.now() - 50000).toISOString(), tool: "BloodHound", target: "AD", result: "SUCCESS", details: "Ingestor completed" },
  { id: "evt_12", team_id: "TEAM_01", timestamp: new Date(Date.now() - 55000).toISOString(), tool: "Nmap", target: "10.0.1.0/24", result: "SUCCESS", details: "Host discovery done" },
  { id: "evt_13", team_id: "TEAM_07", timestamp: new Date(Date.now() - 60000).toISOString(), tool: "Proxychains", target: "DMZ", result: "SUCCESS", details: "Dynamic port forwarding enabled" },
  { id: "evt_14", team_id: "TEAM_08", timestamp: new Date(Date.now() - 65000).toISOString(), tool: "Manual", target: "WEB-03", result: "FAILED", details: "Invalid credentials" },
  { id: "evt_15", team_id: "TEAM_11", timestamp: new Date(Date.now() - 70000).toISOString(), tool: "Metasploit", target: "MAIL-01", result: "SUCCESS", details: "Exploit running" },
  { id: "evt_16", team_id: "TEAM_04", timestamp: new Date(Date.now() - 80000).toISOString(), tool: "Unknown", target: "VPN", result: "FAILED", details: "Connection timed out" },
  { id: "evt_17", team_id: "TEAM_05", timestamp: new Date(Date.now() - 90000).toISOString(), tool: "Hydra", target: "WEB-02", result: "FAILED", details: "Incorrect password" },
  { id: "evt_18", team_id: "TEAM_12", timestamp: new Date(Date.now() - 100000).toISOString(), tool: "Nikto", target: "WEB-01", result: "SUCCESS", details: "Scan completed" },
  { id: "evt_19", team_id: "TEAM_02", timestamp: new Date(Date.now() - 110000).toISOString(), tool: "Rubeus", target: "DC-01", result: "SUCCESS", details: "Kerberoasting successful" },
  { id: "evt_20", team_id: "TEAM_10", timestamp: new Date(Date.now() - 120000).toISOString(), tool: "Meterpreter", target: "WIN-05", result: "FAILED", details: "Session died" },

  // ── NES team events ────────────────────────────────────────────────────────
  { id: "evt_21", team_id: "NES_01", timestamp: new Date(Date.now() - 3000).toISOString(),   tool: "Nmap",       target: "10.0.1.0/24", result: "SUCCESS", details: "12 hosts discovered" },
  { id: "evt_22", team_id: "NES_02", timestamp: new Date(Date.now() - 6000).toISOString(),   tool: "Gobuster",   target: "WEB-01",      result: "SUCCESS", details: "/admin /backup found" },
  { id: "evt_23", team_id: "NES_03", timestamp: new Date(Date.now() - 90000).toISOString(),  tool: "Hydra",      target: "WEB-02",      result: "BLOCKED", details: "Account locked after 5 attempts" },
  { id: "evt_24", team_id: "NES_05", timestamp: new Date(Date.now() - 1000).toISOString(),   tool: "Metasploit", target: "DB-01",       result: "SUCCESS", details: "Shell obtained" },
  { id: "evt_25", team_id: "NES_05", timestamp: new Date(Date.now() - 15000).toISOString(),  tool: "Mimikatz",   target: "DC-01",       result: "SUCCESS", details: "Hashes extracted" },

  // ── FLO team events ────────────────────────────────────────────────────────
  { id: "evt_26", team_id: "FLO_01", timestamp: new Date(Date.now() - 4000).toISOString(),   tool: "Nmap",       target: "10.0.1.0/24", result: "SUCCESS", details: "Host discovery done" },
  { id: "evt_27", team_id: "FLO_02", timestamp: new Date(Date.now() - 2000).toISOString(),   tool: "SQLMap",     target: "STORE-FRONT", result: "BLOCKED", details: "WAF triggered" },
  { id: "evt_28", team_id: "FLO_03", timestamp: new Date(Date.now() - 75000).toISOString(),  tool: "Ping",       target: "10.0.3.1",    result: "SUCCESS", details: "Host is up" },
  { id: "evt_29", team_id: "FLO_04", timestamp: new Date(Date.now() - 500).toISOString(),    tool: "Proxychains",target: "DMZ",         result: "SUCCESS", details: "Dynamic port forwarding enabled" },
  { id: "evt_30", team_id: "FLO_06", timestamp: new Date(Date.now() - 7000).toISOString(),   tool: "Amass",      target: "corp.local",  result: "SUCCESS", details: "Found 9 subdomains" },
];
