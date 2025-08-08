type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    meta?: Record<string, unknown>;
}

class JsonLogger {
    private getStream(level: LogLevel): NodeJS.WritableStream {
        return level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    }

    private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...meta
        };
        this.getStream(level).write(JSON.stringify(entry) + '\n');
    }

    info(message: string, meta?: Record<string, unknown>) {
        this.log('info', message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>) {
        this.log('warn', message, meta);
    }

    error(message: string, meta?: Record<string, unknown>) {
        this.log('error', message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>) {
        this.log('debug', message, meta);
    }
}

export default JsonLogger;
