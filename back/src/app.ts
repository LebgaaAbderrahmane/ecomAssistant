import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
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

app.use('/uploads', express.static(path.resolve('/app/uploads')));
app.use('/', apiRouter)

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message || err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});


export { app }
