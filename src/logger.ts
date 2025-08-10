type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    /** The timestamp of the log entry */
    timestamp: string;
    /** The log level of the entry */
    level: LogLevel;
    /** The log message */
    message: string;
    /** The origin of the log entry as defined by the logger */
    origin: string;
    /** Additional metadata for the log entry */
    meta?: Record<string, unknown>;
}

type JsonLoggerConfig = {
    origin: string;
}

class JsonLogger {
    constructor(private config: JsonLoggerConfig) { };

    private getStream(level: LogLevel): NodeJS.WritableStream {
        return level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    }

    private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            origin: this.config.origin,
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
