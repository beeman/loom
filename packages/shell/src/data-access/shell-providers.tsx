import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Toaster } from '@workspace/ui/components/sonner'
import { browser } from '@wxt-dev/browser'
import type { ReactNode } from 'react'
import { queryClient } from './query-client.tsx'

interface ShellProviderProps {
  children: ReactNode
}

const persister = createAsyncStoragePersister({
  storage: browser?.storage?.local
    ? {
        getItem: async (key: string) => {
          const result = await browser.storage.local.get(key)
          return result[key] ?? null
        },
        removeItem: async (key: string) => {
          await browser.storage.local.remove(key)
        },
        setItem: async (key: string, value: string) => {
          await browser.storage.local.set({ [key]: value })
        },
      }
    : window.localStorage,
})

export function ShellProviders({ children }: ShellProviderProps) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
      <Toaster closeButton richColors />
    </PersistQueryClientProvider>
  )
}
