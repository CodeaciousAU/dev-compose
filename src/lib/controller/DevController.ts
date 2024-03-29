import * as child_process from 'child_process';
import * as fs from "fs";
import * as os from "os";
import * as path from 'path';
import * as repl from 'repl';
import * as yaml from 'js-yaml';
import Color from 'colors/safe';

import DevSpec, {DevSpecAction} from "../model/DevSpec";

export default class DevController {

    private readonly devSpec: DevSpec;
    private readonly projectName: string;
    private readonly composeFile: string;
    private readonly tempDir: string;
    private replServer: repl.REPLServer;

    constructor(yamlData: string) {
        let yamlModel = yaml.safeLoad(yamlData);
        if (typeof yamlModel !== 'object') {
            throw new Error('Expected a YAML object');
        }
        this.devSpec = new DevSpec(yamlModel);
        this.projectName = path.basename(process.cwd());
        this.tempDir = fs.mkdtempSync(os.tmpdir()+path.sep);
        this.composeFile = this.tempDir+path.sep+'docker-compose.yml';
        fs.writeFileSync(this.composeFile, this.generateComposeFile(), 'utf8');
    }

    /**
     * Start an interactive shell which allows execution of 'dev' subcommands.
     */
    public repl(): Promise<void> {
        return this.dockerCompose(['ps']).then(() => {
            return new Promise((resolve, reject) => {
                this.replServer = repl.start({
                    prompt: Color.yellow(this.projectName+'> '),
                    useGlobal: false,
                    eval: this.evalReplInput.bind(this),
                });
                this.replServer.on('exit', () => {
                    console.log('');
                    resolve();
                });
            });
        });
    }

    /**
     * Execute a single 'dev' subcommand.
     */
    public execute(command: string, args: string[] = []): Promise<void> {
        try {
            let container = this.devSpec.defaultServiceName;
            let runAsUser = this.devSpec.command_defaults.user;
            switch (command)  {
                case 'help':
                case 'commands':
                    return this.commands();
                case 'status':
                    return this.status();
                case 'start':
                    if (args.length === 1) {
                        return this.start(args[0]);
                    }
                    return this.start();
                case 'stop':
                    if (args.length === 1) {
                        return this.stop(args[0]);
                    }
                    return this.stop();
                case 'restart':
                    if (args.length === 1) {
                        return this.restart(args[0]);
                    }
                    return this.restart();
                case 'init':
                    return this.init();
                case 'destroy':
                    return this.destroy();
                case 'sync':
                    return this.sync();
                case 'exec':
                    for (let i = 0; i < 2; i++) {
                        if (args.length >= 2 && args[0] == '-c') {
                            container = args[1];
                            args = args.slice(2);
                        }
                        if (args.length >= 2 && args[0] == '-u') {
                            runAsUser = args[1];
                            args = args.slice(2);
                        }
                    }
                    if (!args.length) {
                        return Promise.reject('Syntax: exec [-c service_name] [-u user] <program> [args...]');
                    }
                    return this.exec(args[0], args.slice(1), container, runAsUser);
                case 'logs':
                    if (args.length >= 2 && args[0] == '-c') {
                        container = args[1];
                        args = args.slice(2);
                    }
                    return this.logs(container);
                default:
                    return this.customAction(command, args);
            }
        } catch (err) {
            return Promise.reject(err);
        }
    }

    public async commands() {
        let commands = ['commands', 'status', 'start', 'stop', 'restart', 'init',
            'destroy', 'sync', 'exec', 'logs'];
        for (let customCommand in this.devSpec.handlers) {
            if (commands.indexOf(customCommand) < 0) {
                commands.push(customCommand);
            }
        }
        console.log(Color.blue('Supported commands:'));
        console.log(Color.green('  '+commands.join(' ')));
        console.log();
    }

    public async status() {
        return this.dockerCompose(['ps']);
    }

    public async start(service?: string) {
        if (service !== undefined) {
            return this.dockerCompose(['start', service]);
        }
        return this.dockerCompose(['up', '-d']);
    }

