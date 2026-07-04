import { app } from './app.js'
// Start the email worker — must be imported so the Worker instance is created
// and begins listening to the Redis queue
import "./workers/email.worker";
import "./workers/message.worker";


const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[EmailWorker] Listening for email jobs`);
});