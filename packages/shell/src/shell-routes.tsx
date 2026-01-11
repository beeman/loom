import { UiErrorBoundary } from '@workspace/ui/components/ui-error-boundary'
import { UiLoaderFull } from '@workspace/ui/components/ui-loader-full'
import { UiNotFound } from '@workspace/ui/components/ui-not-found'
import { createHashRouter, Navigate, type RouteObject, RouterProvider } from 'react-router'
import { DashboardRoutes } from './dashboard-routes.tsx'
import { rootRouteLoader } from './data-access/root-route-loader.tsx'
import { ShellUiLayout } from './ui/shell-ui-layout.tsx'

function createRouter() {
  return createHashRouter([
    {
      children: getAppRoutes(),
      errorElement: <UiErrorBoundary />,
      hydrateFallbackElement: <UiLoaderFull />,
      id: 'root',
      loader: rootRouteLoader(),
    },
  ])
}

function getAppRoutes(): RouteObject[] {
  return [
    { element: <Navigate replace to="/dashboard" />, index: true },
    {
      children: [
        { element: <DashboardRoutes />, path: 'dashboard/*' },
        { element: <UiNotFound />, path: '*' },
      ],
      element: <ShellUiLayout />,
    },
  ]
}

export function ShellRoutes() {
  return <RouterProvider router={createRouter()} />
}