    public async stop(service?: string) {
        if (service !== undefined) {
            return this.dockerCompose(['stop', service]);
        }
        return this.dockerCompose(['stop']);
    }

    public async restart(service?: string) {
        if (service !== undefined) {
            return this.dockerCompose(['restart', service]);
        }
        return this.dockerCompose(['restart']);
    }

    public async init() {
        await this.execute('destroy');
        await this.dockerCompose(['pull']);
        await this.dockerCompose(['up', '-d', '--build']);
        await this.runCustomActions('init');
    }

    public async destroy() {
        await this.runCustomActions('destroy')
        await this.dockerCompose(['down', '--volumes', '--rmi', 'local']);
    }

    public async sync() {
        await this.dockerCompose(['pull']);
        await this.dockerCompose(['up', '-d', '--build']);
        await this.runCustomActions('sync');
    }

    public async exec(command: string, args: string[]=[], service?: string, runAsUser?: string) {
        service = service ?? this.devSpec.defaultServiceName;
        if (!(typeof service === 'string') || !service.length) {
            throw 'Unable to determine which container to use. Please specify a service name using -c';
        }
        await this.dockerComposeExec(service, command, args, runAsUser);
    }

    public async logs(service?: string) {
        service = service ?? this.devSpec.defaultServiceName;
        if (!(typeof service === 'string') || !service.length) {
            throw 'Unable to determine which container to use. Please specify a service name using -c';
        }
        await this.dockerCompose(['logs', '-f', service]);
    }

    public async customAction(handlerName: string, args: string[]=[]) {
        if (!this.devSpec.hasActionsForHandlerName(handlerName)) {
            throw 'No handler exists for command "'+handlerName+'"';
        }
        await this.runCustomActions(handlerName, args);
    }

    /**
     * Handle input from the REPL.
     *
     * @param commandLine The string entered at the interactive prompt
     * @param context REPL context object
     * @param filename Unused
     * @param callback Must be called when processing of the command is complete
     */
    private evalReplInput(commandLine: string, context: object, filename: string, callback: ((err?, output?) => void)) {
        let parts = this.parseCommandLine(commandLine);
        if (!parts.length) {
            callback();
            return;
        }
        this.execute(parts[0], parts.slice(1)).then(() => {
            callback();
        }).catch(err => {
            console.error(Color.red(err));
            callback();
        });
    }

    /**
     * Basic parsing of a command line into individual arguments. Does not support any shell
     * features such as escape characters or quotes.
     */
    private parseCommandLine(commandLine: string): string[] {
        return commandLine.split(' ').map(str => str.trim()).filter(str => str.length > 0);
    }

    /**
     * Generate YAML data that could appear in a docker-compose.yml file.
     */
    private generateComposeFile(): string {
        let model = this.devSpec.generateComposeModel();
        let pathPrefix = process.cwd()+path.sep;
        let envFiles = [];
        if (fs.existsSync(pathPrefix+'local.env')) {
            envFiles.push(pathPrefix+'local.env');
        }
        if ('services' in model) {
            for (let serviceName in (model['services'] as any)) {
                let service = model['services'][serviceName];
                if (typeof service !== 'object' || !envFiles.length) {
                    continue;
                }
                if (!('env_file' in service)) {
                    service['env_file'] = [];
                }
                if (Array.isArray(service['env_file'])) {
                    for (let file of envFiles) {
                        service['env_file'].push(file);
                    }
                }
            }
        }
        return yaml.safeDump(model);
    }

    /**
     * Execute the 'docker compose' tool with the given arguments.
     */
    private dockerCompose(args: string[]): Promise<void> {
        args = args.slice(0);
        args.unshift('-f', this.composeFile);
        args.unshift('--project-directory', process.cwd());
        args.unshift('compose');
        let environment = Object.assign({}, process.env);
        if (this.devSpec.buildkit) {
            environment['COMPOSE_DOCKER_CLI_BUILD'] = '1';
            environment['DOCKER_BUILDKIT'] = '1';
        }

        return new Promise((resolve, reject) => {
            let child = child_process.spawn('docker', args, {
                env: environment,
                stdio: 'inherit',
            });
            child.on('error', err => {
                reject('Unable to run the `docker` command-line tool. Make sure it\'s installed and available in the system path.');
            });
            child.on('close', status => {
                if (status == 0) {
                    resolve();
                } else {
                    reject('Process returned status '+status);
                }
            });
        });
    }

