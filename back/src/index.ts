import { app } from './app.js'
import { config } from './config/index.js'

app.listen(config.port, () => {
  console.log(`[back] server running on http://0.0.0.0:${config.port}`)
})
