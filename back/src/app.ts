import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import apiRouter from './routes/index.js'
import { csrfProtection } from './middlwares/csrf.js'
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const app: Express = express()

app.use(cors())
// app.ts
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf; // Buffer, stored before parsing
  }
}));
app.use(cookieParser())
app.use(csrfProtection)

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});


app.get('/health', (_req, res) => {
  res.json({ status: 'ok man', timestamp: new Date().toISOString() })
})

app.use('/', apiRouter)


export { app }
