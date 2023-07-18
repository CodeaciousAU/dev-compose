import * as fs from 'fs';
import * as path from 'path';
import Color from 'colors/safe';
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';

import DevController from "./lib/controller/DevController";

const DEFAULT_YAML_FILE = 'dev.yml';


//Handler to print the most useful message for a range of different error types
function errorHandler(response) {
    let message = 'An error occurred';
    if (response.hasOwnProperty('error')) {
        message = 'Error: '+response['error'].toString();
        if (response.hasOwnProperty('cause')) {
            message += '\n'+response['cause'];
        }
    } else if (typeof response === 'string') {
        message = response;
    } else if (response.hasOwnProperty('toString')) {
        message = response.toString();
    } else {
        console.error(response);
    }
    console.error(Color.red(message));
    process.exit(1);
}

//Parse arguments
const options = yargs(hideBin(process.argv))
    .scriptName('dev')
    .parserConfiguration({'unknown-options-as-args': true})
    .usage('dev-compose: Manage a development environment configured by a YAML devSpec')
    .version()
    .help()
    .epilog('For more information: https://github.com/CodeaciousAU/dev-compose/')
    .alias('v', 'version')
    .alias('h', 'help')
    .command('$0', 'Start an interactive shell for running dev commands.', () => {})
    .command('commands', 'List commands applicable to the devSpec, including any custom commands.', () => {})
    .command('status', 'Show the status (running/stopped) of the containers defined in the devSpec.', () => {})
    .command('start [service]', 'Start the containers defined in the devSpec (creating them first, if necessary).',
        (yargs) =>
            yargs.positional('service', {
                desc: 'Optionally start one specific container only',
                type: 'string',
            })
    )
    .command('stop [service]', 'Stop the containers defined in the devSpec.',
        (yargs) =>
            yargs.positional('service', {
                desc: 'Optionally stop one specific container only',
                type: 'string',
            })
    )
    .command('restart [service]', 'Restart the containers defined in the devSpec.',
        (yargs) =>
            yargs.positional('service', {
                desc: 'Optionally restart one specific container only',
                type: 'string',
            })
    )
    .command('init', '(Re-)initialise the dev environment defined by the devSpec.', () => {})
    .command('destroy', 'Stop and remove all the containers defined in the devSpec.', () => {})
    .command('sync', 'Bring the dev environment up to date.', () => {})
    .command('exec [program] [args...]', 'Execute a program inside a running container that is part of the devSpec.',
        (yargs) =>
            yargs.positional('program', {
                desc: 'The executable to run inside the container. This can be an absolute path to the binary in the container\'s filesystem, or a command name which will be looked up using the PATH environment variable (if set in the container).',
                type: 'string',
            }).positional('args', {
                desc: 'Zero or more arguments to pass to the program. The command line will not be parsed by a shell, so shell syntax is not supported.',
                type: 'string',
            }).option('c', {
                desc: 'Optionally specify the service name of the container to use, to override the default',
                type: 'string',
                requiresArg: true,
            }).example('$0 exec -c app -- bash -c set', 'In order to avoid command arguments being interpreted as dev arguments, you can optionally use a -- separator, as shown, before the command line to execute.')
    )
    .command('logs', 'Print the recent log output from a container that is part of the devSpec. Then, watch and continue to print any new log messages that arrive.',
        (yargs) =>
            yargs.option('c', {
                desc: 'Optionally specify the service name of the container to use, to override the default',
                type: 'string',
                requiresArg: true,
            })
    )
    .option('file', {alias: 'f', desc: 'File containing a YAML devSpec', type: 'string', requiresArg: true, default: DEFAULT_YAML_FILE})
    .parseSync();

async function run() {
    //Read the YAML data from the devSpec file
    let args = options._ as string[];
    let file = options.file;
    if (Array.isArray(file)) {
        throw 'You can only specify the --file option once.';
    }
    try {
        await fs.promises.stat(file);
    } catch {
        throw `Unable to find a file named ${file}. Try using the --help option.`;
    }
    const yaml = await fs.promises.readFile(file, 'utf8');

    //Change directory so that referenced files can be resolved relative to the
    //location of the yaml document
    process.chdir(path.dirname(file));

    let controller = new DevController(yaml);
    if (!args.length) {
        //Interactive mode requested
        return controller.repl();
    }
    const command = args.shift();
    switch (command) {
        case 'commands':
            return controller.commands();
        case 'status':
            return controller.status();
        case 'start':
            return controller.start(options['service'] as string);
        case 'stop':
            return controller.stop(options['service'] as string);
        case 'restart':
            return controller.restart(options['service'] as string);
        case 'init':
            return controller.init();
        case 'destroy':
            return controller.destroy();
        case 'sync':
            return controller.sync();
        case 'exec':
            if (!options['program'] && args.length) {
                options['program'] = args.shift();
            }
            if (!options['program']) {
                throw 'You must specify a program to run (see --help for details).';
            }
            if (Array.isArray(options['args'])) {
                args.unshift(...options['args']);
            }
            if (Array.isArray(options['c'])) {
                throw 'You can only specify the -c option once.';
            }
            return controller.exec(options['program'] as string, args, options['c'] as string);
        case 'logs':
            if (Array.isArray(options['c'])) {
                throw 'You can only specify the -c option once.';
            }
            return controller.logs(options['c'] as string);
        default:
            return controller.customAction(command, args);
    }
}

run()
    .catch(errorHandler);
