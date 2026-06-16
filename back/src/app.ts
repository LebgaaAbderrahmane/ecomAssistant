import express, { type Express } from 'express'
import cors from 'cors'
import apiRouter from './routes/index.js'

const app: Express = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok man', timestamp: new Date().toISOString() })
})

app.use('/', apiRouter)

export { app }
