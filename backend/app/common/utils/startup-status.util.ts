type StartupStatus = 'ok' | 'fail' | 'skip';
type StartupItemType = 'service' | 'module';

interface StartupItem {
  name: string;
  type: StartupItemType;
  status: StartupStatus;
  error?: string;
}

const items: StartupItem[] = [];

const color = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

function iconFor(status: StartupStatus): string {
  switch (status) {
    case 'ok':
      return color.green('✔');
    case 'fail':
      return color.red('✖');
    default:
      return color.gray('•');
  }
}

function add(type: StartupItemType, name: string, status: StartupStatus, error?: unknown): void {
  const errMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : undefined);
  const existingIdx = items.findIndex(i => i.type === type && i.name === name);
  const entry: StartupItem = { type, name, status, error: errMsg };
  if (existingIdx >= 0) {
    items[existingIdx] = entry;
  } else {
    items.push(entry);
  }
}

export const startupStatus = {
  serviceOk(name: string): void { add('service', name, 'ok'); },
  serviceFail(name: string, error?: unknown): void { add('service', name, 'fail', error); },
  serviceSkip(name: string): void { add('service', name, 'skip'); },
  moduleOk(name: string): void { add('module', name, 'ok'); },
  moduleFail(name: string, error?: unknown): void { add('module', name, 'fail', error); },
  moduleSkip(name: string): void { add('module', name, 'skip'); },
  logSummary(): void {
    // Grouped output
    const services = items.filter(i => i.type === 'service');
    const modules = items.filter(i => i.type === 'module');

    // Header
     
    console.log('');
     
    console.log('=== Startup Summary ===');

    if (services.length) {
       
      console.log('Services:');
      services.forEach(s => {
        const mark = iconFor(s.status);
        const line = `-> ${mark} Service:${s.name} ${s.status === 'ok' ? 'initialized' : s.status === 'skip' ? 'skipped' : 'failed'}`;
         
        console.log(line + (s.error ? ` ${color.red(`(${s.error})`)}` : ''));
      });
    }

    if (modules.length) {
       
      console.log('Modules:');
      modules.forEach(m => {
        const mark = iconFor(m.status);
        const line = `-> ${mark} Module:${m.name} ${m.status === 'ok' ? 'initialized' : m.status === 'skip' ? 'skipped' : 'failed'}`;
         
        console.log(line + (m.error ? ` ${color.red(`(${m.error})`)}` : ''));
      });
    }

     
    console.log('=======================');
  },
};


