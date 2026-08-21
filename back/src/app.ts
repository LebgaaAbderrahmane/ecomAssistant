import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import passport from './config/passport.js'
import apiRouter from './routes/index.js'
import { csrfProtection } from './middlwares/csrf.js'
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { moduleLogger } from './lib/logger';

const log = moduleLogger('app');
const app: Express = express()

app.use(cors())
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cookieParser())
app.use(passport.initialize())
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
  log.error({ err: err.message || err }, 'unhandled error');
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});


export { app }
