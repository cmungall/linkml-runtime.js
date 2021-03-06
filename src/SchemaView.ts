import {
    SchemaDefinition, Definition, ClassDefinition, SlotDefinition, ClassDefinitionName, SlotDefinitionName,
    EnumDefinition, TypeDefinition, EnumDefinitionName, TypeDefinitionName, Element
}
    from "./MetaModel";

export type Name = ClassDefinitionName | SlotDefinitionName

function isDefinition(x: Element | Name ): x is Element {
    return x!= undefined && (<Element>x).name !== undefined;
}


function _closure(f, x, reflexive=true) {
    let rv = []
    if (reflexive) {
        rv = [x]
    }
    let visited = []
    let todo = [x]
    while (todo.length > 0) {
        let i = todo.pop()
        visited.push(i)
        let vals = f(i)
        for (let v of vals) {
            if (!visited.includes(v)) {
                todo.push(v)
                rv.push(v)
            }
        }
    }
    return rv
}

function _not_false(v) {
    return v == undefined || v == true
}

interface TraversalSpecificOptions {
    mixins?: boolean,
    is_a?: boolean,
    reflexive?: boolean
}

interface ImportOptions {
    imports?: boolean,
}

interface WalkerOptions {
    mutate?: boolean,
}

export type TraversalOptions = TraversalSpecificOptions & ImportOptions

/**
 * operations over schemas
 */
export class SchemaView {
    schema: SchemaDefinition
    virtual_schema: SchemaDefinition

    constructor(schema: SchemaDefinition) {
        this.schema = schema
        this._index()
    }

    _index(): void {
        // TODO: merge imports
        this.virtual_schema = this.schema
    }

    /**
     * retrieve a ClassDefinition by its name
     *
     * @param name - class or class name
     */
    get_class(name: ClassDefinitionName | ClassDefinition): ClassDefinition {
        if (isDefinition(name)) {
            return name
        }
        else {
            return this.virtual_schema.classes[name]
        }
    }

    /**
     * retrieve a EnumDefinition by its name
     *
     * @param name - enum or enum name
     */
    get_enum(name: EnumDefinitionName | EnumDefinition): EnumDefinition {
        if (isDefinition(name)) {
            return name
        }
        else {
            return this.virtual_schema.enums[name]
        }
    }

    /**
     * retrieve a TypeDefinition by its name
     *
     * @param name - Type or Type name
     */
    get_type(name: TypeDefinitionName | TypeDefinition): TypeDefinition {
        if (isDefinition(name)) {
            return name
        }
        else {
            return this.virtual_schema.types[name]
        }
    }

    /**
     * retrieve a SlotDefinition by its name
     *
     * @param name - class or class name
     */
    get_slot(name: SlotDefinitionName | SlotDefinition): SlotDefinition {
        if (isDefinition(name)) {
            return name
        }
        else {
            if (this.virtual_schema.slots != undefined && name in this.virtual_schema.slots) {
                return this.virtual_schema.slots[name]
            }
            else {
                for (const [cn, c] of Object.entries(this.virtual_schema.classes)) {
                    if (c.attributes != undefined) {
                        for (const [k, attr] of Object.entries(c.attributes)) {
                            if (k == name) {
                                return attr
                            }
                        }
                    }
                }
                throw 'No such slot: ' + name
            }
        }
    }

    /**
     * All direct parents
     *
     * @param elt
     * @param opts
     */
    parents(elt: ClassDefinition | SlotDefinition, opts: TraversalOptions): Name[] {
        let parents = []
        if (_not_false(opts.is_a) && elt && elt.is_a != undefined) {
            parents = [elt.is_a]
        }
        if (_not_false(opts.mixins) && elt && elt.mixins != undefined) {
            parents = parents.concat(elt.mixins)
        }
        return parents
    }

    /**
     * Finds all ancestors for a class or slot
     *
     * @param elt
     * @param opts
     */
    ancestors(elt: ClassDefinition | SlotDefinition, opts: TraversalOptions): ClassDefinitionName[] {
        let t = this
        let f = function (x) {
            return t.parents(x, opts)
        }
        return _closure(f, elt)
    }

    /**
     * All direct parents
     *
     * @param elt
     * @param opts
     */
    class_parents(elt: ClassDefinitionName | ClassDefinition, opts: TraversalOptions): ClassDefinitionName[] {
        let c = this.get_class(elt)
        return this.parents(c, opts)
    }

    /**
     * All direct parents
     *
     * @param elt
     * @param opts
     */
    slot_parents(elt: SlotDefinitionName | SlotDefinition, opts: TraversalOptions = {}): SlotDefinitionName[] {
        let s = this.get_slot(elt)
        if (s == undefined) {
            throw 'No such slot: ' + elt
        }
        return this.parents(s, opts)
    }

