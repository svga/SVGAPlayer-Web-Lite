// @ts-nocheck
/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
import $protobuf from "protobufjs/minimal.js";

const $Reader = $protobuf.Reader, $util = $protobuf.util;
const $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error;

const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const com = $root.com = (() => {

    const com = {};

    com.opensource = (function() {

        const opensource = {};

        opensource.svga = (function() {

            const svga = {};

            svga.MovieParams = (function() {

                const MovieParams = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                MovieParams.prototype.viewBoxWidth = 0;
                MovieParams.prototype.viewBoxHeight = 0;
                MovieParams.prototype.fps = 0;
                MovieParams.prototype.frames = 0;

                MovieParams.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.MovieParams(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.viewBoxWidth = value;
                                else
                                    delete message.viewBoxWidth;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.viewBoxHeight = value;
                                else
                                    delete message.viewBoxHeight;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.fps = value;
                                else
                                    delete message.fps;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.frames = value;
                                else
                                    delete message.frames;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return MovieParams;
            })();

            svga.SpriteEntity = (function() {

                const SpriteEntity = function (properties) {
                    this.frames = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                SpriteEntity.prototype.imageKey = "";
                SpriteEntity.prototype.frames = $util.emptyArray;
                SpriteEntity.prototype.matteKey = "";

                SpriteEntity.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.SpriteEntity(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.imageKey = value;
                                else
                                    delete message.imageKey;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.frames && message.frames.length))
                                    message.frames = [];
                                message.frames.push($root.com.opensource.svga.FrameEntity.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.matteKey = value;
                                else
                                    delete message.matteKey;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return SpriteEntity;
            })();

            svga.AudioEntity = (function() {

                const AudioEntity = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                AudioEntity.prototype.audioKey = "";
                AudioEntity.prototype.startFrame = 0;
                AudioEntity.prototype.endFrame = 0;
                AudioEntity.prototype.startTime = 0;
                AudioEntity.prototype.totalTime = 0;

                AudioEntity.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.AudioEntity(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.audioKey = value;
                                else
                                    delete message.audioKey;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.startFrame = value;
                                else
                                    delete message.startFrame;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.endFrame = value;
                                else
                                    delete message.endFrame;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.startTime = value;
                                else
                                    delete message.startTime;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.totalTime = value;
                                else
                                    delete message.totalTime;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return AudioEntity;
            })();

            svga.Layout = (function() {

                const Layout = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Layout.prototype.x = 0;
                Layout.prototype.y = 0;
                Layout.prototype.width = 0;
                Layout.prototype.height = 0;

                Layout.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.Layout(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.x = value;
                                else
                                    delete message.x;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.y = value;
                                else
                                    delete message.y;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.width = value;
                                else
                                    delete message.width;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.height = value;
                                else
                                    delete message.height;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Layout;
            })();

            svga.Transform = (function() {

                const Transform = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                Transform.prototype.a = 0;
                Transform.prototype.b = 0;
                Transform.prototype.c = 0;
                Transform.prototype.d = 0;
                Transform.prototype.tx = 0;
                Transform.prototype.ty = 0;

                Transform.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.Transform(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.a = value;
                                else
                                    delete message.a;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.b = value;
                                else
                                    delete message.b;
                                continue;
                            }
                        case 3: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.c = value;
                                else
                                    delete message.c;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.d = value;
                                else
                                    delete message.d;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.tx = value;
                                else
                                    delete message.tx;
                                continue;
                            }
                        case 6: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.ty = value;
                                else
                                    delete message.ty;
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return Transform;
            })();

            svga.ShapeEntity = (function() {

                const ShapeEntity = function (properties) {
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                ShapeEntity.prototype.type = 0;
                ShapeEntity.prototype.shape = null;
                ShapeEntity.prototype.rect = null;
                ShapeEntity.prototype.ellipse = null;
                ShapeEntity.prototype.styles = null;
                ShapeEntity.prototype.transform = null;

                let $oneOfFields;

                $Object.defineProperty(ShapeEntity.prototype, "args", {
                    get: $util.oneOfGetter($oneOfFields = ["shape", "rect", "ellipse"]),
                    set: $util.oneOfSetter($oneOfFields)
                });

                ShapeEntity.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 0)
                                    break;
                                if (value = reader.int32())
                                    message.type = value;
                                else
                                    delete message.type;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                message.shape = $root.com.opensource.svga.ShapeEntity.ShapeArgs.decode(reader, reader.uint32(), $undefined, _depth + 1, message.shape);
                                message.args = "shape";
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.rect = $root.com.opensource.svga.ShapeEntity.RectArgs.decode(reader, reader.uint32(), $undefined, _depth + 1, message.rect);
                                message.args = "rect";
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                message.ellipse = $root.com.opensource.svga.ShapeEntity.EllipseArgs.decode(reader, reader.uint32(), $undefined, _depth + 1, message.ellipse);
                                message.args = "ellipse";
                                continue;
                            }
                        case 10: {
                                if (wireType !== 2)
                                    break;
                                message.styles = $root.com.opensource.svga.ShapeEntity.ShapeStyle.decode(reader, reader.uint32(), $undefined, _depth + 1, message.styles);
                                continue;
                            }
                        case 11: {
                                if (wireType !== 2)
                                    break;
                                message.transform = $root.com.opensource.svga.Transform.decode(reader, reader.uint32(), $undefined, _depth + 1, message.transform);
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                ShapeEntity.ShapeType = (function() {
                    const valuesById = $Object.create(null), values = $Object.create(valuesById);
                    values[valuesById[0] = "SHAPE"] = 0;
                    values[valuesById[1] = "RECT"] = 1;
                    values[valuesById[2] = "ELLIPSE"] = 2;
                    values[valuesById[3] = "KEEP"] = 3;
                    return values;
                })();

                ShapeEntity.ShapeArgs = (function() {

                    const ShapeArgs = function (properties) {
                        if (properties)
                            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    ShapeArgs.prototype.d = "";

                    ShapeArgs.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity.ShapeArgs(), value;
                        while (reader.pos < end) {
                            let start = reader.pos;
                            let tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            let wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 2)
                                        break;
                                    if ((value = reader.stringVerify()).length)
                                        message.d = value;
                                    else
                                        delete message.d;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return ShapeArgs;
                })();

                ShapeEntity.RectArgs = (function() {

                    const RectArgs = function (properties) {
                        if (properties)
                            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    RectArgs.prototype.x = 0;
                    RectArgs.prototype.y = 0;
                    RectArgs.prototype.width = 0;
                    RectArgs.prototype.height = 0;
                    RectArgs.prototype.cornerRadius = 0;

                    RectArgs.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity.RectArgs(), value;
                        while (reader.pos < end) {
                            let start = reader.pos;
                            let tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            let wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.x = value;
                                    else
                                        delete message.x;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.y = value;
                                    else
                                        delete message.y;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.width = value;
                                    else
                                        delete message.width;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.height = value;
                                    else
                                        delete message.height;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.cornerRadius = value;
                                    else
                                        delete message.cornerRadius;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return RectArgs;
                })();

                ShapeEntity.EllipseArgs = (function() {

                    const EllipseArgs = function (properties) {
                        if (properties)
                            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    EllipseArgs.prototype.x = 0;
                    EllipseArgs.prototype.y = 0;
                    EllipseArgs.prototype.radiusX = 0;
                    EllipseArgs.prototype.radiusY = 0;

                    EllipseArgs.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity.EllipseArgs(), value;
                        while (reader.pos < end) {
                            let start = reader.pos;
                            let tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            let wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.x = value;
                                    else
                                        delete message.x;
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.y = value;
                                    else
                                        delete message.y;
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.radiusX = value;
                                    else
                                        delete message.radiusX;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.radiusY = value;
                                    else
                                        delete message.radiusY;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    return EllipseArgs;
                })();

                ShapeEntity.ShapeStyle = (function() {

                    const ShapeStyle = function (properties) {
                        if (properties)
                            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                    this[keys[i]] = properties[keys[i]];
                    };

                    ShapeStyle.prototype.fill = null;
                    ShapeStyle.prototype.stroke = null;
                    ShapeStyle.prototype.strokeWidth = 0;
                    ShapeStyle.prototype.lineCap = 0;
                    ShapeStyle.prototype.lineJoin = 0;
                    ShapeStyle.prototype.miterLimit = 0;
                    ShapeStyle.prototype.lineDashI = 0;
                    ShapeStyle.prototype.lineDashII = 0;
                    ShapeStyle.prototype.lineDashIII = 0;

                    ShapeStyle.decode = function (reader, length, _end, _depth, _target) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        if (_depth === $undefined)
                            _depth = 0;
                        if (_depth > $Reader.recursionLimit)
                            throw $Error("max depth exceeded");
                        let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity.ShapeStyle(), value;
                        while (reader.pos < end) {
                            let start = reader.pos;
                            let tag = reader.tag();
                            if (tag === _end) {
                                _end = $undefined;
                                break;
                            }
                            let wireType = tag & 7;
                            switch (tag >>>= 3) {
                            case 1: {
                                    if (wireType !== 2)
                                        break;
                                    message.fill = $root.com.opensource.svga.ShapeEntity.ShapeStyle.RGBAColor.decode(reader, reader.uint32(), $undefined, _depth + 1, message.fill);
                                    continue;
                                }
                            case 2: {
                                    if (wireType !== 2)
                                        break;
                                    message.stroke = $root.com.opensource.svga.ShapeEntity.ShapeStyle.RGBAColor.decode(reader, reader.uint32(), $undefined, _depth + 1, message.stroke);
                                    continue;
                                }
                            case 3: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.strokeWidth = value;
                                    else
                                        delete message.strokeWidth;
                                    continue;
                                }
                            case 4: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.int32())
                                        message.lineCap = value;
                                    else
                                        delete message.lineCap;
                                    continue;
                                }
                            case 5: {
                                    if (wireType !== 0)
                                        break;
                                    if (value = reader.int32())
                                        message.lineJoin = value;
                                    else
                                        delete message.lineJoin;
                                    continue;
                                }
                            case 6: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.miterLimit = value;
                                    else
                                        delete message.miterLimit;
                                    continue;
                                }
                            case 7: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.lineDashI = value;
                                    else
                                        delete message.lineDashI;
                                    continue;
                                }
                            case 8: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.lineDashII = value;
                                    else
                                        delete message.lineDashII;
                                    continue;
                                }
                            case 9: {
                                    if (wireType !== 5)
                                        break;
                                    if (!$Object.is(value = reader.float(), 0))
                                        message.lineDashIII = value;
                                    else
                                        delete message.lineDashIII;
                                    continue;
                                }
                            }
                            reader.skipType(wireType, _depth, tag);
                            if (!reader.discardUnknown) {
                                $util.makeProp(message, "$unknowns", false);
                                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                            }
                        }
                        if (_end !== $undefined)
                            throw $Error("missing end group");
                        return message;
                    };

                    ShapeStyle.RGBAColor = (function() {

                        const RGBAColor = function (properties) {
                            if (properties)
                                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                        this[keys[i]] = properties[keys[i]];
                        };

                        RGBAColor.prototype.r = 0;
                        RGBAColor.prototype.g = 0;
                        RGBAColor.prototype.b = 0;
                        RGBAColor.prototype.a = 0;

                        RGBAColor.decode = function (reader, length, _end, _depth, _target) {
                            if (!(reader instanceof $Reader))
                                reader = $Reader.create(reader);
                            if (_depth === $undefined)
                                _depth = 0;
                            if (_depth > $Reader.recursionLimit)
                                throw $Error("max depth exceeded");
                            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.ShapeEntity.ShapeStyle.RGBAColor(), value;
                            while (reader.pos < end) {
                                let start = reader.pos;
                                let tag = reader.tag();
                                if (tag === _end) {
                                    _end = $undefined;
                                    break;
                                }
                                let wireType = tag & 7;
                                switch (tag >>>= 3) {
                                case 1: {
                                        if (wireType !== 5)
                                            break;
                                        if (!$Object.is(value = reader.float(), 0))
                                            message.r = value;
                                        else
                                            delete message.r;
                                        continue;
                                    }
                                case 2: {
                                        if (wireType !== 5)
                                            break;
                                        if (!$Object.is(value = reader.float(), 0))
                                            message.g = value;
                                        else
                                            delete message.g;
                                        continue;
                                    }
                                case 3: {
                                        if (wireType !== 5)
                                            break;
                                        if (!$Object.is(value = reader.float(), 0))
                                            message.b = value;
                                        else
                                            delete message.b;
                                        continue;
                                    }
                                case 4: {
                                        if (wireType !== 5)
                                            break;
                                        if (!$Object.is(value = reader.float(), 0))
                                            message.a = value;
                                        else
                                            delete message.a;
                                        continue;
                                    }
                                }
                                reader.skipType(wireType, _depth, tag);
                                if (!reader.discardUnknown) {
                                    $util.makeProp(message, "$unknowns", false);
                                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                                }
                            }
                            if (_end !== $undefined)
                                throw $Error("missing end group");
                            return message;
                        };

                        return RGBAColor;
                    })();

                    ShapeStyle.LineCap = (function() {
                        const valuesById = $Object.create(null), values = $Object.create(valuesById);
                        values[valuesById[0] = "LineCap_BUTT"] = 0;
                        values[valuesById[1] = "LineCap_ROUND"] = 1;
                        values[valuesById[2] = "LineCap_SQUARE"] = 2;
                        return values;
                    })();

                    ShapeStyle.LineJoin = (function() {
                        const valuesById = $Object.create(null), values = $Object.create(valuesById);
                        values[valuesById[0] = "LineJoin_MITER"] = 0;
                        values[valuesById[1] = "LineJoin_ROUND"] = 1;
                        values[valuesById[2] = "LineJoin_BEVEL"] = 2;
                        return values;
                    })();

                    return ShapeStyle;
                })();

                return ShapeEntity;
            })();

            svga.FrameEntity = (function() {

                const FrameEntity = function (properties) {
                    this.shapes = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                FrameEntity.prototype.alpha = 0;
                FrameEntity.prototype.layout = null;
                FrameEntity.prototype.transform = null;
                FrameEntity.prototype.clipPath = "";
                FrameEntity.prototype.shapes = $util.emptyArray;

                FrameEntity.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.FrameEntity(), value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 5)
                                    break;
                                if (!$Object.is(value = reader.float(), 0))
                                    message.alpha = value;
                                else
                                    delete message.alpha;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                message.layout = $root.com.opensource.svga.Layout.decode(reader, reader.uint32(), $undefined, _depth + 1, message.layout);
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                message.transform = $root.com.opensource.svga.Transform.decode(reader, reader.uint32(), $undefined, _depth + 1, message.transform);
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.clipPath = value;
                                else
                                    delete message.clipPath;
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.shapes && message.shapes.length))
                                    message.shapes = [];
                                message.shapes.push($root.com.opensource.svga.ShapeEntity.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return FrameEntity;
            })();

            svga.MovieEntity = (function() {

                const MovieEntity = function (properties) {
                    this.images = {};
                    this.sprites = [];
                    this.audios = [];
                    if (properties)
                        for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null && keys[i] !== "__proto__")
                                this[keys[i]] = properties[keys[i]];
                };

                MovieEntity.prototype.version = "";
                MovieEntity.prototype.params = null;
                MovieEntity.prototype.images = $util.emptyObject;
                MovieEntity.prototype.sprites = $util.emptyArray;
                MovieEntity.prototype.audios = $util.emptyArray;

                MovieEntity.decode = function (reader, length, _end, _depth, _target) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    if (_depth === $undefined)
                        _depth = 0;
                    if (_depth > $Reader.recursionLimit)
                        throw $Error("max depth exceeded");
                    let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.com.opensource.svga.MovieEntity(), key, value;
                    while (reader.pos < end) {
                        let start = reader.pos;
                        let tag = reader.tag();
                        if (tag === _end) {
                            _end = $undefined;
                            break;
                        }
                        let wireType = tag & 7;
                        switch (tag >>>= 3) {
                        case 1: {
                                if (wireType !== 2)
                                    break;
                                if ((value = reader.stringVerify()).length)
                                    message.version = value;
                                else
                                    delete message.version;
                                continue;
                            }
                        case 2: {
                                if (wireType !== 2)
                                    break;
                                message.params = $root.com.opensource.svga.MovieParams.decode(reader, reader.uint32(), $undefined, _depth + 1, message.params);
                                continue;
                            }
                        case 3: {
                                if (wireType !== 2)
                                    break;
                                if (message.images === $util.emptyObject)
                                    message.images = {};
                                let end2 = reader.uint32() + reader.pos;
                                key = "";
                                value = [];
                                while (reader.pos < end2) {
                                    let tag2 = reader.tag();
                                    wireType = tag2 & 7;
                                    switch (tag2 >>>= 3) {
                                    case 1:
                                        if (wireType !== 2)
                                            break;
                                        key = reader.stringVerify();
                                        continue;
                                    case 2:
                                        if (wireType !== 2)
                                            break;
                                        value = reader.bytes();
                                        continue;
                                    }
                                    reader.skipType(wireType, _depth, tag2);
                                }
                                if (key === "__proto__")
                                    $util.makeProp(message.images, key);
                                message.images[key] = value;
                                continue;
                            }
                        case 4: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.sprites && message.sprites.length))
                                    message.sprites = [];
                                message.sprites.push($root.com.opensource.svga.SpriteEntity.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        case 5: {
                                if (wireType !== 2)
                                    break;
                                if (!(message.audios && message.audios.length))
                                    message.audios = [];
                                message.audios.push($root.com.opensource.svga.AudioEntity.decode(reader, reader.uint32(), $undefined, _depth + 1));
                                continue;
                            }
                        }
                        reader.skipType(wireType, _depth, tag);
                        if (!reader.discardUnknown) {
                            $util.makeProp(message, "$unknowns", false);
                            (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                        }
                    }
                    if (_end !== $undefined)
                        throw $Error("missing end group");
                    return message;
                };

                return MovieEntity;
            })();

            return svga;
        })();

        return opensource;
    })();

    return com;
})();

export {
  $root as default
};
