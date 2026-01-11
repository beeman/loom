import { setEnv } from '@workspace/env/env'

const env = {
  name: import.meta.env['VITE_NAME'],
}

setEnv(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)))