    /**
     * Finds all ancestors for a class
     *
     * @param elt
     * @param opts
     */
    class_ancestors(elt: ClassDefinitionName | ClassDefinition, opts: TraversalOptions = {}): ClassDefinitionName[] {
        let t = this
        let f = function (x) {
            return t.class_parents(x, opts)
        }
        return _closure(f, elt)
    }

    /**
     * Finds all ancestors for a slot
     *
     * @param elt
     * @param opts
     */
    slot_ancestors(elt: SlotDefinitionName | SlotDefinition, opts: TraversalOptions = {}): SlotDefinitionName[] {
        let t = this
        let f = function (x) {
            return t.slot_parents(x, opts)
        }
        return _closure(f, elt)
    }

    merge_slot(base_slot: SlotDefinition, to_merge: SlotDefinition, isReflexive = false): SlotDefinition {
        if (to_merge == undefined) {
            return base_slot
        }
        for (const [k, v] of Object.entries(to_merge)) {
            if (!(k in base_slot) || base_slot[k] == undefined) {
                // base slot has priority
                base_slot[k] = v
            }
        }
        return base_slot
    }

    /**
     * Inferred slot for a slot/class combo
     *
     * @param slot_name
     * @param class_name
     * @param opts
     */
    induced_slot(slot_name: SlotDefinitionName, class_name: ClassDefinitionName | ClassDefinition,
                 opts: TraversalOptions = {}): SlotDefinition {
        if (class_name == undefined) {
            //throw 'Undefined class for slot:' + slot_name
        }
        if (slot_name == undefined) {
            throw 'No such slot ' + slot_name
        }
        const cls_ancs = this.class_ancestors(class_name)
        const slot_ancs = this.slot_ancestors(slot_name)
        let islot = {}
        this.merge_slot(islot, this.get_slot(slot_name))
        for (let cls_anc of cls_ancs) {
            let isReflexive = cls_anc == class_name
            let cls_anc_obj = this.get_class(cls_anc)
            if (cls_anc_obj == undefined) {
                throw 'No such ancestor ' + cls_anc + ' of ' + class_name
            }
            if (cls_anc_obj.attributes != undefined) {
                if (slot_name in cls_anc_obj.attributes) {
                    this.merge_slot(islot, cls_anc_obj.attributes[slot_name])
                }
            }
            if (cls_anc_obj.slot_usage != undefined) {
                if (slot_name in cls_anc_obj.slot_usage) {
                    this.merge_slot(islot, cls_anc_obj.slot_usage[slot_name], isReflexive)
                }
            }
        }
        for (let slot_anc of slot_ancs) {
            this.merge_slot(islot, this.get_slot(slot_anc))
        }
        return islot
    }

    /**
     * Get the range object for a slot
     *
     * @param slot
     */
    slotRange(slot: SlotDefinition): ClassDefinition | EnumDefinition | TypeDefinition {
        let r = slot.range
        if (this.schema.classes && r in this.schema.classes) {
            return this.get_class(r)
        }
        else if (this.schema.enums && r in this.schema.enums) {
            return this.get_class(r)
        }
        else if (this.schema.types && r in this.schema.types) {
            return this.get_type(r)
        }
        else {
            //throw 'Unknown range: ' + r + ' for slot: '+slot.name
        }
    }

    // DEPRECATED
    walk(obj: any, func: Function,
         cls: ClassDefinition | SlotDefinition | EnumDefinition = null,
         isCollection = false,
         opts: WalkerOptions = {mutate: false}): any {
        if (obj instanceof Array) {
            if (isCollection) {
                return obj.map(x => this.walk(x, func, cls))
            }
            else {
                throw 'Array in non-multivalued context: '+JSON.stringify(obj)
            }
        }
        else if (typeof obj == 'object') {
            let nuObj = {}
            if (isCollection) {
                // TODO: check not inlined as list
                for (const [k, v] of Object.entries(obj)) {
                    nuObj[k] = this.walk(v, func, cls, )
                }
            }
            else {
                for (const [k, v] of Object.entries(obj)) {
                    const slot = this.induced_slot(k, cls)
                    const range = slot.range
                    const range_cls = this.get_class(range) // TODO: enums
                    // TODO! tsgen should not make string here
                    nuObj[k] = this.walk(v, func, range_cls, slot.multivalued)
                }
            }
            return func(nuObj, cls)
        }
        else {
            if (isCollection) {
                throw 'Expected array '+JSON.stringify(obj)
            }
            return func(obj, cls)
        }
    }
}