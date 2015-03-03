/*!
 * GoIO-client
 * https://github.com/Kimgils/goio-client
 * Copyright (c) 2015 King Chung (@Kimgils)
 * Licensed MIT
 */

(function(root, factory) {

    // Set up GoIO appropriately for the environment. Start with AMD.
    if (typeof define === 'function' && define.amd) {
        //jqueryXDomainRequest
        define(['jquery', 'jqueryXDomainRequest', 'exports'], function($, jqueryXDomainRequest, exports) {
            // Export global even in AMD case in case this script is loaded with
            // others that may still expect a global GoIO.
            root.GoIO = factory(exports, $);
        });

        // Next for Node.js or CommonJS. jQuery may not be needed as a module.
    } else if (typeof exports !== 'undefined') {
        factory(exports, $);

        // Finally, as a browser global.
    } else {
        root.GoIO = factory({}, (root.jQuery || root.$));
    }

}(this, function(GoIO, $) {

    GoIO.settings = {
        api: "",
        debug: false
    };

    GoIO.init = function(options) {
        $.extend(true, GoIO.settings, options || {});
        if("" == GoIO.settings.api) {
            throw "Please configuare the api url.";
        }
        return GoIO;
    }

    GoIO.debug = function(){
        if( ! GoIO.settings.debug || ! window.console) return;
        var args = Array.prototype.slice.call(arguments, 0);
        console.log('#GOIO#');
        console.log(args);
    }

    //Utils
    var _ioUtil = {
        once: function(func){
            var memo = false, times = 1;
            return function(){
                if(times--) { 
                    memo = func.apply(this, arguments);
                } else {
                    func = null;
                }
                return memo;
            }
        },
        keys: function(obj){
            if ('object' != typeof obj) return [];
            if (Object.keys) return Object.keys(obj);
            var keys = [];
            for (var key in obj) {
                if (obj != null && hasOwnProperty.call(obj, key)) {
                    keys.push(key)
                }
            }
            return keys;
        },
        each: function(obj, iteratee, context){
            if (obj == null) return obj;
            for(var i in obj) {
                iteratee.apply(context || this, [obj[i], i]);
            }
            return obj;
        },
        extend: function(obj){
            if ('object' != typeof obj) return obj;
            var source, prop;
            for (var i = 1, length = arguments.length; i < length; i++) {
              source = arguments[i];
              for (prop in source) {
                if (hasOwnProperty.call(source, prop)) {
                    obj[prop] = source[prop];
                }
              }
            }
            return obj;
        },
        format: function(urlObj) {
            var paths = [];
            if (!urlObj) {
                GoIO.debug('url Object is missing.');
            }

            urlObj.hostname = urlObj.hostname || GoIO.settings.api;

            paths.push(urlObj.hostname);
            if (urlObj.pathnames instanceof Array) {
                for (var i in urlObj.pathnames) {
                    paths.push(urlObj.pathnames[i]);
                }
            }

            return paths.join('/') + '?t=' + (new Date()).getTime();
        }
    }

    var _ioEvent = {
        on: function(name, callback, context){
            this._events || (this._events = {});
            if(!name || !callback) {return this;}
            var events = this._events[name] || (this._events[name] = []);
            events.push({callback: callback, context: context, ctx: context || this});
            return this;
        },
        once: function(name, callback, context){
            var self = this;
            var once = _ioUtil.once(function(){
                self.off(name, callback);
                callback.apply(context || self, arguments);
            });
            once._callback = callback;
            return this.on(name, once, context);
        },
        off: function(name, callback, context){
            var i, j, ev, names, events, retain;
            var args = [].slice.call(arguments);
            if(!args.length) {
                this._events = void 0;
            }
            names = name ? [name] : _ioUtil.keys(this._events);
            for(i = 0; i < names.length; i++) {
                name = names[i];
                if(events = this._events[name]) {
                    this._events[name] = retain = [];
                    if(callback || context) {
                        for(j = 0; j < events.length; j++) {
                            ev = events[j];
                            if((callback && callback !== ev.callback && callback !== ev.callback._callback) || (context && context !== ev.context)) {
                                retain.push(ev);
                            }
                        }
                    }
                }
                if(!retain.length) {
                    delete this._events[name];
                }
            }
            return this;
        },
        trigger: function(name){
            var i, ev, events, args = [].slice.call(arguments, 1);
            if (events = this._events[name]) {
                for (i = 0; i < events.length; i++) {
                    ev = events[i];
                    if("function" == typeof ev.callback) {
                        ev.callback.apply(ev.ctx, args);
                    }
                }
            }
            return this;
        }
    }

    var IO = function() {
        var that = this;
        this._clientId = '';
        this._eventEngine = _ioUtil.extend({}, _ioEvent);

        this._eventLoopFlag = false;

        this._connected = false;
        this._disconnected = false;
        this._eventEngine.on('connected', function() {
            that._connected = true;
            that._eventLoop();
        });
        this._callbacks = {};
        this._rooms = {};
        this._data = {};

        this.userId = '';
    }

    _ioUtil.extend(IO.prototype, {
        _packetHandler: function(packet) {
            var eventName = packet.eventName,
                data = packet.data,
                roomId = packet.roomId,
                userId = packet.uId;
            switch (eventName) {
                case 'broadcast':
                    this._eventEngine.trigger('broadcast', roomId, eventName, data, userId);
                    break;
                case 'leave':
                    this._eventEngine.trigger('leave', roomId, userId);
                    GoIO.debug('SOME ONE LEAVE', roomId, userId);
                    break;
                case 'join':
                    this._eventEngine.trigger('join', roomId, userId);
                    GoIO.debug('SOME ONE JOIN', roomId, userId);
                    break;
                case 'connect':
                    this._eventEngine.trigger('connect', roomId, userId);
                    break;
                case 'error':
                    GoIO.debug(data);
                    break;
            }
        },
        _eventLoop: function() {
            var that = this;
            //Singleton
            // if(this._eventLoopFlag) {
            //     return;
            // }
            // this._eventLoopFlag = true;
            GoIO.debug('EVENT LOOP INIT');
            var eventLoop = function() {
                if (that._connected) {
                    that._get(null, function(packets) {
                        for (var i in packets) {
                            that._packetHandler(packets[i]);
                        }
                        eventLoop();
                    });
                }
            }
            eventLoop();
        },
        _encodePacket: function(packet) {
            packet = packet || {};
            var eventName = packet.eventName || '',
                data = JSON.stringify(packet.data || {}),
                roomId = packet.roomId || '';

            return JSON.stringify({
                "e": eventName,
                "r": roomId,
                "c": "",
                "d": data
            });
        },
        _decodePackets: function(messages) {
            var packets = [];
            if (messages) {
                try {
                    messages = JSON.parse(messages);
                    if (messages instanceof Array) {
                        for (var i in messages) {
                            packets.push(this._decodePacket(messages[i]));
                        }
                    }
                } catch (e) {
                    GoIO.debug(e, "L126");
                }
            }
            return packets;
        },
        _decodePacket: function(message) {
            if (!message) {
                return {};
            }

            return {
                eventName: message.e || '',
                roomId: message.r || '',
                uId: message.c || '',
                data: message.d ? JSON.parse(message.d) : null
            };
        },
        _post: function(packet, callback) {
            var that = this;
            this._postStack = this._postStack || [];
            if (this._posting) {
                this._postStack.push([packet, callback]);
                return;
            }

            this._posting = true;
            var run = function(packet, callback) {
                var clientId = that._clientId;
                //Encode the packet
                var message = that._encodePacket(packet);
                var url = _ioUtil.format({
                    pathnames: [
                        'message',
                        clientId
                    ]
                });
                $.ajax({
                        url: url,
                        type: 'POST',
                        dataType: 'json',
                        crossDomain: true,
                        cache: false,
                        contentType: 'text/plain; charset=utf-8',
                        data: message
                    })
                    .fail(function(response) {
                        if (response && 200 != response.status) {
                            that._postStack.unshift(packet);
                            that._connected = false;
                            if (!that._disconnected) {
                                that._reconnect();
                            }
                            GoIO.debug("IO POST FAIL:", response);
                        }
                    })
                    .complete(function() {
                        if ("function" == typeof callback) {
                            callback();
                        }

                        if (0 < that._postStack.length) {
                            run.apply(this, that._postStack.shift());
                        } else {
                            that._posting = false;
                        }
                    });
            }

            run(packet, callback);
        },
        _get: function(packet, callback) {
            var that = this,
                clientId = this._clientId;

            //Encode the packet
            //var message = this._encodePacket(packet);
            var url = _ioUtil.format({
                pathnames: [
                    'message',
                    clientId
                ]
            });
            $.ajax({
                    url: url,
                    dataType: 'text',
                    crossDomain: true,
                    cache: false,
                    //data: message
                })
                .done(function(response) {
                    if ("function" == typeof callback) {
                        callback(that._decodePackets(response));
                    }
                })
                .fail(function(response) {
                    that._connected = false;
                    if (!that._disconnected) {
                        that._reconnect();
                    }
                    GoIO.debug("IO GET FAIL:", response);
                });
        },
        _reconnect: function() {
            var that = this,
                INTERVAL = null;

            if (this._reconnecting) {
                return;
            }
            this._reconnecting = true;
            var once = function() {
                var ran = false;
                return function() {
                    if (ran) {
                        return;
                    }
                    ran = true;
                    that._eventEngine.once('connected', function() {
                        clearTimeout(INTERVAL);
                        var roomIds = _ioUtil.keys(that._rooms);
                        for (var i in roomIds) {
                            if (roomIds[i] && '' !== roomIds[i]) {
                                that.join(roomIds[i]);
                            }
                        }

                        for (var key in that._data) {
                            that.set(key, that._data[key]);
                        }

                        that._reconnecting = false;
                    });
                }
            }();

            var reconnect = function() {
                if (!that._connected) {
                    that._connect(that.userId);
                    INTERVAL = setTimeout(function() {
                        reconnect();
                    }, 5000);
                    once();
                }
            }

            reconnect();
        },
        _connect: function(userId) {
            var that = this;
            this.userId = userId;

            var url = _ioUtil.format({
                pathnames: [
                    'client',
                    userId
                ]
            });
            $.ajax({
                    url: url,
                    type: 'POST',
                    dataType: 'text',
                    contentType: 'text/plain',
                    crossDomain: true,
                    cache: false
                })
                .done(function(clientId) {
                    if ("" !== clientId) {
                        that._clientId = clientId;
                    }
                    that._eventEngine.trigger('connected');
                });
        },
        _delay: function(callback) {
            if (this._connected) {
                callback();
            } else {
                this._eventEngine.once('connected', callback);
            }
        },
        initialize: function(userId) {
            var that = this;
            this._connect(userId);
        },
        disconnect: function() {
            var that = this;
            var url = _ioUtil.format({
                pathnames: [
                    'kill_client',
                    this._clientId
                ]
            });
            $.ajax({
                    url: url,
                    dataType: 'text',
                    crossDomain: true,
                    cache: false
                })
                .done(function() {
                    that._connected = false;
                    that._disconnected = true;
                })
                .fail(function() {
                    GoIO.debug('Can not kill client.');
                });
        },
        on: function(roomId, eventName, callback) {
            this._rooms[roomId]['bcCallbacks'] = this._rooms[roomId]['bcCallbacks'] || {};
            this._rooms[roomId]['bcCallbacks'][eventName] = function(rId, en, data, userId) {
                if (roomId == rId && eventName == data.name && "function" == typeof callback) {
                    callback(userId, data.args);
                }
            };
            this._eventEngine.on('broadcast', this._rooms[roomId]['bcCallbacks'][eventName]);
        },
        once: function(roomId, eventName, callback) {
            this._eventEngine.once('broadcast', function(rId, en, data, userId) {
                if (roomId == rId && eventName == data.name && "function" == typeof callback) {
                    callback(userId, data.args);
                }
            });
        },
        off: function() {
            var self = this;
            var args = [].slice.call(arguments);
            if (!args.length) {
                _ioUtil.each(this._rooms, function(room) {
                    _ioUtil.each(room['bcCallbacks'], function(cb) {
                        self._eventEngine.off('broadcast', cb);
                    });
                });
            } else if (1 == args.length) {
                var roomId = args[0];
                if (this._rooms[roomId] && this._rooms[roomId]['bcCallbacks']) {
                    _ioUtil.each(this._rooms[roomId]['bcCallbacks'], function(cb) {
                        self._eventEngine.off('broadcast', cb);
                    });
                }
            }
        },
        emit: function(roomId, eventName, data) {
            this._post({
                eventName: 'broadcast',
                data: {
                    name: eventName,
                    args: data
                },
                roomId: roomId
            });
        },
        join: function(roomId, callback) {
            var that = this;
            if (!this._rooms[roomId]) {
                this._rooms[roomId] = {
                    "id": roomId
                };
            }
            GoIO.debug('GOIO JOIN ROOM', roomId);
            this._delay(function() {
                that._post({
                    eventName: 'join',
                    roomId: roomId
                }, callback);
            });
        },
        leave: function(roomId) {
            var that = this;
            GoIO.debug('GOIO LEAVE ROOM', roomId);
            if (this._rooms[roomId]) {
                delete this._rooms[roomId];
            }
            this._delay(function() {
                that._post({
                    eventName: 'leave',
                    roomId: roomId
                });
            });
        },
        set: function(key, value) {
            var that = this,
                clientId = this._clientId;

            var data = {};
            data[key] = value;

            var url = _ioUtil.format({
                pathnames: [
                    'user/data',
                    clientId,
                    key
                ]
            });
            $.ajax({
                url: url,
                type: 'POST',
                dataType: 'json',
                contentType: 'text/plain; charset=utf-8',
                data: JSON.stringify(data),
                crossDomain: true,
                cache: false
            });

            this._data = this._data || {};
            this._data[key] = value;

            GoIO.debug('SET DATA', key, value);
        },
        get: function(userId, key, callback) {
            var that = this;
            var url = _ioUtil.format({
                pathnames: [
                    'user/data',
                    userId,
                    key
                ]
            });
            $.ajax({
                    url: url,
                    dataType: 'text',
                    crossDomain: true,
                    cache: false
                })
                .done(function(response) {
                    var data = null;
                    try {
                        data = JSON.parse(response);
                    } catch (e) {
                        data = response;
                    }

                    if ('function' == typeof callback) {
                        callback(data);
                    }
                })
                .fail(function(response) {
                    GoIO.debug("IO GET DATA FAIL:", response);
                })
                .always(function(response) {
                    //GoIO.debug("IO GET COMPLETE:", response);
                });
        },
        setRoomData: function(roomId, key, value) {
            var data = {};
            data[key] = value;

            var url = _ioUtil.format({
                pathnames: [
                    'room/data',
                    roomId,
                    key
                ]
            });
            $.ajax({
                url: url,
                type: 'POST',
                dataType: 'json',
                contentType: 'text/plain; charset=utf-8',
                data: JSON.stringify(data),
                crossDomain: true,
                cache: false
            });

            this._data = this._data || {};
            this._data[key] = value;

            GoIO.debug('SET ROOM DATA', key, value);
        },
        getRoomData: function(roomId, key, callback){
            var url = _ioUtil.format({
                pathnames: [
                    'room/data',
                    roomId,
                    key
                ]
            });
            $.ajax({
                url: url,
                dataType: 'text',
                crossDomain: true,
                cache: false
            })
            .done(function(response) {
                var data = null;
                try {
                    data = JSON.parse(response);
                } catch (e) {
                    data = response;
                }

                if ('function' == typeof callback) {
                    callback(data);
                }
            })
            .fail(function(response) {
                GoIO.debug("IO GET ROOM DATA FAIL:", response);
            })
            .always(function(response) {
                //GoIO.debug("IO GET COMPLETE:", response);
            });
        },
        getRoomUsers: function(roomId, callback) {
            var that = this;
            var url = _ioUtil.format({
                pathnames: [
                    'room/users',
                    roomId
                ]
            });
            $.ajax({
                    url: url,
                    dataType: 'text',
                    crossDomain: true,
                    cache: false
                })
                .done(function(response) {
                    var data = null;
                    try {
                        data = JSON.parse(response);
                    } catch (e) {
                        data = response;
                    }

                    if ('function' == typeof callback) {
                        callback(data);
                    }
                })
                .fail(function(response) {
                    GoIO.debug("IO GET DATA FAIL:", response);
                })
                .always(function(response) {
                    //GoIO.debug("IO GET COMPLETE:", response);
                });
        },
        getUserOnlineStatus: function(userIds, callback) {
            var ids = [];
            if ('string' == typeof userIds) {
                ids.push(userIds);
            } else if (userIds instanceof Array) {
                ids = userIds;
            } else {
                GoIO.debug("Param is invalid.");
            }

            var url = _ioUtil.format({
                pathnames: [
                    'online_status',
                ]
            });

            $.ajax({
                    type: 'POST',
                    url: url,
                    dataType: 'text',
                    contentType: 'text/plain; charset=utf-8',
                    data: ids.join(','),
                    crossDomain: true,
                    cache: false
                })
                .done(function(response) {
                    if ('function' == typeof callback) {
                        if ('string' == typeof response) {
                            var res = {};
                            var status = response.split(',');
                            ids.map(function(id, index) {
                                res[id] = parseInt(status[index]);
                            });
                        }
                        callback(res);
                    }
                })
                .fail(function(errors) {
                    GoIO.debug(errors);
                });
        },

        //Global events
        onJoin: function(callback) {
            this._eventEngine.on('join', function(roomId, userId) {
                if ('function' == typeof callback) {
                    callback(roomId, userId);
                }
            });
        },
        onLeave: function(callback) {
            this._eventEngine.on('leave', function(roomId, userId) {
                if ('function' == typeof callback) {
                    callback(roomId, userId);
                }
            });
        },
        onConnect: function(roomId, callback) {
            this._eventEngine.on('connect', function(rId, uId) {
                if (rId == roomId) {
                    callback(uId);
                }
            });
        }
    });

    IO.prototype.ready = IO.prototype._delay;

    GoIO.io = new IO();

    return GoIO;
}));