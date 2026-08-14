import { run } from './dist/consumer.js';

await run(process.argv[2]);
console.log('public tarball TypeScript consumer proof passed');
