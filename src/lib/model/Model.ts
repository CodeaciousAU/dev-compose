export interface FieldSpec {
    required?: boolean;
    nullable?: boolean;
    type?: 'string'|'number'|'boolean'|'object'|'array';
    schema?: Schema;
    members?: FieldSpec;
    default?: any;
    validate?: (input: any, context: string) => void;
    map?: (input: any, context: string) => any;
    rename?: string;
}

export interface ImportOptions {
    merge?: boolean;
    ignoreUnrecognizedKeys?: boolean;
}

export type Schema = {[key: string]: FieldSpec};

export class ValidationError extends Error {
    public readonly validationMessage: string;
    public readonly context: string;

    constructor(validationMessage: string, context: string, parentContext: string = null) {
        let fullContext = (parentContext === null) ? context : parentContext+':'+context;
        super('Validation error: '+validationMessage+' ('+fullContext+')');
        this.validationMessage = validationMessage;
        this.context = fullContext;
    }
}

export default abstract class Model {
    public static importModel<T extends object>(source: object, target: T, schema: Schema, context: string = null, options: ImportOptions = {}): T {
        if (typeof source !== 'object' || typeof target !== 'object' || source === null || target === null) {
            throw new Error('Expected an object');
        }

        options = Object.assign({merge: false, ignoreUnrecognizedKeys: false}, options);

        if (!options.ignoreUnrecognizedKeys) {
            for (let key in source) {
                if (!(key in schema)) {
                    throw new ValidationError('Unrecognized property', key, context);
                }
            }
        }

        for (let key in schema) {
            let fieldSpec = schema[key];
            if (!(key in source)) {
                if ('required' in fieldSpec && fieldSpec.required) {
                    throw new ValidationError('A required property is missing', key, context);
                }
                if (!options.merge || !(key in target)) {
                    target[key] = ('default' in fieldSpec) ? fieldSpec.default : null;
                }
                continue;
            }
            let value = Model.importField(
                source[key],
                target[key],
                fieldSpec,
                (context === null) ? key : context+':'+key,
                options
            );
            if ('rename' in fieldSpec && fieldSpec.rename !== null) {
                target[fieldSpec.rename] = value;
            } else {
                target[key] = value;
            }
        }

        return target;
    }

    public static importField(value: any, priorValue: any, fieldSpec: FieldSpec, context: string, options: ImportOptions = {}): any {
        if (value === null) {
            if (!('nullable' in fieldSpec) || !fieldSpec.nullable) {
                throw new ValidationError('Null is not a valid value for this property', context);
            }
            return null;
        }
        if ('type' in fieldSpec) {
            let foundType = Array.isArray(value) ? 'array' : typeof value;
            if (foundType !== fieldSpec.type) {
                throw new ValidationError('Expected type "'+fieldSpec.type+'", found "'+foundType+'"', context);
            }
        }
        if ('schema' in fieldSpec && fieldSpec.schema !== null) {
            if (typeof value !== 'object') {
                throw new ValidationError('Expected an object or array, found "'+(typeof value)+'"', context);
            }
            value = Model.importModel(
                value,
                (typeof priorValue === 'object' && priorValue !== null) ? priorValue : {},
                fieldSpec.schema,
                context,
                options
            );
        }
        if ('members' in fieldSpec && fieldSpec.members !== null) {
            if (typeof value !== 'object') {
                throw new ValidationError('Expected an object or array, found "'+(typeof value)+'"', context);
            }
            for (let key in value) {
                value[key] = Model.importField(value[key], null, fieldSpec.members, context+':'+key, options);
            }
        }
        if ('validate' in fieldSpec && fieldSpec.validate !== null) {
            fieldSpec.validate(value, context);
        }
        if ('map' in fieldSpec && fieldSpec.map !== null) {
            value = fieldSpec.map(value, context);
        }
        return value;
    }
}
