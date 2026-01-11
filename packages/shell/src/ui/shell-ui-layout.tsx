import { env } from '@workspace/env/env'
import { Outlet } from 'react-router'

export function ShellUiLayout() {
  return (
    <div className="flex h-full flex-col items-stretch justify-between">
      <header className="flex items-center justify-between bg-secondary/40 px-4 py-2">{env('name')}</header>
      <main className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4">
        <Outlet />
      </main>
    </div>
  )
}
