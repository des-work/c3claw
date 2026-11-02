import { useState, useEffect } from 'react';
import { mockTeams, mockEvents } from '../mockData';

export function useDashboardData() {
  const apiUrl = import.meta.env.VITE_API_URL;

  const [teams, setTeams] = useState(apiUrl ? [] : mockTeams);
  const [events, setEvents] = useState(apiUrl ? [] : mockEvents);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [eventsError, setEventsError] = useState(null);

  useEffect(() => {
    let statusInterval;
    let eventsInterval;
    let active = true;
    let statusRequest = null;
    let eventsRequest = null;

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
          const teamIds = ['TEAM_01','TEAM_02','TEAM_03','TEAM_05','TEAM_07','TEAM_08','TEAM_09','TEAM_11','TEAM_12','Nestler_01','Nestler_02','Nestler_03','Brown_01','Brown_02','Brown_03','Flores_01','Flores_02','Flores_03','McIntyre_01','McIntyre_02','McIntyre_03'];
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
      const fetchStatus = async () => {
        if (!active || statusRequest) return;
        if (document.hidden) {
          statusInterval = setTimeout(fetchStatus, 15000);
          return;
        }
        const controller = new AbortController();
        statusRequest = controller;
        try {
          const response = await fetch(`${apiUrl}/api/status`, { signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error('Failed to fetch status');
          const data = await response.json();
          if (active) {
            setTeams(data);
            setStatusError(null);
          }
        } catch (err) {
          if (active && err.name !== 'AbortError') setStatusError(err.message);
        } finally {
          statusRequest = null;
          if (active) {
            setLoading(false);
            statusInterval = setTimeout(fetchStatus, 15000);
          }
        }
      };

      const fetchEvents = async () => {
        if (!active || eventsRequest) return;
        if (document.hidden) {
          eventsInterval = setTimeout(fetchEvents, 4000);
          return;
        }
        const controller = new AbortController();
        eventsRequest = controller;
        try {
          const response = await fetch(`${apiUrl}/api/events?limit=20`, { signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error('Failed to fetch events');
          const data = await response.json();
          if (active) {
            setEvents(data);
            setEventsError(null);
          }
        } catch (err) {
          if (active && err.name !== 'AbortError') setEventsError(err.message);
        } finally {
          eventsRequest = null;
          if (active) eventsInterval = setTimeout(fetchEvents, 4000);
        }
      };

      fetchStatus();
      fetchEvents();
      const onVisible = () => {
        if (document.hidden) return;
        clearTimeout(statusInterval);
        clearTimeout(eventsInterval);
        fetchStatus();
        fetchEvents();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        active = false;
        clearTimeout(statusInterval);
        clearTimeout(eventsInterval);
        statusRequest?.abort();
        eventsRequest?.abort();
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    return () => {
      clearInterval(statusInterval);
      clearInterval(eventsInterval);
    };
  }, [apiUrl]);

  return { teams, events, loading, error: statusError || eventsError, isMock: !apiUrl };
}
