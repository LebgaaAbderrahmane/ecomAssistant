import { Router, type IRouter } from 'express'

const apiRouter: IRouter = Router()

apiRouter.get('/ping', (_req, res) => {
  res.json({ message: 'pong' })
})

export { apiRouter }
