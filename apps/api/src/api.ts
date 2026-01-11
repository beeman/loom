import { HttpApi, OpenApi } from '@effect/platform'
import { RootApi } from './routes/root/api.ts'

export class Api extends HttpApi.make('api').add(RootApi).annotate(OpenApi.Title, 'Sandbox') {}
