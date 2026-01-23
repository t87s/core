import pc from 'picocolors';

export function header(text: string): void {
  console.log();
  console.log(pc.bold(pc.cyan(`━━━ ${text} ━━━`)));
  console.log();
}

export function step(num: number, description: string): void {
  console.log(pc.bold(pc.white(`─── Step ${num}: ${description} ───`)));
}

export function curl(command: string): void {
  console.log(pc.dim('$ ') + pc.yellow(command));
  console.log();
}

export function cacheHit(ms: number): void {
  console.log(`  ${pc.green('✓ HIT')} ${pc.dim(`(${ms}ms)`)}`);
}

export function cacheMiss(ms: number): void {
  console.log(`  ${pc.red('✗ MISS')} ${pc.dim(`(${ms}ms)`)}`);
}

export function invalidated(tags: string[], prefixMatches: number): void {
  const suffix = prefixMatches > 0 ? ` ${pc.dim(`(+ ${prefixMatches} prefix matches)`)}` : '';
  console.log(`  ${pc.magenta('↳ Invalidated:')} ${tags.join(', ')}${suffix}`);
}

export function json(data: unknown): void {
  console.log(`  ${pc.white(JSON.stringify(data))}`);
}

export function success(text: string): void {
  console.log();
  console.log(pc.bold(pc.green(`━━━ ${text} ━━━`)));
  console.log();
}

export function info(text: string): void {
  console.log(pc.dim(text));
}
