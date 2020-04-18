import * as cli from 'caporal';
import * as Color from 'colors/safe';
import * as fs from 'fs';
import * as path from 'path';

import DevController from "./lib/controller/DevController";

const VERSION = '1.0.0b2';
const DEFAULT_YAML_FILE = 'dev.yml';


//Handler to print the most useful message for a range of different error types
const errorHandler = (response) => {
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
};

//Define commands
cli.name('dev-compose')
    .bin('dev')
    .version(VERSION)
    .description('Manage a development environment configured by a YAML devSpec')
    .help('If no command is specified, this will start an interactive shell for running dev commands.')
    .argument('[cmd]', 'Try "commands" for a list of commands applicable to the environment', cli.STRING, '')
    .argument('[args...]', '')
    .option('-f, --file <file>', 'File containing a YAML devSpec', cli.STRING, DEFAULT_YAML_FILE)
    .action((args, options) => {
        let file = options.file;
        fs.readFile(file, 'utf8', (error, data) => {
            if (error) {
                errorHandler(error);
                return;
            }
            try {
                //Change directory so that referenced files can be resolved relative to the
                //location of the yaml document
                process.chdir(path.dirname(file));

                let controller = new DevController(data);
                if (args.cmd.length) {
                    controller.execute(args.cmd, args.args).catch(errorHandler);
                } else {
                    controller.repl().catch(errorHandler);
                }
            } catch (e) {
                errorHandler(e);
            }
        });
    });

//Parse arguments
cli.parse(process.argv);