import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

export function useAgentCandidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getAgentCandidates();
      if (res?.status) {
        setCandidates(res.data || []);
      } else {
        setError(res?.message || 'Could not load your candidates.');
      }
    } catch (e) {
      setError(e.message || 'Could not load your candidates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { candidates, loading, refreshing, error, reload: load };
}
