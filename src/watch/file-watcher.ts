import chokidar from 'chokidar';

export async function startWatch(target: string): Promise<void> {
  const watcher = chokidar.watch(target, { ignoreInitial: true });

  watcher.on('all', (event, filePath) => {
    console.log(`[watch] ${event}: ${filePath}`);
  });

  console.log(`Watching for changes in: ${target}`);
}