    /**
     * Execute a command inside a container, using 'docker compose exec'.
     *
     * @param container Compose service name
     * @param command The program to execute in the container
     * @param args Arguments to pass to the program
     * @param workingDir Directory to change to (in the container) before executing the program
     * @param runAsUser Username to execute the program as (in the container)
     * @param env Extra environment variables to make available to the program
     */
    private dockerComposeExec(container: string, command: string, args: string[] = [],
            runAsUser: string = this.devSpec.command_defaults.user,
            workingDir: string = this.devSpec.command_defaults.working_dir,
            env: {[key: string]: string} = this.devSpec.command_defaults.environment): Promise<void> {

        let commandParts = [container, command].concat(args);
        if (env !== null) {
            for (let key in env) {
                commandParts.unshift('-e', key+'='+env[key]);
            }
        }
        if (runAsUser !== null) {
            commandParts.unshift('--user', runAsUser);
        }
        if (workingDir !== null) {
            commandParts.unshift('--workdir', workingDir);
        }
        if (!process.stdout.isTTY) {
            commandParts.unshift('-T');
        }
        commandParts.unshift('exec');

        if (this.replServer) {
            this.replServer.pause();
        }
        return this.dockerCompose(commandParts).finally(() => {
            if (this.replServer) {
                this.replServer.resume();
            }
        });
    }

    /**
     * Run any actions that are configured in the DevSpec for the named handler.
     */
    private runCustomActions(handlerName: string, args: string[] = []): Promise<void> {
        let sequence = this.devSpec.getActionsForHandlerName(handlerName).slice(0);
        let progress = 0;
        let total = sequence.length;
        let next = (): Promise<void> => {
            if (sequence.length) {
                let action = sequence.shift();
                progress++;
                console.log(
                    Color.bgBlue(Color.black(
                        handlerName+' ['+progress.toString()+'/'+total.toString()+']'
                    ))
                    +' '+(action.command||action.handler)
                );
                if (action.command !== null) {
                    return this.runCommandAction(action, args).then(next);
                } else if (action.action !== null) {
                    return this.runSpecialAction(action).then(next);
                } else {
                    return this.runCustomActions(action.handler, action.args || args).then(next);
                }
            } else {
                return Promise.resolve();
            }
        };
        return next();
    }

    /**
     * Run the given DevSpec special action.
     */
    private runSpecialAction(action: DevSpecAction): Promise<void> {
        let container = action.service || this.devSpec.defaultServiceName;
        switch (action.action) {
            case 'restart':
                return this.dockerCompose(['restart', container]);
            default:
                return Promise.reject('Unsupported action "'+action.action+'"');
        }
    }

    /**
     * Run the given DevSpec-configured command inside a container.
     */
    private runCommandAction(action: DevSpecAction, extraArgs: string[] = []): Promise<void> {
        let container = this.devSpec.defaultServiceName;
        let runAsUser = this.devSpec.command_defaults.user;
        let workingDir = this.devSpec.command_defaults.working_dir;
        let env = this.devSpec.command_defaults.environment;

        if (action.service !== null) {
            container = action.service;
        }
        if (action.user !== null) {
            runAsUser = action.user;
        }
        if (action.working_dir !== null) {
            workingDir = action.working_dir;
        }
        if (action.environment !== null) {
            env = Object.assign(env, action.environment);
        }

        if (container === null || !container.length) {
            return Promise.reject('The configuration doesn\'t specify in which container to run this command');
        }

        let parts: string[];
        if (action.args === null) {
            parts = this.parseCommandLine(action.command).concat(extraArgs);
        } else {
            parts = [action.command].concat(action.args).concat(extraArgs);
        }
        return this.dockerComposeExec(container, parts[0], parts.slice(1), runAsUser, workingDir, env);
    }
}