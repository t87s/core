import { app } from './server.js';
import * as output from './output.js';

const PORT = 4787; // t87s -> 4787, avoids common ports like 3000
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo(): Promise<void> {
  output.header('t87s Cache Demo');
  output.info('Demonstrating hierarchical cache tags with prefix invalidation');
  output.info('');

  await sleep(500);

  // Step 1: Fetch user (MISS)
  output.step(1, 'Fetch user (expect MISS - first request)');
  output.curl(`curl ${BASE_URL}/users/123`);
  await fetch(`${BASE_URL}/users/123`);
  await sleep(300);
  console.log();

  // Step 2: Fetch user again (HIT)
  output.step(2, 'Fetch user again (expect HIT - cached!)');
  output.curl(`curl ${BASE_URL}/users/123`);
  await fetch(`${BASE_URL}/users/123`);
  await sleep(300);
  console.log();

  // Step 3: Fetch user's posts (MISS)
  output.step(3, "Fetch user's posts (expect MISS - first request)");
  output.curl(`curl ${BASE_URL}/users/123/posts`);
  await fetch(`${BASE_URL}/users/123/posts`);
  await sleep(300);
  console.log();

  // Step 4: Fetch posts again (HIT)
  output.step(4, 'Fetch posts again (expect HIT - cached!)');
  output.curl(`curl ${BASE_URL}/users/123/posts`);
  await fetch(`${BASE_URL}/users/123/posts`);
  await sleep(300);
  console.log();

  // Step 5: Update user name
  output.step(5, 'Update user name (triggers invalidation)');
  output.curl(
    `curl -X PUT -H "Content-Type: application/json" -d '{"name":"Alice Updated"}' ${BASE_URL}/users/123`
  );
  await fetch(`${BASE_URL}/users/123`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Updated' }),
  });
  await sleep(300);
  console.log();

  // Step 6: Fetch user (MISS - invalidated)
  output.step(6, 'Fetch user (expect MISS - invalidated by update)');
  output.curl(`curl ${BASE_URL}/users/123`);
  await fetch(`${BASE_URL}/users/123`);
  await sleep(300);
  console.log();

  // Step 7: Fetch posts (MISS - prefix invalidation!)
  output.step(7, 'Fetch posts (expect MISS - prefix invalidation!)');
  output.info('  Tags: user:123 invalidation also invalidates user:123:posts');
  output.curl(`curl ${BASE_URL}/users/123/posts`);
  await fetch(`${BASE_URL}/users/123/posts`);
  await sleep(300);
  console.log();

  output.success('Demo Complete!');
  output.info('The server is still running. Try your own requests:');
  output.info('');
  output.info(`  GET  ${BASE_URL}/users/123`);
  output.info(`  GET  ${BASE_URL}/users/123/posts`);
  output.info(`  PUT  ${BASE_URL}/users/123 -d '{"name":"New Name"}'`);
  output.info('');
  output.info('Press Ctrl+C to stop the server.');
}

// Start the server and run the demo
const server = app.listen(PORT, async () => {
  output.info(`Server started on port ${PORT}`);

  // Wait for server to be fully ready
  await sleep(100);

  // Run the demo
  await runDemo();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  output.info('Shutting down server...');
  server.close(() => {
    output.info('Server stopped. Goodbye!');
    process.exit(0);
  });
});
