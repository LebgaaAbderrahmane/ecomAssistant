import { app } from './app.js'
// Start the email worker — must be imported so the Worker instance is created
// and begins listening to the Redis queue
import "./workers/email.worker";
import "./workers/message.worker";
import "./workers/order.worker";
import "./workers/layer2.worker";
import { moduleLogger } from './lib/logger';
const log = moduleLogger('server');

const PORT = process.env.PORT ?? 3000;


app.listen(PORT, () => {
  log.info({ port: PORT }, 'server running');
  log.info('email worker listening');
});