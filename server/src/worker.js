require('dotenv').config();
const { startCron } = require('./cron');
console.log('[worker] NavPilot background worker starting');
startCron();
process.on('SIGTERM', () => { console.log('[worker] stopping'); process.exit(0); });
