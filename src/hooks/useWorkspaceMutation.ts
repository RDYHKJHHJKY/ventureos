import { useState, useCallback } from 'react';

export const useWorkspaceMutation = () => {
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const refresh = useCallback(() => {
    setWorkspaceRefreshKey((prev) => prev + 1);
  }, []);

  return { refresh, workspaceRefreshKey };
};
