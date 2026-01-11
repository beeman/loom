import type { LoaderFunctionArgs } from 'react-router'

export function rootRouteLoader() {
  return async (args: LoaderFunctionArgs) => {
    const url = new URL(args.request.url)
    const pathname = url.pathname

    return {
      pathname,
      url,
    }
  }
}
