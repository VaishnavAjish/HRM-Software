import { useEffect, useState } from 'react';
import { api } from '../services/api';

const DEFAULT_DEPARTMENTS = ['4P DEPT', 'Account', 'BLOCKING DEPT', 'Cutting', 'IT', 'Polish-02 (MFG)'];

// Same department list ProfileScreen already fetches — factored out so the
// admin employee edit/create screens don't each re-fetch and re-fallback.
export function useDepartmentOptions() {
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDepartments();
        if (res?.status && res.data?.length) {
          setDepartments(res.data.map((d) => d.name));
        }
      } catch (e) {
        // Falls back to the default list below.
      }
    })();
  }, []);

  return departments.length ? departments : DEFAULT_DEPARTMENTS;
}
