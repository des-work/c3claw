import { useState, useEffect } from 'react';

export function useDashboardData() {
  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

  const [teams, setTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [eventsError, setEventsError] = useState(null);

  useEffect(() => {
    let statusInterval;
    let eventsInterval;
    let active = true;
    let statusRequest = null;
    let eventsRequest = null;

    const fetchStatus = async () => {
      if (!active || statusRequest) return;
      if (document.hidden) {
        statusInterval = setTimeout(fetchStatus, 15000);
        return;
      }
      const controller = new AbortController();
      statusRequest = controller;
      try {
        const response = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid status response');
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
        const response = await fetch(`${apiUrl}/api/events?limit=20`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch events');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid events response');
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
  }, [apiUrl]);

  return { teams, events, loading, error: statusError || eventsError };
}
