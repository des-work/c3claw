import { useState, useEffect } from 'react';
import { mockTeams, mockEvents } from '../mockData';

export function useDashboardData() {
  const apiUrl = import.meta.env.VITE_API_URL;

  const [teams, setTeams] = useState(apiUrl ? [] : mockTeams);
  const [events, setEvents] = useState(apiUrl ? [] : mockEvents);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let statusInterval;
    let eventsInterval;

    if (!apiUrl) {
      // Use Mock Data
      setLoading(false);

      // Simulate real-time team status updates: refresh last_seen for online teams
      statusInterval = setInterval(() => {
        setTeams(prev => prev.map(team =>
          team.status === 'online'
            ? { ...team, last_seen: new Date().toISOString(), event_count: team.event_count + 1 }
            : team
        ));
      }, 15000);

      // Simulate incoming telemetry events
      const tools = ['Nmap', 'Metasploit', 'Hydra', 'Custom', 'SQLMap', 'Gobuster'];
      const results = ['SUCCESS', 'FAILED', 'BLOCKED'];
      eventsInterval = setInterval(() => {
        setEvents(prev => {
          const teamIds = ['TEAM_01','TEAM_02','TEAM_03','TEAM_05','TEAM_07','TEAM_08','TEAM_09','TEAM_11','TEAM_12','NES_01','NES_02','NES_03','NES_05','NES_06','FLO_01','FLO_02','FLO_03','FLO_04','FLO_06'];
          const tool = tools[Math.floor(Math.random() * tools.length)];
          const result = results[Math.floor(Math.random() * results.length)];
          const teamId = teamIds[Math.floor(Math.random() * teamIds.length)];
          const newEvent = {
            id: `evt_mock_${Date.now()}`,
            team_id: teamId,
            timestamp: new Date().toISOString(),
            tool,
            target: `10.0.${Math.floor(Math.random() * 12) + 1}.${Math.floor(Math.random() * 254) + 1}`,
            result,
            details: `${tool} scan completed`
          };
          return [...prev, newEvent].slice(-100);
        });
      }, 4000);
      
    } else {
      // API Polling
      const fetchStatus = async () => {
        try {
          const response = await fetch(`${apiUrl}/api/status`);
          if (!response.ok) throw new Error('Failed to fetch status');
          const data = await response.json();
          setTeams(data);
          setError(null);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      const fetchEvents = async () => {
        try {
          const response = await fetch(`${apiUrl}/api/events`);
          if (!response.ok) throw new Error('Failed to fetch events');
          const data = await response.json();
          setEvents(data);
        } catch (err) {
          console.error("Error fetching events:", err);
        }
      };

      // Initial fetch
      fetchStatus();
      fetchEvents();

      // Poll intervals
      statusInterval = setInterval(fetchStatus, 15000);
      eventsInterval = setInterval(fetchEvents, 4000);
    }

    return () => {
      clearInterval(statusInterval);
      clearInterval(eventsInterval);
    };
  }, [apiUrl]);

  return { teams, events, loading, error };
}
