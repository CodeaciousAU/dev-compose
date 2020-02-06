import Model, {ImportOptions, Schema, ValidationError} from "./Model";

export interface DevSpecCommandDefaults {
    service: string;
    user: string;
    working_dir: string;
    environment: {[key: string]: string};
}

export interface DevSpecAction extends DevSpecCommandDefaults {
    command: string;
    handler: string;
    args: string[];
}

export default class DevSpec extends Model {
    version: string;
    buildkit: boolean;
    services: object;
    networks: object;
    volumes: object;
    command_defaults: DevSpecCommandDefaults;
    handlers: {[name: string]: DevSpecAction[]};

    constructor(yamlModel: object) {
        super();
        this.import(yamlModel);
    }

    public import(yamlModel: object, options: ImportOptions={}): void {
        Model.importModel(yamlModel, this, DevSpec.SCHEMA, null, options);
    }

    public getActionsForHandlerName(handlerName: string): DevSpecAction[] {
        return (handlerName in this.handlers) ? this.handlers[handlerName] : [];
    }

    public hasActionsForHandlerName(handlerName: string): boolean {
        return ((handlerName in this.handlers) && this.handlers[handlerName].length > 0);
    }

    public get serviceNames(): string[] {
        return (this.services !== null) ? Object.keys(this.services) : [];
    }

    public get defaultServiceName(): string {
        if (this.command_defaults.service !== null) {
            return this.command_defaults.service;
        }
        let serviceNames = this.serviceNames;
        if (serviceNames.length > 0) {
            return serviceNames[0];
        }
        return null;
    }

    public generateComposeModel(): object {
        let model = {};
        for (let key of ['version', 'services', 'networks', 'volumes']) {
            if (this[key] !== null) {
                model[key] = this[key]
            }
        }
        return JSON.parse(JSON.stringify(model));
    }

    public static SCHEMA: Schema = {
        version: {type: 'string'},
        buildkit: {type: 'boolean', default: true},
        services: {type: 'object'},
        networks: {type: 'object'},
        volumes: {type: 'object'},
        command_defaults: {
            type: 'object',
            default: {service: null, user: null, working_dir: null, environment: {}},
            schema: {
                service: {type: 'string'},
                user: {type: 'string'},
                working_dir: {type: 'string'},
                environment: {
                    type: 'object',
                    default: {},
                    members: {type: 'string'},
                },
            },
        },
        handlers: {
            type: 'object',
            default: {},
            members: {
                type: 'array',
                members: {
                    type: 'object',
                    schema: {
                        service: {type: 'string'},
                        user: {type: 'string'},
                        working_dir: {type: 'string'},
                        environment: {
                            type: 'object',
                            default: {},
                            members: {type: 'string'},
                        },
                        command: {type: 'string'},
                        handler: {type: 'string'},
                        args: {
                            type: 'array',
                            members: {type: 'string'},
                        }
                    },
                    validate: (input: DevSpecAction, context: string) => {
                        if (input.command === null && input.handler === null) {
                            throw new ValidationError('Either "command" or "handler" must be specified', context);
                        } else if (input.command !== null && input.handler !== null) {
                            throw new ValidationError('Cannot specify both "command" and "handler" for a single action', context);
                        }
                    },
                },
            },
        },
    };
}