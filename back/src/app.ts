import express, { type Express } from 'express'
import cors from 'cors'
import { apiRouter } from './routes/index.js'

const app: Express = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/v1', apiRouter)

export { app }
