import { useState, useEffect } from 'react';
import { mockTeams, mockEvents } from '../mockData';

export function useDashboardData() {
  const [teams, setTeams] = useState(mockTeams);
  const [events, setEvents] = useState(mockEvents);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    let statusInterval;
    let eventsInterval;

    if (!apiUrl) {
      // Use Mock Data
      setLoading(false);
      
      // Simulate real-time mock data updates
      statusInterval = setInterval(() => {
        setTeams(prev => [...prev]);
      }, 15000);
      
      eventsInterval = setInterval(() => {
        setEvents(prev => [...prev]);
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
