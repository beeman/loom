import { useRoutes } from 'react-router'

export function DashboardRoutes() {
  return useRoutes([
    // More routes here...
    { element: <div>Dashboard</div>, path: '*' },
  ])
}
