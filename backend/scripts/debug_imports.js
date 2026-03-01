
console.log('Starting debug imports...');

try {
    console.log('Importing dotenv...');
    await import('dotenv');
    console.log('✅ dotenv imported');
} catch (e) {
    console.error('❌ dotenv failed', e.message);
}

try {
    console.log('Importing drizzle-orm...');
    await import('drizzle-orm');
    console.log('✅ drizzle-orm imported');
} catch (e) {
    console.error('❌ drizzle-orm failed', e.message);
}

try {
    console.log('Importing ../db/schema.js...');
    await import('../db/schema.js');
    console.log('✅ ../db/schema.js imported');
} catch (e) {
    console.error('❌ ../db/schema.js failed');
    console.error(e.stack);
}

try {
    console.log('Importing ../config/db.js...');
    const dbModule = await import('../config/db.js');
    console.log('✅ ../config/db.js imported', dbModule.default ? 'has default' : 'no default');
} catch (e) {
    console.error('❌ ../config/db.js failed', e.message);
}

try {
    console.log('Importing ../services/currencyService.js...');
    await import('../services/currencyService.js');
    console.log('✅ ../services/currencyService.js imported');
} catch (e) {
    console.error('❌ ../services/currencyService.js failed', e.message);
}
